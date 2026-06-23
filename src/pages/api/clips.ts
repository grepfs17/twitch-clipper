import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  getAccessToken,
  getBroadcasterId,
  getClips,
  getGames,
} from "../../lib/twitch";
import { isSameOrigin, checkRateLimit } from "../../lib/utils";

const gameNameCache = new Map<string, string>();

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

async function hydrateGameNameCache(gameIds: string[], token: string) {
  const uncached = gameIds.filter((id) => !gameNameCache.has(id));
  if (uncached.length === 0) return;
  const games = await getGames(uncached, token);
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

  const rateLimit = await checkRateLimit(request, env, {
    maxRequests: 30,
    windowSec: 60,
  });
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rateLimit.retryAfter),
      },
    });
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

    const clipsData = await getClips(broadcasterId, token, {
      started_at: resolveStartedAt(startedAtParam, timeRange),
      ended_at: endedAt,
      first: 100,
      after,
    });

    const gameIds = [
      ...new Set(clipsData.data.map((clip: any) => clip.game_id)),
    ].filter((id) => id !== "") as string[];

    await hydrateGameNameCache(gameIds, token);

    return json(
      {
        clips: attachGameNames(clipsData.data),
        pagination: clipsData.pagination,
        broadcasterId,
      },
      200,
    );
  } catch (error: any) {
    console.error("Error in clips API:", error);
    return json({ error: error.message }, 500);
  }
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
