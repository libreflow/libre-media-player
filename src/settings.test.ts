import { beforeEach, describe, expect, it, vi } from 'vitest'

// settings.ts talks to the filesystem through @tauri-apps/plugin-fs and
// @tauri-apps/api/path, which only exist inside a Tauri webview. Mock both
// with an in-memory filesystem so the parsing/validation logic is testable.

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

// The settings module caches at module level; drop the cache between tests.
// There is no exported reset for settings (unlike resume/recent), so tests
// that need a fresh read re-import the module.
async function freshLoad() {
  vi.resetModules()
  return await import('./settings')
}

beforeEach(() => {
  memory.clear()
})

describe('loadSettings validation', () => {
  it('returns defaults when the file does not exist', async () => {
    const { loadSettings } = await freshLoad()
    await expect(loadSettings()).resolves.toEqual({
      volume: 100,
      shuffle: false,
      repeat: false,
      locale: 'fr',
      preferredAudioLang: 'any',
    })
  })

  it('falls back to defaults when the file is not valid JSON', async () => {
    memory.set('/mock-config/settings.json', '{oops')
    const { loadSettings } = await freshLoad()
    await expect(loadSettings().then((s) => s.locale)).resolves.toBe('fr')
  })

  it('accepts a well-formed file as-is', async () => {
    memory.set(
      '/mock-config/settings.json',
      JSON.stringify({ volume: 42, shuffle: true, repeat: false, locale: 'en', preferredAudioLang: 'fre' }),
    )
    const { loadSettings } = await freshLoad()
    await expect(loadSettings()).resolves.toEqual({
      volume: 42,
      shuffle: true,
      repeat: false,
      locale: 'en',
      preferredAudioLang: 'fre',
    })
  })

  it('per-key fallback: a wrong-typed value falls back to its default without poisoning the others', async () => {
    // Regression: the old `{ ...DEFAULTS, ...parsed }` merge accepted any
    // syntactically valid JSON, so a hand-edited "volume": "abc" flowed
    // straight into setProperty('volume', ...) and silently failed at
    // startup, and an unknown locale string broke the language switch.
    memory.set(
      '/mock-config/settings.json',
      JSON.stringify({ volume: 'abc', locale: 'de', shuffle: true }),
    )
    const { loadSettings } = await freshLoad()
    await expect(loadSettings()).resolves.toEqual({
      volume: 100, // invalid -> default
      shuffle: true, // valid -> kept
      repeat: false,
      locale: 'fr', // unknown -> default
      preferredAudioLang: 'any',
    })
  })

  it('updateSettings still merges onto the validated base', async () => {
    memory.set('/mock-config/settings.json', JSON.stringify({ volume: 'oops', locale: 'en' }))
    const mod = await freshLoad()
    await mod.updateSettings({ shuffle: true })
    const saved = JSON.parse(memory.get('/mock-config/settings.json')!)
    expect(saved).toMatchObject({ volume: 100, locale: 'en', shuffle: true })
  })
})
