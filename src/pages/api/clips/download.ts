import type { APIRoute } from "astro";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readdir, stat, unlink, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";

const CLIP_SLUG_REGEX =
  /^(?:https?:\/\/)?(?:clips\.twitch\.tv\/|.*clip\/)([\w-]+)/i;

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

const VIDEO_FILE_RE = /\.(mp4|webm|mkv)$/i;
const VIDEO_FILE_RE_FALLBACK = /\.(mp4|mp4_|webm|mkv)/i;
const ERROR_LINE_RE = /ERROR:\s*(.+)/i;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const CLEANUP_DELAY_MS = 5_000;
const LOG_TAIL = 2000;

function extractSlugFromUrl(clipUrl: string): string | null {
  const match = clipUrl.match(CLIP_SLUG_REGEX);
  return match ? match[1] : null;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").trim().slice(0, 200);
}

function makeFilename(name: string): string {
  return sanitizeFilename(name) + ".mp4";
}

function findVideoFiles(files: string[]): string | null {
  return files.find((f) => VIDEO_FILE_RE.test(f)) || null;
}

async function cleanupDir(dir: string) {
  try {
    const files = await readdir(dir);
    await Promise.all(files.map((f) => unlink(join(dir, f))));
    await unlink(dir);
  } catch {
    // Directory may not exist
  }
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseDownloadError(stderr: string, stdout: string, code: number | null): string {
  const errMsg =
    stderr.match(ERROR_LINE_RE)?.[1] ||
    stdout.match(ERROR_LINE_RE)?.[1] ||
    "Download failed";
  console.error("[download] twitch-dlp exited with code", code);
  console.error("[download] stderr:", stderr.slice(0, 1000));
  return errMsg;
}

async function readDownloadedClip(
  tempDir: string,
  slug: string,
  clipTitle: string,
): Promise<{ filePath: string; safeName: string } | null> {
  const files = await readdir(tempDir);
  const videoFile =
    findVideoFiles(files) || files.find((f) => VIDEO_FILE_RE_FALLBACK.test(f)) || null;
  if (!videoFile) {
    const allFiles = await readdir(tempDir).catch(() => []);
    console.error(
      "[download] No video files found in",
      tempDir,
      "files:",
      allFiles,
    );
    return null;
  }

  const filePath = join(tempDir, videoFile);
  const fileStat = await stat(filePath);
  const safeName = clipTitle ? makeFilename(clipTitle) : `${slug}.mp4`;
  console.log("[download] Success:", videoFile, fileStat.size, "bytes");
  return { filePath, safeName };
}

function buildClipStreamResponse(
  filePath: string,
  safeName: string,
  size: number,
  tempDir: string,
): Response {
  const stream = createReadStream(filePath);
  setTimeout(() => cleanupDir(tempDir).catch(() => {}), CLEANUP_DELAY_MS);
  return new Response(stream as any, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": size.toString(),
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const clipUrl = params.get("url");
  const clipTitle = params.get("title") || "";
  const quality =
    QUALITY_TO_FORMAT[params.get("quality") || "best"] || "best";

  if (!clipUrl) return jsonError("Clip URL is required", 400);

  const slug = extractSlugFromUrl(clipUrl);
  if (!slug) return jsonError("Invalid clip URL", 400);

  const tempDir = join(tmpdir(), `twitch-clip-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "twitch-dlp",
        `https://clips.twitch.tv/${slug}`,
        "-f",
        quality,
        "-o",
        `${slug}.mp4`,
        "--downloader",
        "fetch",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
        cwd: tempDir,
      },
    );

    let stderr = "";
    let stdout = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill();
      cleanupDir(tempDir).catch(() => {});
      resolve(jsonError("Download timed out after 120 seconds", 504));
    }, DOWNLOAD_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timeout);
      console.error("[download] Process error:", err.message);
      resolve(
        jsonError(`Failed to start twitch-dlp: ${err.message}`, 500),
      );
    });

    child.on("close", async (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        resolve(jsonError(parseDownloadError(stderr, stdout, code), 500));
        return;
      }
      try {
        const result = await readDownloadedClip(tempDir, slug, clipTitle);
        if (!result) {
          console.error(
            "[download] twitch-dlp output - stdout:",
            stdout.slice(0, LOG_TAIL),
          );
          console.error(
            "[download] twitch-dlp output - stderr:",
            stderr.slice(0, LOG_TAIL),
          );
          resolve(jsonError("No video file found after download", 500));
          return;
        }
        const size = (await stat(result.filePath)).size;
        resolve(
          buildClipStreamResponse(
            result.filePath,
            result.safeName,
            size,
            tempDir,
          ),
        );
      } catch (err: any) {
        console.error("[download] Error reading file:", err);
        resolve(
          jsonError(err.message || "Failed to read downloaded file", 500),
        );
      }
    });
  });
};
