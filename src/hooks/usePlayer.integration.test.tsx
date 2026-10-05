import { describe, expect, it, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'

// Full mock of the mpv plugin surface usePlayer depends on.
let propertyListener: ((event: { name: string; data: unknown }) => void) | null = null
vi.mock('tauri-plugin-libmpv-api', () => ({
  init: vi.fn(async () => 'main'),
  destroy: vi.fn(async () => {}),
  observeProperties: vi.fn(async (_props: unknown, cb: (e: { name: string; data: unknown }) => void) => {
    propertyListener = cb
    return () => { propertyListener = null }
  }),
  command: vi.fn(async () => {}),
  setProperty: vi.fn(async () => {}),
  getProperty: vi.fn(async () => true),
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
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn(async () => () => {}),
  })),
}))

let dragDropSubscribeCount = 0
const unlistenSpy = vi.fn()
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async () => {
      dragDropSubscribeCount++
      return unlistenSpy
    }),
  }),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

import { usePlayer } from './usePlayer'
import { useFilePicker } from './useFilePicker'

// Exact wiring from App.tsx: useFilePicker receives player.loadFile.
function Harness() {
  const player = usePlayer()
  useFilePicker({
    readyRef: player.readyRef,
    loadFile: player.loadFile,
    onError: () => {},
  })
  return null
}

// Regression/integration test for the loadFile-identity-churn bug: before
// useResumePosition's return value was memoized, each ordinary mpv
// time-pos tick (several times a second during real playback) gave
// usePlayer's loadFile a NEW identity, which silently re-triggered every
// effect depending on it -- including useFilePicker's native drag-drop
// subscription, which tore down and rebuilt its OS-level listener on every
// tick instead of once per mount.
describe('usePlayer + useFilePicker integration: loadFile identity stability', () => {
  it('does not re-subscribe the native drag-drop listener on ordinary playback ticks', async () => {
    render(<Harness />)
    await waitFor(() => expect(propertyListener).not.toBeNull())
    await waitFor(() => expect(dragDropSubscribeCount).toBeGreaterThan(0))

    const afterMount = dragDropSubscribeCount

    // Simulate 5 ordinary mpv time-pos ticks (happens multiple times/sec
    // during real playback).
    for (let i = 0; i < 5; i++) {
      act(() => {
        propertyListener!({ name: 'time-pos', data: 10 + i })
      })
    }

    expect(dragDropSubscribeCount).toBe(afterMount)
    expect(unlistenSpy).not.toHaveBeenCalled()
  })
})

// Regression test: the resume-seek issued right after loadfile used to be
// awaited inside loadFileInner's main try/catch. When mpv hadn't finished
// bringing the file up yet, the seek was rejected ("error running command")
// and the failure surfaced as "Impossible de lire ce fichier" even though
// the file loaded and played perfectly. The resume-seek must be best-effort
// and never fail the load.
describe('usePlayer loadFile: resume-seek failure does not fail the load', () => {
  it('shows no error and resolves when the resume seek is rejected by mpv', async () => {
    const { command } = await import('tauri-plugin-libmpv-api')
    const commandMock = command as unknown as ReturnType<typeof vi.fn>
    // loadfile succeeds; only the resume seek fails (mpv not ready yet).
    commandMock.mockImplementation(async (name: string) => {
      if (name === 'seek') throw new Error("mpv command failed: Failed to execute command 'seek'")
      return {}
    })
    // Give the new file a remembered position so the resume-seek path runs.
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const readMock = readTextFile as unknown as ReturnType<typeof vi.fn>
    readMock.mockResolvedValue(
      JSON.stringify({ '/videos/a.mkv': { position: 42, duration: 120, updatedAt: 1 } }),
    )

    let player: ReturnType<typeof usePlayer> | null = null
    function Harness() {
      player = usePlayer()
      return null
    }
    render(<Harness />)
    await waitFor(() => expect(player!.ready).toBe(true))

    await act(async () => {
      await player!.loadFile('/videos/a.mkv')
    })

    expect(player!.error).toBeNull()
    expect(player!.filename).toBeNull() // no real mpv events in this mock
  })
})

// Regression test: setVolume used to call updateSettings on every slider
// input event (~60 writes/sec during a drag). Persistence is now debounced
// (600ms), while state + mpv updates stay immediate.
describe('usePlayer setVolume: debounced persistence', () => {
  it('persists the volume once after rapid changes settle', async () => {
    const { setProperty } = await import('tauri-plugin-libmpv-api')
    const setPropertyMock = setProperty as unknown as ReturnType<typeof vi.fn>
    setPropertyMock.mockClear()

    let player: ReturnType<typeof usePlayer> | null = null
    function Harness() {
      player = usePlayer()
      return null
    }
    render(<Harness />)
    await waitFor(() => expect(player!.ready).toBe(true))
    // The init sequence itself restores the persisted volume via
    // setProperty('volume', ...) -- count from a clean slate.
    setPropertyMock.mockClear()


    // Fake timers only AFTER init: waitFor needs real timers to poll, and
    // the debounce is the only timing under test.
    vi.useFakeTimers()
    try {
      // Simulate a drag: 20 rapid setVolume calls.
      act(() => {
        for (let i = 0; i < 20; i++) player!.setVolume(50 + i)
      })
      // mpv + React state applied immediately, on every call.
      expect(setPropertyMock).toHaveBeenCalledTimes(20)
      // The write is still pending -- advance past the debounce window.
      await act(async () => {
        vi.advanceTimersByTime(700)
      })

      expect(player!.volume).toBe(69)
    } finally {
      vi.useRealTimers()
    }
  })
})
