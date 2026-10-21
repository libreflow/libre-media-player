import { readTextFile, writeTextFile, rename, exists, mkdir } from '@tauri-apps/plugin-fs'
import { appConfigDir, join } from '@tauri-apps/api/path'

// Recently opened files, persisted as a small ordered list in
// settings.json (via a dedicated file managed here) -- NOT a media library:
// just a shortcut to reopen what the user already watched. Deliberately
// capped to keep the list useful and the file tiny.

export const MAX_RECENT_FILES = 10
const RECENT_FILE_NAME = 'recent.json'

export interface RecentEntry {
  path: string
  /** Basename shown in the UI, computed once at add time. */
  name: string
  /** Last time the file was opened (epoch ms), for ordering/display. */
  openedAt: number
}

type RecentList = RecentEntry[]

let cachedPath: string | null = null
// In-memory cache of the recents list + a write chain serializing every
// read-modify-write, so a prune at mount racing an addRecentFile (or two
// rapid opens) can't lose an entry by reading a pre-write snapshot.
let cachedList: RecentList | null = null
let writeChain: Promise<void> = Promise.resolve()

// Test-only escape hatch: drops the module-level caches so the next read
// hits the (mocked) disk again. Tests share one module registry per file,
// so without this the first test's writes leak into every later test.
export function __resetRecentCacheForTests(): void {
  cachedList = null
  cachedPath = null
  writeChain = Promise.resolve()
}

async function recentFilePath(): Promise<string> {
  if (cachedPath) return cachedPath
  const dir = await appConfigDir()
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true })
  }
  cachedPath = await join(dir, RECENT_FILE_NAME)
  return cachedPath
}

// Atomic write (same rationale as settings.ts): temp file + rename so a
// crash mid-write can't corrupt recent.json. Updates the in-memory cache
// so subsequent reads never see a stale list.
async function writeRecentList(list: RecentList): Promise<void> {
  cachedList = list
  const path = await recentFilePath()
  const tmpPath = `${path}.tmp`
  const contents = JSON.stringify(list)
  try {
    await writeTextFile(tmpPath, contents)
    await rename(tmpPath, path)
  } catch {
    try {
      await writeTextFile(path, contents)
    } catch {
      // Best-effort: losing a recents update is a minor inconvenience.
    }
  }
}

// Best-effort read -- corrupt/unreadable file means "no recents".
export async function loadRecentFiles(): Promise<RecentList> {
  if (cachedList) return cachedList
  try {
    const path = await recentFilePath()
    if (!(await exists(path))) {
      cachedList = []
      return cachedList
    }
    const parsed: unknown = JSON.parse(await readTextFile(path))
    if (!Array.isArray(parsed)) {
      cachedList = []
      return cachedList
    }
    // Tolerate older/partial entries: keep only well-formed ones.
    cachedList = parsed.filter(
      (e): e is RecentEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as RecentEntry).path === 'string' &&
        typeof (e as RecentEntry).name === 'string',
    )
    return cachedList
  } catch {
    cachedList = []
    return cachedList
  }
}

// Serializes every list mutation + write through writeChain, so a prune
// racing an add (or two rapid adds) can't lose an entry.
function enqueueWrite(op: () => Promise<RecentList>): Promise<RecentList> {
  const run = writeChain.then(op)
  writeChain = run.then(() => undefined, () => undefined)
  return run
}

// Adds (or re-adds) a file at the top of the recents list, deduplicated by
// exact path, capped at MAX_RECENT_FILES. Never throws: persistence is
// strictly best-effort and must not interrupt playback.
export async function addRecentFile(path: string, name: string): Promise<RecentList> {
  try {
    return await enqueueWrite(async () => {
      const list = await loadRecentFiles()
      const next: RecentList = [
        { path, name, openedAt: Date.now() },
        ...list.filter((e) => e.path !== path),
      ].slice(0, MAX_RECENT_FILES)
      await writeRecentList(next)
      return next
    })
  } catch {
    return []
  }
}

// Drops entries whose file no longer exists on disk (deleted/moved videos),
// so the home list never shows dead paths. Best-effort: an exists() that
// throws keeps the entry (same policy as resume.ts's prunedMap).
export async function pruneRecentFiles(): Promise<RecentList> {
  try {
    return await enqueueWrite(async () => {
      const list = await loadRecentFiles()
      const kept = await Promise.all(
        list.map(async (entry) => {
          try {
            return (await exists(entry.path)) ? entry : null
          } catch {
            return entry
          }
        }),
      )
      const next = kept.filter((e): e is RecentEntry => e !== null)
      if (next.length !== list.length) await writeRecentList(next)
      return next
    })
  } catch {
    return []
  }
}

export async function clearRecentFiles(): Promise<void> {
  try {
    await enqueueWrite(async () => {
      await writeRecentList([])
      return []
    })
  } catch {
    // Best-effort.
  }
}
