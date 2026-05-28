import type { APIRoute } from "astro";
import { getAccessToken, getGames } from "../../../lib/twitch";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const clipUrl = url.searchParams.get("url");

  if (!clipUrl) {
    return new Response(JSON.stringify({ error: "Clip URL is required" }), {
      status: 400,
    });
  }

  const slug = clipUrl.match(/(?:clips\.twitch\.tv\/|clip\/)([\w-]+)/i)?.[1];
  if (!slug) {
    return new Response(JSON.stringify({ error: "Invalid clip URL" }), {
      status: 400,
    });
  }

  try {
    const token = await getAccessToken();
    const clientId = import.meta.env.TWITCH_CLIENT_ID;

    const response = await fetch(
      `https://api.twitch.tv/helix/clips?id=${slug}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Clip not found" }), {
        status: 404,
      });
    }

    const data = await response.json();
    if (data.data.length === 0) {
      return new Response(JSON.stringify({ error: "Clip not found" }), {
        status: 404,
      });
    }

    const clip = data.data[0];
    const gameIds = clip.game_id ? [clip.game_id] : [];
    const games = await getGames(gameIds, token);
    const gameMap = Object.fromEntries(games.map((g: any) => [g.id, g.name]));

    clip.game_name =
      gameMap[clip.game_id] || (clip.game_id ? "Loading..." : "No Category");

    return new Response(JSON.stringify({ clip }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in clip lookup API:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
};
