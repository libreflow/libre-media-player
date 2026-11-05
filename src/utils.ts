export const MAX_VOLUME = 130

// Playback speed bounds (mpv accepts far more, but outside this range
// audio is pitch-shifted garbage and there is nothing left to lip-read).
export const MIN_PLAYBACK_SPEED = 0.25
export const MAX_PLAYBACK_SPEED = 4

// Speed step for the < and > shortcuts: 0.25 keeps every multiple of the
// default (1) reachable from both directions -- no reset shortcut needed.
export const SPEED_STEP = 0.25

// Pure helper for the < / > speed shortcuts: clamps to the bounds and
// rounds away float drift (0.1 + 0.2 style) so the displayed value and
// mpv's stay identical.
export function nextPlaybackSpeed(current: number, delta: number): number {
  const raw = current + delta
  return Math.min(
    MAX_PLAYBACK_SPEED,
    Math.max(MIN_PLAYBACK_SPEED, Math.round(raw * 100) / 100),
  )
}

export const VIDEO_EXTENSIONS = [
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv', 'wmv', 'ts', 'mpg', 'mpeg',
]

export function formatTime(seconds: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '--:--'
  // Clamp negatives (a seek before 0 or a transient negative mpv time-pos)
  // instead of rendering broken values like "-1:-10".
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? m.toString().padStart(2, '0') : `${m}`
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const VIDEO_EXTENSION_SET = new Set(VIDEO_EXTENSIONS)

// Split any OS-style path into { dir (with trailing separator), name }.
// Single source of truth for subtitle sidecar discovery and playlist
// basenames -- kept here so the two never diverge on edge cases (Windows
// drive prefixes, missing separators).
export function splitPath(path: string): { dir: string; name: string } {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (slash === -1) {
    // Bare "C:name" (drive-relative path, no separator): keep the drive
    // prefix in dir so basename() doesn't return "C:name".
    if (path.length > 1 && path[1] === ':') return { dir: path.slice(0, 2), name: path.slice(2) }
    return { dir: '', name: path }
  }
  return { dir: path.slice(0, slash + 1), name: path.slice(slash + 1) }
}

export function basename(path: string): string {
  return splitPath(path).name
}

export function swapExtension(path: string, ext: string): string {
  // Only consider dots in the FILE NAME, not in directory components: a
  // directory like "C:/Mes.Vidéos/" must not truncate the path.
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const dot = path.lastIndexOf('.')
  const base = dot === -1 || dot < slash ? path : path.slice(0, dot)
  return `${base}.${ext}`
}

export function hasVideoExtension(path: string): boolean {
  const dot = path.lastIndexOf('.')
  if (dot === -1) return false
  return VIDEO_EXTENSION_SET.has(path.slice(dot + 1).toLowerCase())
}

// When several files are dropped at once, prefer the first one that looks
// like a video instead of blindly taking paths[0] (which may be a subtitle
// or artwork file dropped alongside the movie).
export function pickSupportedFile(paths: string[]): string | null {
  return paths.find((p) => hasVideoExtension(p)) ?? paths[0] ?? null
}
