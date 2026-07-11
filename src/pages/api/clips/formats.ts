import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
  extractClipSlug,
  getClipMetadata,
  jsonError,
} from "../../../lib/twitch-gql";
import { isSameOrigin, checkRateLimit } from "../../../lib/utils";

interface FormatOption {
  id: string;
  label: string;
  group: "landscape" | "portrait";
}

function extractFormats(clipMeta: any): FormatOption[] {
  if (!clipMeta.assets) {
    return [{ id: "best", label: "Best Quality", group: "landscape" }];
  }

  const options: FormatOption[] = [];
  const seen = new Set<string>();

  options.push({ id: "best", label: "Best Quality", group: "landscape" });
  seen.add("best");

  const landscape: FormatOption[] = [];
  const portrait: FormatOption[] = [];

  for (const asset of clipMeta.assets) {
    // Trust the asset id (e.g. ".../LANDSCAPE", ".../PORTRAIT") over
    // the array index. Twitch's GQL playback token signs the asset's
    // path prefix and works for ANY videoQuality under the same asset
    // (per yt-dlp's TwitchClipsIE), so we can expose both landscape
    // and portrait options from a single playback token.
    const isPortrait = /PORTRAIT$/i.test(asset.id || "");
    const videoQualities = asset.videoQualities || [];

    for (const quality of videoQualities) {
      if (!quality.sourceURL) continue;
      // Label and select by *height* (the larger dimension) — Twitch's
      // `quality` field for portrait is actually the width, which is
      // confusing for users. Falling back to `quality` only if `height`
      // is missing.
      const height = quality.height || parseInt(quality.quality) || 0;
      const formatId = isPortrait ? `portrait-${height}` : `${height}`;
      if (!height || seen.has(formatId)) continue;
      seen.add(formatId);

      const fps = quality.frameRate ? Math.round(quality.frameRate) : null;
      const fpsSuffix = fps && fps > 30 ? ` (${fps}fps)` : "";
      const label = isPortrait
        ? `${height}p Portrait${fpsSuffix}`
        : `${height}p${fpsSuffix}`;
      const group = isPortrait ? "portrait" : "landscape";

      if (isPortrait) {
        portrait.push({ id: formatId, label, group });
      } else {
        landscape.push({ id: formatId, label, group });
      }
    }
  }

  const resSort = (a: FormatOption, b: FormatOption) => {
    const aNum = parseInt(a.id.replace(/\D/g, "")) || 0;
    const bNum = parseInt(b.id.replace(/\D/g, "")) || 0;
    return bNum - aNum;
  };

  landscape.sort(resSort);
  portrait.sort(resSort);

  options.push(...landscape, ...portrait);
  return options;
}

export const GET: APIRoute = async ({ request }: any) => {
  if (!isSameOrigin(request)) return jsonError("Forbidden", 403);

  const rateLimit = checkRateLimit(request, env, {
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

  const params = new URL(request.url).searchParams;
  const clipUrl = params.get("url");

  if (!clipUrl) return jsonError("Clip URL is required", 400);

  const slug = extractClipSlug(clipUrl);
  if (!slug) return jsonError("Invalid clip URL", 400);

  try {
    const clipMeta = await getClipMetadata(slug);
    if (!clipMeta) return jsonError("Clip not found", 404);

    const options = extractFormats(clipMeta);
    return new Response(JSON.stringify({ options }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error listing formats:", error);
    return jsonError(error.message || "Failed to list formats", 500);
  }
};
