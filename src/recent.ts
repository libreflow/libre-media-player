import { exists } from '@tauri-apps/plugin-fs'
import { createJsonStore } from './jsonStore'

// Recently opened files, persisted as a small ordered list in a dedicated
// recent.json -- NOT a media library: just a shortcut to reopen what the
// user already watched. Deliberately capped to keep the list useful and
// the file tiny.

export const MAX_RECENT_FILES = 10

export interface RecentEntry {
  path: string
  /** Basename shown in the UI, computed once at add time. */
  name: string
  /** Last time the file was opened (epoch ms), for ordering/display. */
  openedAt: number
}

type RecentList = RecentEntry[]

// Tolerates older/partial entries after an atomic-write crash or a manual
// edit: keep only well-formed ones (recent.json predates `openedAt`, so
// entries without it are still usable for listing).
function isValidEntry(e: unknown): e is RecentEntry {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as RecentEntry).path === 'string' &&
    typeof (e as RecentEntry).name === 'string'
  )
}

// Persistence (cache + serialized writes + atomic write + corrupt-file
// fallback) is shared through jsonStore.ts.
const store = createJsonStore<RecentList>({
  fileName: 'recent.json',
  fallback: () => [],
  validate: (parsed) => (Array.isArray(parsed) ? parsed.filter(isValidEntry) : null),
})

// Test-only escape hatch: drops the store's caches so the next read
// actually hits the (mocked) disk -- see jsonStore.resetCacheForTests.
export function __resetRecentCacheForTests(): void {
  store.resetCacheForTests()
}

// Best-effort read (see jsonStore): a corrupt/unreadable file means
// "no recents", never an error.
export async function loadRecentFiles(): Promise<RecentList> {
  return store.read()
}

// Adds (or re-adds) a file at the top of the recents list, deduplicated by
// exact path, capped at MAX_RECENT_FILES. Never throws: persistence is
// strictly best-effort and must not interrupt playback.
export async function addRecentFile(path: string, name: string): Promise<RecentList> {
  try {
    const next = await store.mutate((list) => [
      { path, name, openedAt: Date.now() },
      ...list.filter((e) => e.path !== path),
    ].slice(0, MAX_RECENT_FILES))
    return next
  } catch {
    return []
  }
}

// Drops entries whose file no longer exists on disk (deleted/moved videos),
// so the home list never shows dead paths. Best-effort: an exists() that
// throws keeps the entry (same policy as resume.ts's prunedMap).
export async function pruneRecentFiles(): Promise<RecentList> {
  try {
    const kept = await store.mutate(async (list) => {
      const probed = await Promise.all(
        list.map(async (entry) => {
          try {
            return (await exists(entry.path)) ? entry : null
          } catch {
            return entry
          }
        }),
      )
      const next = probed.filter((e): e is RecentEntry => e !== null)
      // No dead paths found: return the current list unchanged so the
      // store skips the disk write.
      return next.length === list.length ? list : next
    })
    return kept
  } catch {
    return []
  }
}

export async function clearRecentFiles(): Promise<void> {
  try {
    await store.mutate(() => [])
  } catch {
    // Best-effort.
  }
}
