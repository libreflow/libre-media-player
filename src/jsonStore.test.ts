import { beforeEach, describe, expect, it, vi } from 'vitest'

// jsonStore.ts talks to the filesystem through @tauri-apps/plugin-fs and
// @tauri-apps/api/path, which only exist inside a Tauri webview. Mock both
// modules so the shared persistence core (cache, corrupt-file fallback,
// no-op write skipping, serialized mutations) is tested in isolation.

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
  rename: vi.fn(async (from: string, to: string) => {
    memory.set(to, memory.get(from) ?? '')
    memory.delete(from)
  }),
}))

import { createJsonStore } from './jsonStore'

interface Entry {
  value: string
}

function makeStore(pretty = false) {
  return createJsonStore<Entry>({
    fileName: 'store.json',
    fallback: () => ({ value: 'fallback' }),
    validate: (parsed) =>
      typeof parsed === 'object' && parsed !== null && typeof (parsed as Entry).value === 'string'
        ? (parsed as Entry)
        : null,
    pretty,
  })
}

// The mocked join concats the config dir (already slash-terminated) and the
// file name, so the store lives under a double-slash path in tests.
const STORE_PATH = '/mock-config//store.json'

beforeEach(() => {
  memory.clear()
})

describe('createJsonStore.read', () => {
  it('returns the fallback when the file does not exist', async () => {
    const store = makeStore()
    expect(await store.read()).toEqual({ value: 'fallback' })
  })

  it('validates and returns the persisted value', async () => {
    memory.set(STORE_PATH, '{"value":"persisted"}')
    const store = makeStore()
    expect(await store.read()).toEqual({ value: 'persisted' })
  })

  it('falls back on a corrupt file instead of throwing', async () => {
    memory.set(STORE_PATH, '{not json')
    const store = makeStore()
    expect(await store.read()).toEqual({ value: 'fallback' })
  })

  it('falls back when validate rejects the parsed shape', async () => {
    memory.set(STORE_PATH, '{"value":42}')
    const store = makeStore()
    expect(await store.read()).toEqual({ value: 'fallback' })
  })
})

describe('createJsonStore.mutate', () => {
  it('persists the returned value and updates the cache', async () => {
    const store = makeStore()
    const next = await store.mutate((current) => ({ value: `${current.value}!` }))
    expect(next).toEqual({ value: 'fallback!' })
    // The cache carries the mutation: a read right after sees it.
    expect(await store.read()).toEqual({ value: 'fallback!' })
  })

  it('skips the disk write when the mutation returns the current value', async () => {
    const store = makeStore()
    await store.mutate(() => ({ value: 'first' }))
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    vi.mocked(writeTextFile).mockClear()
    const same = await store.mutate((current) => current)
    expect(same).toEqual({ value: 'first' })
    expect(writeTextFile).not.toHaveBeenCalled()
  })

  it('serializes concurrent mutations so none is lost', async () => {
    const store = makeStore()
    // Two mutations racing: the chain must apply both, in order.
    await Promise.all([
      store.mutate(() => ({ value: 'a' })),
      store.mutate((current) => ({ value: `${current.value}-b` })),
    ])
    expect(await store.read()).toEqual({ value: 'a-b' })
  })
})

// Contract documentation: mutate SKIPS the disk write when the same object
// reference is returned. This is what makes `pruneRecentFiles` cheap (and
// resume's periodic checkpoints write only when the data actually
// changed) -- but it also means callers must return a FRESH object to
// persist an in-place mutation. settings.saveSettings documents the same
// pitfall for its whole-file save.
describe('createJsonStore.mutate identity contract', () => {
  it('does not write when the mutation returns the same object reference', async () => {
    const store = makeStore()
    await store.mutate(() => ({ value: 'first' }))
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    vi.mocked(writeTextFile).mockClear()
    // Same reference returned: no write.
    await store.mutate((current) => current)
    expect(writeTextFile).not.toHaveBeenCalled()
    // In-place mutation of the cached object returned AS-IS: STILL no
    // write -- the documented trap callers must avoid.
    await store.mutate((current) => {
      ;(current as { value: string }).value = 'mutated in place'
      return current
    })
    expect(writeTextFile).not.toHaveBeenCalled()
    expect(await store.read()).toEqual({ value: 'mutated in place' })
  })
})
