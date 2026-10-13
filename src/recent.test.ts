import { beforeEach, describe, expect, it, vi } from 'vitest'

// recent.ts talks to the filesystem through @tauri-apps/plugin-fs and
// @tauri-apps/api/path, which only exist inside a Tauri webview. Mock both
// modules so the pure list logic (dedupe, cap, ordering, tolerance of
// malformed entries) can be tested in isolation.

const memory = new Map<string, string>()

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/mock-config/'),
  // Normalize double slashes: appConfigDir() returns a trailing separator,
  // and the real join() collapses the resulting '//'.
  join: vi.fn(async (...parts: string[]) =>
    parts.join('/').replaceAll('//', '/'),
  ),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  // Directories (trailing slash) always exist in this mock filesystem.
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
  addRecentFile,
  clearRecentFiles,
  loadRecentFiles,
  MAX_RECENT_FILES,
  pruneRecentFiles,
} from './recent'

const A = 'C:/movies/a.mkv'
const B = 'C:/movies/b.mkv'

beforeEach(() => {
  memory.clear()
  // Files recorded by addRecentFile must "exist" for pruneRecentFiles.
  memory.set(A, '')
  memory.set(B, '')
})

describe('addRecentFile / loadRecentFiles', () => {
  it('adds a new file at the top of an empty list', async () => {
    const list = await addRecentFile(A, 'a.mkv')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ path: A, name: 'a.mkv' })
    expect(await loadRecentFiles()).toHaveLength(1)
  })

  it('re-adding an existing path moves it to the top without duplicating', async () => {
    await addRecentFile(A, 'a.mkv')
    await addRecentFile(B, 'b.mkv')
    const list = await addRecentFile(A, 'a.mkv')
    expect(list.map((e) => e.path)).toEqual([A, B])
  })

  it('caps the list at MAX_RECENT_FILES, evicting the oldest', async () => {
    for (let i = 0; i < MAX_RECENT_FILES + 3; i++) {
      await addRecentFile(`C:/movies/file-${i}.mkv`, `file-${i}.mkv`)
    }
    const list = await loadRecentFiles()
    expect(list).toHaveLength(MAX_RECENT_FILES)
    // Most recent first, oldest evicted.
    expect(list[0].path).toBe(`C:/movies/file-${MAX_RECENT_FILES + 2}.mkv`)
    expect(list.find((e) => e.path === 'C:/movies/file-0.mkv')).toBeUndefined()
  })

  it('survives a corrupt recents file (treated as empty list)', async () => {
    memory.set('/mock-config/recent.json', '{not json')
    const list = await addRecentFile(A, 'a.mkv')
    expect(list).toHaveLength(1)
    expect(await loadRecentFiles()).toHaveLength(1)
  })

  it('drops malformed entries when loading a partially valid file', async () => {
    memory.set(
      '/mock-config/recent.json',
      JSON.stringify([{ path: A, name: 'a.mkv', openedAt: 1 }, { nope: true }, 'string']),
    )
    const list = await loadRecentFiles()
    expect(list).toHaveLength(1)
    expect(list[0].path).toBe(A)
  })
})

describe('pruneRecentFiles', () => {
  it('drops entries whose file no longer exists on disk', async () => {
    await addRecentFile(A, 'a.mkv')
    await addRecentFile(B, 'b.mkv')
    memory.delete(B)
    const list = await pruneRecentFiles()
    expect(list.map((e) => e.path)).toEqual([A])
    expect(await loadRecentFiles()).toHaveLength(1)
  })

  it('keeps the list untouched when every file still exists', async () => {
    await addRecentFile(A, 'a.mkv')
    const list = await pruneRecentFiles()
    expect(list.map((e) => e.path)).toEqual([A])
  })
})

describe('clearRecentFiles', () => {
  it('empties the persisted list', async () => {
    await addRecentFile(A, 'a.mkv')
    await clearRecentFiles()
    expect(await loadRecentFiles()).toEqual([])
  })
})
