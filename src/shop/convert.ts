// Audio conversion with ffmpeg (shop music, src/shop/audio.ts). No "@/" imports: runnable with plain node for checks.
import { spawn } from "node:child_process"

/** Runs ffmpeg; resolves with its log (stderr), rejects with the log's end on failure. */
export function ffmpeg(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ["-hide_banner", "-nostdin", "-y", ...args])
    let log = ""
    p.stderr.on("data", (d) => (log = (log + d).slice(-20000)))
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve(log) : reject(new Error(`ffmpeg ${code}: ${log.slice(-500)}`))))
  })
}

/** "Duration: 00:06:31.25" in ffmpeg's log → 391. */
export const durationOf = (log: string) => {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log)
  return m ? Math.round(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) : null
}

export type Format = "stream" | "mp3" | "flac" | "wav"
export const DOWNLOAD_FORMATS = ["mp3", "flac", "wav"] as const
export const EXT: Record<Format, string> = { stream: "mp3", mp3: "mp3", flac: "flac", wav: "wav" }
export const MIME: Record<Format, string> = { stream: "audio/mpeg", mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav" }

/** ffmpeg arguments: one input, one output per format (tags on each). The WAV is only made when the master isn't one. */
export function convertArgs(input: string, out: (f: Format) => string, tags: Record<string, string>, masterIsWav: boolean) {
  const meta = Object.entries(tags).flatMap(([k, v]) => ["-metadata", `${k}=${v}`])
  const outputs: [Format, string[]][] = [
    ["stream", ["-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100"]],
    ["mp3", ["-c:a", "libmp3lame", "-b:a", "320k"]],
    ["flac", ["-c:a", "flac", "-compression_level", "8"]],
    ...(masterIsWav ? [] : [["wav", ["-c:a", "pcm_s24le"]] as [Format, string[]]]),
  ]
  return { formats: outputs.map(([f]) => f), args: ["-i", input, ...outputs.flatMap(([f, codec]) => ["-map", "0:a:0", "-map_metadata", "-1", ...meta, ...codec, out(f)])] }
}
