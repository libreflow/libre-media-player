import { appConfigDir, join } from '@tauri-apps/api/path'
import { exists, mkdir, readTextFile, rename, writeTextFile } from '@tauri-apps/plugin-fs'

// Shared persistence core for the app's three small JSON files
// (settings.json, resume.json, recent.json). Every one of them needs the
// same four things, previously copy-pasted three times (the resume-prune
// cache bug of audit #3 lived in exactly one of those copies):
//
// 1. An in-memory cache: once loaded, every read hits the cache and every
//    write updates it, so concurrent read-modify-write cycles never lose
//    an update by reading a stale snapshot from disk.
// 2. A serialized write chain: a second mutation chains behind the first
//    instead of interleaving its read with the first's write.
// 3. Atomic writes: temp file + rename over the target, so a crash
//    mid-write never leaves a half-written (corrupt) file behind.
// 4. A corrupt-file fallback: an unreadable/corrupt JSON file means
//    "the fallback value", never an error banner.
export interface JsonStore<T> {
  /** Current value: cached after the first read, never touches the disk again. */
  read(): Promise<T>
  /**
   * Serialized read-modify-write. `mutate` receives the current (cached)
   * value and returns the value to persist; returning the SAME object
   * skips the disk write entirely (no-op pruning, explicit early-returns).
   * Persists the returned value into the cache before writing, so a
   * prune is never undone by the next save. Rejections of `mutate`'s
   * result or the read propagate to the caller; write errors are
   * swallowed (best-effort persistence must never interrupt playback).
   */
  mutate(fn: (current: T) => T | Promise<T>): Promise<T>
  /** Test-only: drop the cached value/path so the next read hits the disk. */
  resetCacheForTests(): void
}

export function createJsonStore<T>(config: {
  /** File name inside the OS config dir (e.g. "settings.json"). */
  fileName: string
  /** Value used when the file is absent, unreadable, or fails `validate`. */
  fallback: () => T | Promise<T>
  /**
   * Coerces a freshly parsed JSON value into T, or returns null when the
   * parsed value is unusable (the fallback then applies). Must never
   * throw for malformed input -- it too is under the corrupt-file policy.
   */
  validate: (parsed: unknown) => T | null
  /** Pretty-print the JSON (settings is human-editable; the others stay compact). */
  pretty?: boolean
}): JsonStore<T> {
  let cachedPath: string | null = null
  let cached: T | null = null
  let writeChain: Promise<unknown> = Promise.resolve()

  async function filePath(): Promise<string> {
    if (cachedPath) return cachedPath
    const dir = await appConfigDir()
    if (!(await exists(dir))) {
      await mkdir(dir, { recursive: true })
    }
    cachedPath = await join(dir, config.fileName)
    return cachedPath
  }

  async function rawRead(): Promise<T> {
    try {
      const path = await filePath()
      if (await exists(path)) {
        const parsed: unknown = JSON.parse(await readTextFile(path))
        const valid = config.validate(parsed)
        if (valid !== null) return valid
      }
    } catch {
      // Corrupt/unreadable file -- the fallback below applies.
    }
    return await config.fallback()
  }

  async function read(): Promise<T> {
    if (cached === null) cached = await rawRead()
    return cached
  }

  // Atomic write: temp + rename within one filesystem. Falls back to a
  // plain write when the rename fails (a leftover .tmp is harmless; a
  // corrupt file is already handled by rawRead).
  async function write(value: T): Promise<void> {
    const path = await filePath()
    const tmpPath = `${path}.tmp`
    const contents = JSON.stringify(value, null, config.pretty ? 2 : undefined)
    try {
      await writeTextFile(tmpPath, contents)
      await rename(tmpPath, path)
    } catch {
      try {
        await writeTextFile(path, contents)
      } catch {
        // Disk full, permission error, ... -- silently skip.
      }
    }
  }

  return {
    read,
    mutate(fn) {
      const run = writeChain.then(async () => {
        const current = await read()
        const next = await fn(current)
        if (next !== current) {
          cached = next
          await write(next)
        }
        return next
      })
      // Keep the chain alive even when a mutation fails.
      writeChain = run.then(() => undefined, () => undefined)
      return run
    },
    resetCacheForTests() {
      cached = null
      cachedPath = null
      writeChain = Promise.resolve()
    },
  }
}
