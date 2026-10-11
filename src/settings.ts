import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs'

const SETTINGS_FILE_NAME = 'settings.json'

// User preferences persisted across sessions. Kept intentionally tiny --
// new keys must default to a value that preserves current behavior when the
// file predates them (undefined = use the built-in default).
export interface Settings {
  /** Last used volume (0-130), restored on startup. */
  volume: number
  /** Queue shuffle preference, restored on startup. */
  shuffle: boolean
  /** Queue repeat preference, restored on startup. */
  repeat: boolean
}

const DEFAULTS: Settings = {
  volume: 100,
  shuffle: false,
  repeat: false,
}

let cachedPath: string | null = null

async function settingsFilePath(): Promise<string> {
  if (cachedPath) return cachedPath
  const dir = await appConfigDir()
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  cachedPath = await join(dir, SETTINGS_FILE_NAME)
  return cachedPath
}

// Atomic write: a crash or power loss mid-write must never leave a
// half-written (corrupt) settings file behind. Write to a temp file in the
// same directory, then rename over the target -- rename within a single
// filesystem is atomic on Windows and POSIX alike. Falls back to a plain
// write if the rename fails (best-effort policy: a leftover .tmp file is
// harmless, and a corrupt file is already handled by loadSettings).
async function atomicWriteTextFile(path: string, contents: string): Promise<void> {
  const tmpPath = `${path}.tmp`
  try {
    await writeTextFile(tmpPath, contents)
    await rename(tmpPath, path)
  } catch {
    try {
      await writeTextFile(path, contents)
    } catch {
      // Disk full, permission error, etc. -- silently skip.
    }
  }
}

// Best-effort read -- a corrupt/unreadable settings file is treated as
// "all defaults" rather than an error (same policy as resume.json).
export async function loadSettings(): Promise<Settings> {
  try {
    const path = await settingsFilePath()
    if (!(await exists(path))) return { ...DEFAULTS }
    const parsed: unknown = JSON.parse(await readTextFile(path))
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(parsed as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

// Best-effort write -- losing settings is a minor inconvenience, never an
// error banner.
export async function saveSettings(settings: Settings): Promise<void> {
  const path = await settingsFilePath()
  await atomicWriteTextFile(path, JSON.stringify(settings, null, 2))
}

// Merge-style update: persists a partial change without clobbering the
// keys the caller didn't touch (saveSettings writes the whole file).
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await saveSettings({ ...(await loadSettings()), ...patch })
}
