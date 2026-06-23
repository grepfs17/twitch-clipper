import type { APIRoute } from "astro";
import {
  extractClipSlug,
  getClipMetadata,
  jsonError,
} from "../../../lib/twitch-gql";
import { isSameOrigin, checkRateLimit } from "../../../lib/utils";

const QUALITY_TO_FORMAT: Record<string, string> = {
  best: "best",
  worst: "worst",
  "360": "360",
  "480": "480",
  "720": "720",
  "1080": "1080",
  "portrait-360": "portrait-360",
  "portrait-480": "portrait-480",
  "portrait-720": "portrait-720",
  "portrait-1080": "portrait-1080",
  "portrait-1080p": "portrait-1080",
  "portrait-720p": "portrait-720",
  "portrait-480p": "portrait-480",
  "portrait-360p": "portrait-360",
};

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

  for (let i = 0; i < clipMeta.assets.length; i++) {
    const asset = clipMeta.assets[i];
    const videoQualities = asset.videoQualities || [];
    const assetIsPortrait = i > 0;

    if (isPortrait !== assetIsPortrait) continue;

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
      const height = parseInt(q.quality) || 0;
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

export const GET: APIRoute = async ({ request, locals }: any) => {
  if (!isSameOrigin(request)) return jsonError("Forbidden", 403);

  const env = locals?.runtime?.env || {};
  const rateLimit = await checkRateLimit(request, env, {
    maxRequests: 10,
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
  const clipUrl = params.get("url");
  const clipTitle = params.get("title") || "";
  const quality = QUALITY_TO_FORMAT[params.get("quality") || "best"] || "best";

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
