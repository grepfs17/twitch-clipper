import type { APIRoute } from "astro";
import { TWITCH_CLIENT_ID } from "astro:env/server";
import { getAccessToken, getGames } from "../../../lib/twitch";
import { isSameOrigin } from "../../../lib/utils";

const CLIP_SLUG_REGEX = /(?:clips\.twitch\.tv\/|clip\/)([\w-]+)/i;

function extractClipSlug(clipUrl: string): string | null {
  return clipUrl.match(CLIP_SLUG_REGEX)?.[1] ?? null;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function hydrateGameName(clip: any, token: string) {
  if (!clip.game_id) {
    clip.game_name = "No Category";
    return;
  }
  const games = await getGames([clip.game_id], token);
  const name = games[0]?.name;
  clip.game_name = name || "Loading...";
}

export const GET: APIRoute = async ({ request }: { request: Request }) => {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  const clipUrl = new URL(request.url).searchParams.get("url");

  if (!clipUrl) return json({ error: "Clip URL is required" }, 400);

  const slug = clipUrl ? extractClipSlug(clipUrl) : null;
  if (!slug) return json({ error: "Invalid clip URL" }, 400);

  try {
    const token = await getAccessToken();
    const clientId = TWITCH_CLIENT_ID!;

    const response = await fetch(
      `https://api.twitch.tv/helix/clips?id=${slug}`,
      {
        headers: {
          "Client-ID": clientId,
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) return json({ error: "Clip not found" }, 404);

    const data = await response.json();
    if (data.data.length === 0) return json({ error: "Clip not found" }, 404);

    const clip = data.data[0];
    await hydrateGameName(clip, token);

    return json({ clip }, 200);
  } catch (error: any) {
    console.error("Error in clip lookup API:", error);
    return json({ error: error.message }, 500);
  }
};
