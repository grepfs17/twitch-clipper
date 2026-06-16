import type { APIRoute } from "astro";
import { spawn } from "node:child_process";

const CLIP_SLUG_REGEX =
  /^(?:https?:\/\/)?(?:clips\.twitch\.tv\/|.*clip\/)([\w-]+)/i;

const LIST_FORMATS_TIMEOUT_MS = 15_000;

const PORTRAIT_FORMATS = new Set([
  "portrait-360",
  "portrait-480",
  "portrait-720",
  "portrait-1080",
]);

function extractSlugFromUrl(clipUrl: string): string | null {
  const match = clipUrl.match(CLIP_SLUG_REGEX);
  return match ? match[1] : null;
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface ParsedFormat {
  id: string;
  resolution?: string;
}

function parseFormats(output: string): ParsedFormat[] {
  const formats: ParsedFormat[] = [];
  const seen = new Set<string>();

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith("─") || trimmed.startsWith("Download")) continue;

    // console.table() outputs: │ 'value' │ 'value' │
    const cells = trimmed
      .split("│")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 2) continue;

    // Skip header row (contains "format_id" or "(index)")
    if (cells.some((c) => c.includes("format_id") || c.includes("(index)") || c.includes("resolution"))) continue;

    // cells[0] is the index number, cells[1] is format_id, cells[2] is resolution
    const formatId = cells[1]?.replace(/^'|'$/g, "");
    const resolution = cells[2]?.replace(/^'|'$/g, "");

    if (!formatId || seen.has(formatId)) continue;
    if (formatId === "Audio_Only") continue;

    seen.add(formatId);
    formats.push({
      id: formatId,
      resolution: resolution && resolution !== "unknown" ? resolution : undefined,
    });
  }

  return formats;
}

function getLabel(id: string, resolution?: string): string {
  if (id === "best") return "Best Quality";
  if (id === "worst") return "Lowest Quality";

  const resMatch = resolution?.match(/(\d{3,4})x(\d{3,4})/);
  if (resMatch) {
    const w = parseInt(resMatch[1]);
    const h = parseInt(resMatch[2]);
    if (PORTRAIT_FORMATS.has(id) || w > h) {
      const px = h;
      return id.startsWith("portrait-")
        ? `${px}p Portrait`
        : `${px}p`;
    }
    return `${w}p`;
  }

  if (id.startsWith("portrait-")) {
    const px = id.replace("portrait-", "").replace("p", "");
    return `${px}p Portrait`;
  }

  if (/^\d+p?$/.test(id)) {
    return id.replace(/p$/, "") + "p";
  }

  return id;
}

interface FormatOption {
  id: string;
  label: string;
  group: "landscape" | "portrait";
}

function buildOptions(formats: ParsedFormat[]): FormatOption[] {
  const options: FormatOption[] = [];
  const seen = new Set<string>();

  options.push({ id: "best", label: "Best Quality", group: "landscape" });
  seen.add("best");

  const landscape: FormatOption[] = [];
  const portrait: FormatOption[] = [];

  for (const f of formats) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);

    const label = getLabel(f.id, f.resolution);
    const group = PORTRAIT_FORMATS.has(f.id) ? "portrait" : "landscape";

    if (group === "portrait") {
      portrait.push({ id: f.id, label, group });
    } else {
      landscape.push({ id: f.id, label, group });
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

export const GET: APIRoute = async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const clipUrl = params.get("url");

  if (!clipUrl) return jsonError("Clip URL is required", 400);

  const slug = extractSlugFromUrl(clipUrl);
  if (!slug) return jsonError("Invalid clip URL", 400);

  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["twitch-dlp", `https://clips.twitch.tv/${slug}`, "-F"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill();
      resolve(jsonError("Format listing timed out", 504));
    }, LIST_FORMATS_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve(jsonError(`Failed to list formats: ${err.message}`, 500));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        resolve(
          jsonError(
            stderr.match(/ERROR:\s*(.+)/i)?.[1] || "Failed to list formats",
            500,
          ),
        );
        return;
      }

      const formats = parseFormats(stdout);
      const options = buildOptions(formats);

      resolve(
        new Response(JSON.stringify({ options }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
  });
};
