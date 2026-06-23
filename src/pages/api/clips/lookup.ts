import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { TWITCH_CLIENT_ID } from "astro:env/server";
import { getAccessToken, getGames } from "../../../lib/twitch";
import { isSameOrigin, checkRateLimit, json } from "../../../lib/utils";
import type { TwitchClip } from "../../../scripts/types";

const CLIP_SLUG_REGEX = /(?:clips\.twitch\.tv\/|clip\/)([\w-]+)/i;

function extractClipSlug(clipUrl: string): string | null {
  return clipUrl.match(CLIP_SLUG_REGEX)?.[1] ?? null;
}

async function hydrateGameName(clip: TwitchClip, token: string) {
  if (!clip.game_id) {
    clip.game_name = "No Category";
    return;
  }
  const games = await getGames([clip.game_id], token);
  const name = games[0]?.name;
  clip.game_name = name || "Loading...";
}

export const GET: APIRoute = async ({ request }: any) => {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);

  const rateLimit = await checkRateLimit(request, env, {
    maxRequests: 120,
    windowSec: 60,
    scope: new URL(request.url).pathname,
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

    const data = await response.json() as { data: TwitchClip[] };
    if (data.data.length === 0) return json({ error: "Clip not found" }, 404);

    const clip: TwitchClip = data.data[0];
    await hydrateGameName(clip, token);

    return json({ clip }, 200);
  } catch (error: any) {
    console.error("Error in clip lookup API:", error);
    return json({ error: error.message }, 500);
  }
};
