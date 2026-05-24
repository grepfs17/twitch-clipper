import type { APIRoute } from "astro";
import {
  getAccessToken,
  getBroadcasterId,
  getClips,
  getGames,
} from "../../lib/twitch";

const gameNameCache = new Map<string, string>();

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel");
  const timeRange = url.searchParams.get("timeRange") || "all";
  const after = url.searchParams.get("after") || undefined;
  const startedAtParam = url.searchParams.get("startedAt");
  const endedAtParam = url.searchParams.get("endedAt");

  if (!channel) {
    return new Response(JSON.stringify({ error: "Channel name is required" }), {
      status: 400,
    });
  }

  try {
    const token = await getAccessToken();
    const broadcasterId = await getBroadcasterId(channel, token);

    if (!broadcasterId) {
      return new Response(JSON.stringify({ error: "Channel not found" }), {
        status: 404,
      });
    }

    let startedAt: string | undefined;
    const now = new Date();

    if (startedAtParam) {
      startedAt = startedAtParam;
    } else if (timeRange === "24h") {
      startedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    } else if (timeRange === "7d") {
      startedAt = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
    } else if (timeRange === "30d") {
      startedAt = new Date(
        now.getTime() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
    }

    const clipsData = await getClips(broadcasterId, token, {
      started_at: startedAt,
      ended_at: endedAtParam || undefined,
      first: 100,
      after,
    });

    const gameIds = [
      ...new Set(clipsData.data.map((clip: any) => clip.game_id)),
    ].filter((id) => id !== "") as string[];
    const uncachedIds = gameIds.filter((id) => !gameNameCache.has(id));
    if (uncachedIds.length > 0) {
      const games = await getGames(uncachedIds, token);
      for (const g of games) {
        gameNameCache.set(g.id, g.name);
      }
    }

    const clips = clipsData.data.map((clip: any) => ({
      ...clip,
      game_name:
        gameNameCache.get(clip.game_id) || (clip.game_id ? "Loading..." : "No Category"),
    }));

    return new Response(
      JSON.stringify({
        clips,
        pagination: clipsData.pagination,
        broadcasterId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Error in clips API:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
};
