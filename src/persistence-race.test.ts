import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression tests for the read-modify-write races in the persistence
// modules (resume.ts, settings.ts, recent.ts). Each module used to do
// `await read() → mutate → await write()` with no cache and no
// serialization, so two concurrent operations could each read the
// pre-write snapshot and the later write clobbered the earlier entry.
//
// The fix: an in-memory cache (reads always see the latest committed
// state) + a write chain (every mutation chains behind the previous one).
// These tests fire two concurrent operations and assert BOTH updates
// survive.

const memory = new Map<string, string>()

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/mock-config/'),
  join: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async (p: string) => p.endsWith('/') || memory.has(p)),
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(async (p: string) => {
    if (!memory.has(p)) throw new Error('not found')
    return memory.get(p)!
  }),
  writeTextFile: vi.fn(async (p: string, contents: string) => {
    memory.set(p, contents)
  }),
  rename: vi.fn(async (from: string, to: string) => {
    if (!memory.has(from)) throw new Error('not found')
    memory.set(to, memory.get(from)!)
    memory.delete(from)
  }),
}))

import {
  __resetResumeCacheForTests,
  getResumePosition,
  saveResumePosition,
} from './resume'
import { __resetRecentCacheForTests, addRecentFile, loadRecentFiles } from './recent'

const A = 'C:/movies/a.mkv'
const B = 'C:/movies/b.mkv'

beforeEach(() => {
  memory.clear()
  __resetResumeCacheForTests()
  __resetRecentCacheForTests()
  // Files must "exist" for resume's prunedMap and recent's prune.
  memory.set(A, '')
  memory.set(B, '')
})

describe('resume.ts: concurrent saves do not lose entries', () => {
  it('two overlapping saveResumePosition calls both persist', async () => {
    // Fire both saves without awaiting the first: with the old
    // read-modify-write, the second read the pre-write map and the
    // later write clobbered the first entry.
    await Promise.all([
      saveResumePosition(A, 100, 7200),
      saveResumePosition(B, 200, 7200),
    ])
    expect(await getResumePosition(A)).toBe(100)
    expect(await getResumePosition(B)).toBe(200)
  })
})

describe('recent.ts: concurrent adds do not lose entries', () => {
  it('two overlapping addRecentFile calls both persist', async () => {
    const [listA, listB] = await Promise.all([
      addRecentFile(A, 'a.mkv'),
      addRecentFile(B, 'b.mkv'),
    ])
    // Both entries must be present in the final persisted list.
    const final = await loadRecentFiles()
    const paths = final.map((e) => e.path)
    expect(paths).toContain(A)
    expect(paths).toContain(B)
    // Each returned list reflects a consistent snapshot.
    expect(listA.length).toBeGreaterThanOrEqual(1)
    expect(listB.length).toBeGreaterThanOrEqual(1)
  })
})
