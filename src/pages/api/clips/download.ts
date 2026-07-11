import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  extractClipSlug,
  getClipMetadata,
  jsonError,
} from "../../../lib/twitch-gql";
import { isSameOrigin, checkRateLimit } from "../../../lib/utils";

// Validate the requested quality against the IDs the formats endpoint
// can produce. The formats endpoint uses the actual `height` from
// Twitch's GQL response, so portrait heights vary by clip (e.g. some
// clips only have 1080/853/640, others have 1920/1280/853/640).
// Allow any positive integer to avoid maintaining a fixed list.
const ALLOWED_QUALITY = /^(best|worst|\d+|portrait-\d+)$/;

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .trim()
    .slice(0, 200);
}

function makeFilename(name: string): string {
  return sanitizeFilename(name) + ".mp4";
}

function findFormatUrl(clipMeta: any, quality: string): string | null {
  const sig = clipMeta.playbackAccessToken?.signature;
  const token = clipMeta.playbackAccessToken?.value;

  if (!sig || !token || !clipMeta.assets) return null;

  const isPortrait = quality.startsWith("portrait-");
  const targetHeight = parseInt(quality.replace("portrait-", "")) || 0;

  for (const asset of clipMeta.assets) {
    // Match by asset id tag (LANDSCAPE/PORTRAIT), not array index.
    // The single playback token returned by ShareClipRenderStatus works
    // for any videoQuality under the same asset id prefix (per
    // yt-dlp's TwitchClipsIE), so portrait and landscape can be
    // downloaded with the same token.
    const assetIsPortrait = /PORTRAIT$/i.test(asset.id || "");
    if (isPortrait !== assetIsPortrait) continue;

    const videoQualities = asset.videoQualities || [];

    if (quality === "best") {
      const best = videoQualities[0];
      if (best?.sourceURL) {
        return `${best.sourceURL}?sig=${sig}&token=${encodeURIComponent(token)}`;
      }
      continue;
    }

    if (quality === "worst") {
      const worst = videoQualities[videoQualities.length - 1];
      if (worst?.sourceURL) {
        return `${worst.sourceURL}?sig=${sig}&token=${encodeURIComponent(token)}`;
      }
      continue;
    }

    for (const q of videoQualities) {
      const height = q.height || parseInt(q.quality) || 0;
      if (height === targetHeight && q.sourceURL) {
        return `${q.sourceURL}?sig=${sig}&token=${encodeURIComponent(token)}`;
      }
    }
  }

  const first = clipMeta.assets?.[0]?.videoQualities?.[0];
  if (first?.sourceURL) {
    return `${first.sourceURL}?sig=${sig}&token=${encodeURIComponent(token)}`;
  }

  return null;
}

export const GET: APIRoute = async ({ request }: any) => {
  if (!isSameOrigin(request)) return jsonError("Forbidden", 403);

  const rateLimit = checkRateLimit(request, env, {
    maxRequests: 60,
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

  const params = new URL(request.url).searchParams;
  const clipUrl = params.get("url");
  const clipTitle = params.get("title") || "";
  const rawQuality = params.get("quality") || "best";
  const quality = ALLOWED_QUALITY.test(rawQuality) ? rawQuality : "best";

  if (!clipUrl) return jsonError("Clip URL is required", 400);

  const slug = extractClipSlug(clipUrl);
  if (!slug) return jsonError("Invalid clip URL", 400);

  try {
    const clipMeta = await getClipMetadata(slug);
    if (!clipMeta) return jsonError("Clip not found", 404);

    const downloadUrl = findFormatUrl(clipMeta, quality);
    if (!downloadUrl) {
      return jsonError("No matching format found", 404);
    }

    const mp4Response = await fetch(downloadUrl);
    if (!mp4Response.ok) {
      return jsonError(
        `Failed to fetch clip: ${mp4Response.status}`,
        mp4Response.status,
      );
    }

    const safeName = clipTitle ? makeFilename(clipTitle) : `${slug}.mp4`;

    return new Response(mp4Response.body, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        "Content-Length": mp4Response.headers.get("Content-Length") || "",
      },
    });
  } catch (error: any) {
    console.error("Error downloading clip:", error);
    return jsonError(error.message || "Download failed", 500);
  }
};
