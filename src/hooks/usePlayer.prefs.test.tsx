import { useEffect } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

// usePlayer's mute/keep-speed behaviors, isolated from the filesystem: the
// settings module is fully mocked so each test controls the persisted
// preference, and the mpv surface is a spy-level mock like the integration
// file's (but without the drag-drop harness -- only the player is exercised).
// vi.hoisted keeps the setProperty spy referenceable from inside the hoisted
// vi.mock factory (a plain top-level const would still be in its TDZ when
// the factory runs).
const setPropertyMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('tauri-plugin-libmpv-api', () => ({
  init: vi.fn(async () => 'main'),
  destroy: vi.fn(async () => {}),
  observeProperties: vi.fn(async (_props: unknown, cb: (e: { name: string; data: unknown }) => void) => cb),
  command: vi.fn(async () => {}),
  setProperty: setPropertyMock,
  getProperty: vi.fn(async () => undefined),
}))
vi.mock('../settings', () => ({
  loadSettings: vi.fn(async () => ({ volume: 100, keepPlaybackSpeed: false })),
  updateSettings: vi.fn(async () => {}),
}))
// Same Tauri-internal mocks as the integration file: jsdom has no
// window.__TAURI_INTERNALS__, so getCurrentWindow/appConfigDir/plugin-fs
// throw at call time without them.
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn(async () => () => {}),
    onResized: vi.fn(async () => () => {}),
  })),
}))
vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/mock-config/'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => false),
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(async () => '{}'),
  writeTextFile: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
}))

import { usePlayer } from './usePlayer'

// Test-scope holder (NOT a component prop -- the React Compiler lint
// forbids mutating props; the integration file uses the same pattern).
let holder: { current: ReturnType<typeof usePlayer> | null } = { current: null }

function PrefsHarness() {
  const player = usePlayer()
  useEffect(() => {
    holder.current = player
  })
  return null
}

beforeEach(() => {
  setPropertyMock.mockClear()
  holder = { current: null }
})

describe('usePlayer.toggleMute', () => {
  it('mutes to 0 and unmutes back to the last non-zero volume', async () => {
    render(<PrefsHarness />)
    await waitFor(() => expect(holder.current?.ready).toBe(true))

    act(() => holder.current!.setVolume(50))
    act(() => {
      expect(holder.current!.toggleMute()).toBe(0)
    })
    expect(setPropertyMock).toHaveBeenLastCalledWith('volume', 0)
    act(() => {
      expect(holder.current!.toggleMute()).toBe(50)
    })
    expect(setPropertyMock).toHaveBeenLastCalledWith('volume', 50)
  })
})

describe('usePlayer keep-speed preference', () => {
  it('keeps the chosen speed across loadFile when the preference is on', async () => {
    const { loadSettings } = await import('../settings')
    vi.mocked(loadSettings).mockResolvedValue({ volume: 100, keepPlaybackSpeed: true } as never)

    render(<PrefsHarness />)
    await waitFor(() => expect(holder.current?.ready).toBe(true))
    // The preference narrows mpv's per-file reset list at init.
    expect(setPropertyMock).toHaveBeenCalledWith('reset-on-next-file', 'audio-delay,sub-delay')
    expect(holder.current!.keepPlaybackSpeed).toBe(true)

    act(() => { holder.current!.adjustSpeed(0.25) })
    expect(holder.current!.speed).toBe(1.25)
    await act(async () => { await holder.current!.loadFile('/videos/movie.mkv') })
    // With the preference on, the mirror keeps the user's speed instead of
    // resetting to 1 (mpv itself did not reset it either).
    expect(holder.current!.speed).toBe(1.25)
  })

  it('resets the speed to 1 on loadFile when the preference is off (default)', async () => {
    const { loadSettings } = await import('../settings')
    vi.mocked(loadSettings).mockResolvedValue({ volume: 100, keepPlaybackSpeed: false } as never)

    render(<PrefsHarness />)
    await waitFor(() => expect(holder.current?.ready).toBe(true))

    act(() => { holder.current!.adjustSpeed(0.25) })
    expect(holder.current!.speed).toBe(1.25)
    await act(async () => { await holder.current!.loadFile('/videos/movie.mkv') })
    expect(holder.current!.speed).toBe(1)
  })
})
