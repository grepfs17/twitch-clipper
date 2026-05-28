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

function extractSlugFromUrl(clipUrl: string): string | null {
  const match = clipUrl.match(CLIP_SLUG_REGEX);
  return match ? match[1] : null;
}

function findVideoFiles(files: string[]): string | null {
  return files.find((f) => /\.(mp4|webm|mkv)$/i.test(f)) || null;
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

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const clipUrl = url.searchParams.get("url");
  const quality =
    QUALITY_TO_FORMAT[url.searchParams.get("quality") || "best"] || "best";

  if (!clipUrl) {
    return new Response(JSON.stringify({ error: "Clip URL is required" }), {
      status: 400,
    });
  }

  const slug = extractSlugFromUrl(clipUrl);
  if (!slug) {
    return new Response(JSON.stringify({ error: "Invalid clip URL" }), {
      status: 400,
    });
  }

  const tempDir = join(tmpdir(), `twitch-clip-${randomUUID()}`);
  await mkdir(tempDir, { recursive: true });

  return new Promise((resolve) => {
    const process = spawn(
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

    process.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    process.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    const timeout = setTimeout(() => {
      process.kill();
      cleanupDir(tempDir).catch(() => {});
      resolve(
        new Response(
          JSON.stringify({ error: "Download timed out after 120 seconds" }),
          { status: 504 },
        ),
      );
    }, 120_000);

    process.on("error", (err) => {
      clearTimeout(timeout);
      console.error("[download] Process error:", err.message);
      resolve(
        new Response(
          JSON.stringify({
            error: `Failed to start twitch-dlp: ${err.message}`,
          }),
          { status: 500 },
        ),
      );
    });

    process.on("close", async (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        const errMsg =
          stderr.match(/ERROR:\s*(.+)/i)?.[1] ||
          stdout.match(/ERROR:\s*(.+)/i)?.[1] ||
          "Download failed";
        console.error("[download] twitch-dlp exited with code", code);
        console.error("[download] stderr:", stderr.slice(0, 1000));
        resolve(
          new Response(JSON.stringify({ error: errMsg }), { status: 500 }),
        );
        return;
      }

      try {
        const files = await readdir(tempDir);
        const videoFile =
          findVideoFiles(files) || files.find((f) => /\.mp4/i.test(f));
        const displayName = videoFile
          ? videoFile.replace(/\.part$/i, "")
          : null;

        if (!displayName) {
          const allFiles = await readdir(tempDir).catch(() => []);
          console.error(
            "[download] No video files found in",
            tempDir,
            "files:",
            allFiles,
          );
          console.error(
            "[download] twitch-dlp output - stdout:",
            stdout.slice(0, 2000),
          );
          console.error(
            "[download] twitch-dlp output - stderr:",
            stderr.slice(0, 2000),
          );
          resolve(
            new Response(
              JSON.stringify({ error: "No video file found after download" }),
              { status: 500 },
            ),
          );
          return;
        }

        const filePath = join(tempDir, displayName);
        const fileStat = await stat(filePath);

        console.log("[download] Success:", displayName, fileStat.size, "bytes");

        const stream = createReadStream(filePath);

        resolve(
          new Response(stream as any, {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Disposition": `attachment; filename="${displayName}"`,
              "Content-Length": fileStat.size.toString(),
            },
          }),
        );

        setTimeout(() => cleanupDir(tempDir).catch(() => {}), 5000);
      } catch (err: any) {
        console.error("[download] Error reading file:", err);
        resolve(
          new Response(
            JSON.stringify({
              error: err.message || "Failed to read downloaded file",
            }),
            { status: 500 },
          ),
        );
      }
    });
  });
};
