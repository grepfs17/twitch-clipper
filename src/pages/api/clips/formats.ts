import type { APIRoute } from "astro";
import {
  extractClipSlug,
  getClipMetadata,
  jsonError,
} from "../../../lib/twitch-gql";
import { isSameOrigin } from "../../../lib/utils";

interface FormatOption {
  id: string;
  label: string;
  group: "landscape" | "portrait";
}

function extractFormats(clipMeta: any): FormatOption[] {
  const sig = clipMeta.playbackAccessToken?.signature;
  const token = clipMeta.playbackAccessToken?.value;

  if (!sig || !token || !clipMeta.assets) {
    return [{ id: "best", label: "Best Quality", group: "landscape" }];
  }

  const options: FormatOption[] = [];
  const seen = new Set<string>();

  options.push({ id: "best", label: "Best Quality", group: "landscape" });
  seen.add("best");

  const landscape: FormatOption[] = [];
  const portrait: FormatOption[] = [];

  for (let i = 0; i < clipMeta.assets.length; i++) {
    const asset = clipMeta.assets[i];
    const videoQualities = asset.videoQualities || [];
    const isPortrait = i > 0;

    for (const quality of videoQualities) {
      if (!quality.sourceURL) continue;

      const qualityId = quality.quality || "best";
      const formatId = isPortrait ? `portrait-${qualityId}` : qualityId;

      if (seen.has(formatId)) continue;
      seen.add(formatId);

      const height = parseInt(qualityId) || 0;
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

export const GET: APIRoute = async ({ request }: { request: Request }) => {
  if (!isSameOrigin(request)) return jsonError("Forbidden", 403);

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
