import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getAccessToken,
  getBroadcasterId,
  getClips,
  getGames,
  TwitchError,
} from "../../lib/twitch";
import {
  isSameOrigin,
  checkTwitchBudget,
  writeTwitchBudget,
  json,
} from "../../lib/utils";

const gameNameCache = new Map<string, string>();
const CLIP_PAGE_CACHE_TTL = 60; // seconds

const RANGE_HOURS: Record<string, number> = {
  "24h": 24,
  "7d": 7 * 24,
  "30d": 30 * 24,
};

function resolveStartedAt(
  startedAtParam: string | null,
  timeRange: string,
): string | undefined {
  if (startedAtParam) return startedAtParam;
  const hours = RANGE_HOURS[timeRange];
  return hours
    ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
    : undefined;
}

function clipPageCacheKey(
  broadcasterId: string,
  startedAt: string | undefined,
  endedAt: string | undefined,
  after: string | undefined,
): string {
  return `clips:${broadcasterId}:${startedAt ?? ""}:${endedAt ?? ""}:${after ?? ""}`;
}

async function hydrateGameNameCache(
  gameIds: string[],
  token: string,
  onBudget?: (b: { remaining: number | null; resetAt: number | null }) => void,
) {
  const uncached = gameIds.filter((id) => !gameNameCache.has(id));
  if (uncached.length === 0) return;
  const games = await getGames(uncached, token, { onBudget });
  for (const g of games) gameNameCache.set(g.id, g.name);
}

function attachGameNames(clips: any[]): any[] {
  return clips.map((clip) => ({
    ...clip,
    game_name:
      gameNameCache.get(clip.game_id) ||
      (clip.game_id ? "Loading..." : "No Category"),
  }));
}

export const GET: APIRoute = async ({ request }: any) => {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  // Skip the per-IP KV rate limit for /api/clips — the Twitch-budget
  // gate below is the authoritative defense against Twitch's 800/min
  // limit, and the per-IP limiter was rejecting legitimate "Load all
  // clips" runs. We still rely on the Twitch-budget gate to shed load.
  // (The KV limit is kept for the other endpoints where each call is
  // user-initiated rather than part of a paginated burst.)

  const twitchBudget = await checkTwitchBudget(env);
  if (!twitchBudget.allowed) {
    return new Response(
      JSON.stringify({
        error: "Server is pacing requests to stay under Twitch's limit. Please slow down.",
        retryAfter: twitchBudget.retryAfter ?? 5,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(twitchBudget.retryAfter ?? 5),
          "X-RateLimit-Source": "twitch-budget",
        },
      },
    );
  }

  const params = new URL(request.url).searchParams;
  const channel = params.get("channel");
  const timeRange = params.get("timeRange") || "all";
  const after = params.get("after") || undefined;
  const startedAtParam = params.get("startedAt");
  const endedAt = params.get("endedAt") || undefined;

  if (!channel) return json({ error: "Channel name is required" }, 400);

  try {
    const token = await getAccessToken();
    const broadcasterId = await getBroadcasterId(channel, token);
    if (!broadcasterId) return json({ error: "Channel not found" }, 404);

    const startedAt = resolveStartedAt(startedAtParam, timeRange);
    const cacheKey = clipPageCacheKey(broadcasterId, startedAt, endedAt, after);
    const cacheKv = (env as { CLIP_CACHE_KV?: KVNamespace }).CLIP_CACHE_KV;

    let clipsData: Awaited<ReturnType<typeof getClips>> | null = null;
    if (cacheKv) {
      const cached = await cacheKv.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          clipsData = {
            data: parsed.data,
            pagination: parsed.pagination,
            rateLimit: { remaining: null, limit: null, resetAt: null },
          };
        } catch {
          // ignore parse errors and fall through to live fetch
        }
      }
    }

    if (!clipsData) {
      clipsData = await getClips(broadcasterId, token, {
        started_at: startedAt,
        ended_at: endedAt,
        first: 100,
        after,
        onBudget: (b) =>
          writeTwitchBudget(env, b.remaining, b.resetAt),
      });
      if (cacheKv && clipsData.data.length > 0 && !clipsData.pagination.cursor) {
        // Only cache the final page of a window — cursors are opaque and
        // short-lived, so caching an intermediate page would risk staleness
        // and prevent the client from progressing.
        await cacheKv.put(
          cacheKey,
          JSON.stringify({
            data: clipsData.data,
            pagination: clipsData.pagination,
          }),
          { expirationTtl: CLIP_PAGE_CACHE_TTL },
        );
      }
    }

    const gameIds = [
      ...new Set(clipsData.data.map((clip: any) => clip.game_id)),
    ].filter((id) => id !== "") as string[];

    await hydrateGameNameCache(
      gameIds,
      token,
      (b) => writeTwitchBudget(env, b.remaining, b.resetAt),
    );

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const rl = clipsData.rateLimit;
    if (rl.remaining != null) headers["X-Twitch-Ratelimit-Remaining"] = String(rl.remaining);
    if (rl.limit != null) headers["X-Twitch-Ratelimit-Limit"] = String(rl.limit);
    if (rl.resetAt != null) headers["X-Twitch-Ratelimit-Reset"] = String(rl.resetAt);

    return new Response(
      JSON.stringify({
        clips: attachGameNames(clipsData.data),
        pagination: clipsData.pagination,
        broadcasterId,
      }),
      { status: 200, headers },
    );
  } catch (error: any) {
    if (error instanceof TwitchError) {
      if (error.status === 429) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Retry-After": String(error.retryAfter ?? 5),
          "X-RateLimit-Source": "twitch",
        };
        if (error.rateLimit.remaining != null)
          headers["X-Twitch-Ratelimit-Remaining"] = String(error.rateLimit.remaining);
        if (error.rateLimit.resetAt != null)
          headers["X-Twitch-Ratelimit-Reset"] = String(error.rateLimit.resetAt);
        return new Response(
          JSON.stringify({
            error: "Twitch rate limit reached. Please slow down.",
            retryAfter: error.retryAfter ?? 5,
          }),
          { status: 429, headers },
        );
      }
      console.error("Twitch upstream error:", error.message);
      return json({ error: "Twitch upstream error" }, 502);
    }
    console.error("Error in clips API:", error);
    return json({ error: error.message }, 500);
  }
};

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void>;
}
