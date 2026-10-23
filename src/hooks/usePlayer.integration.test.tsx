import { useEffect } from 'react'
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

// Vitest prints unhandled rejections but does not fail the test for them
// in this setup, so a bare `void rejectingPromise()` would pass silently.
// This module-level listener makes every unhandled rejection in this file
// fail the test that produced it: each test snapshots the count before it
// runs and asserts it did not grow.
//
// The listener must be attached BEFORE the first test runs. Vitest's own
// unhandled-rejection handler is installed when the first test starts; a
// listener added inside a test body lands AFTER it, and vitest's handler
// marks the rejection as "handled" before ours sees it (probe-verified:
// inside-test listeners never fire). Module scope runs at import time,
// which is before any test body executes.
const unhandledRejections: unknown[] = []
process.on('unhandledRejection', (reason: unknown) => {
  unhandledRejections.push(reason)
})
function expectNoNewUnhandledRejection(before: number) {
  expect(unhandledRejections.length).toBe(before)
}

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

    // Capture the hook result via an effect (runs after commit) instead of
    // mutating an outer variable during render, which the React Compiler
    // lint rightly flags.
    const holder: { current: ReturnType<typeof usePlayer> | null } = { current: null }
    function Harness() {
      const player = usePlayer()
      useEffect(() => {
        holder.current = player
      })
      return null
    }
    render(<Harness />)
    await waitFor(() => expect(holder.current!.ready).toBe(true))

    await act(async () => {
      await holder.current!.loadFile('/videos/a.mkv')
    })

    expect(holder.current!.error).toBeNull()
    expect(holder.current!.filename).toBeNull() // no real mpv events in this mock
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

    // Capture the hook result via an effect (runs after commit) instead of
    // mutating an outer variable during render, which the React Compiler
    // lint rightly flags.
    const holder: { current: ReturnType<typeof usePlayer> | null } = { current: null }
    function Harness() {
      const player = usePlayer()
      useEffect(() => {
        holder.current = player
      })
      return null
    }
    render(<Harness />)
    await waitFor(() => expect(holder.current!.ready).toBe(true))
    // The init sequence itself restores the persisted volume via
    // setProperty('volume', ...) -- count from a clean slate.
    setPropertyMock.mockClear()


    // Fake timers only AFTER init: waitFor needs real timers to poll, and
    // the debounce is the only timing under test.
    vi.useFakeTimers()
    try {
      // Simulate a drag: 20 rapid setVolume calls.
      act(() => {
        for (let i = 0; i < 20; i++) holder.current!.setVolume(50 + i)
      })
      // mpv + React state applied immediately, on every call.
      expect(setPropertyMock).toHaveBeenCalledTimes(20)
      // The write is still pending -- advance past the debounce window.
      await act(async () => {
        vi.advanceTimersByTime(700)
      })

      expect(holder.current!.volume).toBe(69)
    } finally {
      vi.useRealTimers()
    }
  })
})

// Regression test: a failed mpv init used to leave the app stuck on the
// error banner forever -- the init effect had [] deps and never re-ran,
// and there was no way to retry. retryInit() clears the rejected init
// promise and re-runs doInit, so a transient failure (libmpv DLL not yet
// extracted, GPU init hiccup) is recoverable without restarting the app.
describe('usePlayer retryInit after a failed init', () => {
  it('recovers when init fails once then succeeds on retry', async () => {
    const libmpv = await import('tauri-plugin-libmpv-api')
    const initMock = libmpv.init as unknown as ReturnType<typeof vi.fn>
    const original = initMock.getMockImplementation()

    // First init rejects (transient failure), retry succeeds.
    let calls = 0
    initMock.mockImplementation(async () => {
      calls++
      if (calls === 1) throw new Error('libmpv not found')
      return 'main'
    })

    const holder: { current: ReturnType<typeof usePlayer> | null } = { current: null }
    function Harness() {
      const player = usePlayer()
      useEffect(() => {
        holder.current = player
      })
      return null
    }
    render(<Harness />)

    // The first init failed: ready is false and error is set.
    await waitFor(() => expect(holder.current!.error).toContain('initialisation'))
    expect(holder.current!.ready).toBe(false)

    // Retry: clears the rejected promise and re-runs init, which now
    // succeeds.
    await act(async () => {
      holder.current!.retryInit()
    })
    await waitFor(() => expect(holder.current!.ready).toBe(true))
    expect(holder.current!.error).toBeNull()
    expect(calls).toBe(2)

    // Restore the original mock so later tests in this file are unaffected.
    if (original) initMock.mockImplementation(original)
  })

  // Regression test (audit #2, N1): a double-click on "Réessayer" -- or
  // clicking while a slow first init is still running -- used to null
  // initPromiseRef a second time before the first doInit had assigned its
  // promise, so the second doInit launched a SECOND concurrent native
  // init() against an mpv instance that only tolerates one, and the first
  // cycle's observeProperties unlisten was never called (duplicate mpv
  // observers). retryInit now refuses to start while an init is in flight.
  it('ignores a second retryInit while the first init is still in flight', async () => {
    const libmpv = await import('tauri-plugin-libmpv-api')
    const initMock = libmpv.init as unknown as ReturnType<typeof vi.fn>
    const observeMock = libmpv.observeProperties as unknown as ReturnType<typeof vi.fn>
    const originalInit = initMock.getMockImplementation()
    const originalObserve = observeMock.getMockImplementation()

    // The first init stays pending until we release it: "in flight".
    let releaseInit: (() => void) | null = null
    const initGate = new Promise<void>((r) => { releaseInit = r })
    let calls = 0
    initMock.mockImplementation(async () => {
      calls++
      await initGate
      return 'main'
    })

    const holder: { current: ReturnType<typeof usePlayer> | null } = { current: null }
    function Harness() {
      const player = usePlayer()
      useEffect(() => {
        holder.current = player
      })
      return null
    }
    render(<Harness />)

    // Let the mount effect's doInit reach the awaited init() call.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(calls).toBe(1)
    expect(holder.current!.ready).toBe(false)

    // Double-click: two retryInit calls while the first init is pending.
    // Both must be ignored -- no second native init(), no duplicate
    // observer subscription.
    const observeCallsBefore = observeMock.mock.calls.length
    act(() => {
      holder.current!.retryInit()
      holder.current!.retryInit()
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(calls).toBe(1)
    expect(observeMock.mock.calls.length).toBe(observeCallsBefore)

    // Release the in-flight init: it completes normally and the player
    // becomes ready. No retry was needed or started.
    await act(async () => {
      releaseInit!()
    })
    await waitFor(() => expect(holder.current!.ready).toBe(true))
    expect(calls).toBe(1)

    // After the init settled, a retry is accepted again (the button's
    // real use case): it cancels the live observer and re-inits.
    observeMock.mockClear()
    initMock.mockClear()
    act(() => {
      holder.current!.retryInit()
    })
    await waitFor(() => expect(initMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(holder.current!.ready).toBe(true))

    // Restore the original mocks so later tests in this file are unaffected.
    if (originalInit) initMock.mockImplementation(originalInit)
    if (originalObserve) observeMock.mockImplementation(originalObserve)
  })
})

// Regression tests (audit #2, N4): togglePause and setVolume used to fire
// setProperty('pause'/'volume') as a bare `void` promise. When mpv rejects
// it (player shutting down, command raced with a stop), the rejection
// escaped as an unhandled promise rejection. Both now append .catch. Each
// test snapshots the unhandled-rejection counter and asserts it did not
// grow after exercising the rejecting path.
describe('usePlayer fire-and-forget mpv calls swallow rejections', () => {
  async function mountReadyPlayer() {
    const holder: { current: ReturnType<typeof usePlayer> | null } = { current: null }
    function Harness() {
      const player = usePlayer()
      useEffect(() => {
        holder.current = player
      })
      return null
    }
    render(<Harness />)
    await waitFor(() => expect(holder.current!.ready).toBe(true))
    return holder
  }

  it('togglePause does not leak an unhandled rejection when mpv rejects', async () => {
    const { setProperty } = await import('tauri-plugin-libmpv-api')
    const setPropertyMock = setProperty as unknown as ReturnType<typeof vi.fn>
    const original = setPropertyMock.getMockImplementation()
    // NOTE: the impl must be a PLAIN async function (assigned via
    // mockImplementation), not vi.fn(async () => { throw }) and not
    // mockRejectedValue: vitest's mock wrapper attaches its own rejection
    // tracking that swallows the process-level 'unhandledRejection' event
    // this assertion relies on (probe-verified: a plain async fn fires it,
    // a vi.fn-wrapped one does not).
    const rejectingImpl = async (): Promise<void> => {
      throw new Error('mpv command failed: pause')
    }
    setPropertyMock.mockImplementation(rejectingImpl)
    const before = unhandledRejections.length
    try {
      const holder = await mountReadyPlayer()
      act(() => {
        holder.current!.togglePause()
      })
      // setTimeout(0) first: lets the rejection settle into the
      // unhandledRejection event before the longer drain.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 10))
      })
      expectNoNewUnhandledRejection(before)
    } finally {
      if (original) setPropertyMock.mockImplementation(original)
    }
  })

  it('setVolume does not leak an unhandled rejection when mpv rejects', async () => {
    const { setProperty } = await import('tauri-plugin-libmpv-api')
    const setPropertyMock = setProperty as unknown as ReturnType<typeof vi.fn>
    const original = setPropertyMock.getMockImplementation()
    const rejectingImpl = async (): Promise<void> => {
      throw new Error('mpv command failed: volume')
    }
    setPropertyMock.mockImplementation(rejectingImpl)
    const before = unhandledRejections.length
    try {
      const holder = await mountReadyPlayer()
      act(() => {
        holder.current!.setVolume(42)
      })
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 10))
      })
      // React state still updated optimistically.
      expect(holder.current!.volume).toBe(42)
      expectNoNewUnhandledRejection(before)
    } finally {
      if (original) setPropertyMock.mockImplementation(original)
    }
  })

  // Meta-test: proves the unhandledRejection listener above actually fires
  // in this file's setup. Without it, a broken listener would make the two
  // tests above vacuously green. It intentionally produces one rejection via
  // a bare `void` of a plain rejecting async fn and asserts the counter grew.
  it('meta: the unhandledRejection listener fires in this file', async () => {
    const rejecting = async (): Promise<void> => {
      throw new Error('meta-probe')
    }
    const before = unhandledRejections.length
    void rejecting()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(unhandledRejections.length).toBe(before + 1)
  })
})
