import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

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
  try {
    const path = await settingsFilePath()
    await writeTextFile(path, JSON.stringify(settings, null, 2))
  } catch {
    // Disk full, permission error, etc. -- silently skip.
  }
}

// Merge-style update: persists a partial change without clobbering the
// keys the caller didn't touch (saveSettings writes the whole file).
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await saveSettings({ ...(await loadSettings()), ...patch })
}
