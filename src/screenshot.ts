// Screenshot capture (roadmap #60). mpv's `screenshot-to-file` command does
// the real work (it renders the displayed frame, subtitles included); this
// module computes the destination path and derives the mpv arguments.

import { basename, splitPath } from './utils'

// Builds the PNG destination path: next to the video by default, or in
// the OS Pictures folder when configured. Name is "<video>.<n>.png" with a
// monotonic n: mpv refuses to overwrite and errors on a collision, so the
// first free index wins. The in-memory `existing` set covers captures made
// during THIS session; `fileExists` probes the disk so a PNG left by a
// previous run is also skipped instead of making mpv error out.
export async function screenshotPath(
  videoPath: string,
  existing: Set<string>,
  fileExists: (path: string) => Promise<boolean>,
): Promise<string> {
  const { dir, name } = splitPath(videoPath)
  const base = `${dir}${name}`
  let n = 1
  let path = `${base}.${n}.png`
  while (existing.has(path.toLowerCase()) || (await fileExists(path).catch(() => false))) {
    n += 1
    path = `${base}.${n}.png`
  }
  return path
}

// mpv arguments for the capture: subtitles included, no OSD (the app
// shows its own confirmation).
export function screenshotArgs(destPath: string): (string | boolean | number)[] {
  return [destPath, 'subtitles', false]
}

export function screenshotFileName(videoPath: string): string {
  return `${basename(videoPath)}.png`
}
