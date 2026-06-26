import type { APIRoute } from "astro";
import { TWITCH_CLIENT_ID } from "astro:env/server";
import { getAccessToken, getBroadcasterId, getGames } from "../../lib/twitch";
import { isSameOrigin, json } from "../../lib/utils";

export const GET: APIRoute = async ({ request }: any) => {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  const params = new URL(request.url).searchParams;
  const channel = params.get("channel");
  const timeRange = params.get("timeRange") || "all";
  const after = params.get("after") || undefined;
  const startedAt = params.get("startedAt") || undefined;
  const endedAt = params.get("endedAt") || undefined;

  if (!channel) return json({ error: "Channel name is required" }, 400);

  try {
    const token = await getAccessToken();
    const broadcasterId = await getBroadcasterId(channel, token);
    if (!broadcasterId) return json({ error: "Channel not found" }, 404);

    const twitchUrl = new URL("https://api.twitch.tv/helix/clips");
    twitchUrl.searchParams.append("broadcaster_id", broadcasterId);
    if (startedAt) twitchUrl.searchParams.append("started_at", startedAt);
    if (endedAt) twitchUrl.searchParams.append("ended_at", endedAt);
    twitchUrl.searchParams.append("first", "100");
    if (after) twitchUrl.searchParams.append("after", after);

    const twitchRes = await fetch(twitchUrl.toString(), {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID!,
        Authorization: `Bearer ${token}`,
      },
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const remaining = twitchRes.headers.get("Ratelimit-Remaining");
    const limit = twitchRes.headers.get("Ratelimit-Limit");
    const reset = twitchRes.headers.get("Ratelimit-Reset");
    if (remaining != null) headers["X-Twitch-Ratelimit-Remaining"] = remaining;
    if (limit != null) headers["X-Twitch-Ratelimit-Limit"] = limit;
    if (reset != null) headers["X-Twitch-Ratelimit-Reset"] = String(Number(reset) * 1000);

    if (!twitchRes.ok) {
      const body = await twitchRes.text();
      return new Response(body, { status: twitchRes.status, headers });
    }

    const data = (await twitchRes.json()) as {
      data: any[];
      pagination?: { cursor?: string };
    };

    // Hydrate game names
    const gameIds = [...new Set(data.data.map((c: any) => c.game_id).filter(Boolean))] as string[];
    const gameMap = new Map<string, string>();
    if (gameIds.length > 0) {
      const games = await getGames(gameIds, token);
      for (const g of games) gameMap.set(g.id, g.name);
    }
    const clips = data.data.map((c: any) => ({
      ...c,
      game_name: c.game_id ? gameMap.get(c.game_id) || "Unknown Game" : "No Category",
    }));

    return new Response(
      JSON.stringify({
        clips,
        pagination: data.pagination,
        broadcasterId,
      }),
      { status: 200, headers },
    );
  } catch (error: any) {
    console.error("Error in clips API:", error);
    return json({ error: error.message }, 500);
  }
};
