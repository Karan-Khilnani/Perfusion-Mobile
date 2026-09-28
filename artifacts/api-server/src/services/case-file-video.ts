import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function isCaseFileVideo(name: string, mime: string): boolean {
  return /^video\/(mp4|quicktime|webm)$/i.test(mime) || /\.(mp4|mov|webm)$/i.test(name);
}

export async function inspectCaseFileVideo(buffer: Buffer): Promise<{ durationSeconds: number; mimeType: string; playback?: Buffer }> {
  const dir = await mkdtemp(path.join(tmpdir(), "case-file-video-"));
  const file = path.join(dir, "upload");
  try {
    await writeFile(file, buffer);
    const { stdout } = await exec("ffprobe", [
      "-v", "error", "-show_entries", "format=duration,format_name:format_tags=major_brand:stream=codec_type,codec_name",
      "-of", "json", file,
    ], { timeout: 15000, maxBuffer: 1024 * 1024 });
    const info = JSON.parse(stdout);
    const formats = String(info.format?.format_name || "").split(",");
    const mimeType = formats.includes("webm") ? "video/webm"
      : formats.some((format: string) => ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].includes(format)) ?
        (String(info.format?.tags?.major_brand || "").trim() === "qt" ? "video/quicktime" : "video/mp4") : "";
    const durationSeconds = Number(info.format?.duration);
    if (!mimeType || !info.streams?.some((stream: { codec_type: string }) => stream.codec_type === "video") ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("Invalid video");
    if (durationSeconds > 120.05) return { durationSeconds, mimeType };
    const streams: { codec_type: string; codec_name: string }[] = info.streams || [];
    const compatible = mimeType === "video/mp4" &&
      streams.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264") &&
      streams.filter((stream) => stream.codec_type === "audio").every((stream) => stream.codec_name === "aac");
    if (compatible) return { durationSeconds, mimeType };
    const output = path.join(dir, "playback.mp4");
    await exec("ffmpeg", [
      "-v", "error", "-i", file, "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-movflags", "+faststart", "-y", output,
    ], { timeout: 120000, maxBuffer: 1024 * 1024 });
    return { durationSeconds, mimeType, playback: await readFile(output) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}