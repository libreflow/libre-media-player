import { createJsonStore } from './jsonStore'

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
  /** UI language (roadmap #64); 'fr' preserves the pre-setting behavior. */
  locale: 'fr' | 'en'
  /** Preferred audio track language (mpv lang code or 'any', roadmap #58).
   * Persisted so the next opened file auto-selects it when available. */
  preferredAudioLang: string
}

export const DEFAULTS: Settings = {
  volume: 100,
  shuffle: false,
  repeat: false,
  locale: 'fr',
  preferredAudioLang: 'any',
}

// Persistence (cache + serialized writes + atomic write + corrupt-file
// fallback) is shared with resume.ts and recent.ts through jsonStore.ts.
const store = createJsonStore<Settings>({
  fileName: 'settings.json',
  fallback: () => ({ ...DEFAULTS }),
  // Validate per key: a syntactically valid but semantically wrong value
  // (hand-edited file, partial write, older schema) must fall back to the
  // default for THAT key only, not poison the whole object -- e.g. a
  // "volume": "abc" used to flow straight into setProperty('volume', ...)
  // and silently fail at startup.
  validate: (parsed) => {
    if (typeof parsed !== 'object' || parsed === null) return null
    const raw = parsed as Partial<Record<keyof Settings, unknown>>
    return {
      volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? raw.volume : DEFAULTS.volume,
      shuffle: typeof raw.shuffle === 'boolean' ? raw.shuffle : DEFAULTS.shuffle,
      repeat: typeof raw.repeat === 'boolean' ? raw.repeat : DEFAULTS.repeat,
      locale: raw.locale === 'fr' || raw.locale === 'en' ? raw.locale : DEFAULTS.locale,
      preferredAudioLang: typeof raw.preferredAudioLang === 'string' ? raw.preferredAudioLang : DEFAULTS.preferredAudioLang,
    }
  },
  pretty: true,
})

// Best-effort read (see jsonStore): a corrupt/unreadable settings file is
// treated as "all defaults" rather than an error (same policy as resume.json).
export async function loadSettings(): Promise<Settings> {
  return store.read()
}

// Best-effort write -- losing settings is a minor inconvenience, never an
// error banner.
export async function saveSettings(settings: Settings): Promise<void> {
  await store.mutate(() => settings)
}

// Merge-style update: persists a partial change without clobbering the
// keys the caller didn't touch (saveSettings writes the whole file).
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await store.mutate((current) => ({ ...current, ...patch }))
}
