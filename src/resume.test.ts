import { beforeEach, describe, expect, it, vi } from 'vitest'

// resume.ts talks to the filesystem through @tauri-apps/plugin-fs and
// @tauri-apps/api/path, which only exist inside a Tauri webview. Mock both
// modules so the pure threshold logic (MIN_RESUMABLE / FINISHED) can be
// tested in isolation.
const memory = new Map<string, string>()

vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/mock-config/'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async (p: string) => memory.has(p)),
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(async (p: string) => {
    if (!memory.has(p)) throw new Error('not found')
    return memory.get(p)!
  }),
  writeTextFile: vi.fn(async (p: string, contents: string) => {
    memory.set(p, contents)
  }),
}))

import { __resetResumeCacheForTests, getResumePosition, saveResumePosition } from './resume'

const PATH = 'C:/movies/film.mkv'

beforeEach(() => {
  memory.clear()
  // The resume module caches the map + path at module level; reset them
  // so each test starts from a clean slate (no leak from a previous test).
  __resetResumeCacheForTests()
  // prunedMap() checks that each tracked video still exists on disk; the
  // test's PATH must therefore "exist" in the mocked filesystem.
  memory.set(PATH, '')
})

describe('saveResumePosition / getResumePosition', () => {
  it('round-trips a mid-playback position', async () => {
    await saveResumePosition(PATH, 600, 7200)
    expect(await getResumePosition(PATH)).toBe(600)
  })

  it('does not resume when too close to the start', async () => {
    await saveResumePosition(PATH, 3, 7200)
    expect(await getResumePosition(PATH)).toBeNull()
  })

  it('drops the entry when the file is finished (>= 97%)', async () => {
    await saveResumePosition(PATH, 600, 7200)
    await saveResumePosition(PATH, 7100, 7200)
    expect(await getResumePosition(PATH)).toBeNull()
  })

  it('handles a null duration without treating the file as finished', async () => {
    await saveResumePosition(PATH, 600, 0)
    expect(await getResumePosition(PATH)).toBe(600)
  })

  it('returns null for a never-played file', async () => {
    expect(await getResumePosition('C:/movies/other.mkv')).toBeNull()
  })

  it('survives a corrupt resume file (treated as empty map)', async () => {
    memory.set('/mock-config/resume.json', '{not json')
    await saveResumePosition(PATH, 600, 7200)
    expect(await getResumePosition(PATH)).toBe(600)
  })
})
