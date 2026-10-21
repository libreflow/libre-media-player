import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const getPropertyMock = vi.hoisted(() => vi.fn(async (_name: string): Promise<unknown> => {
  throw new Error('mpv not initialized: no active window')
}))

vi.mock('tauri-plugin-libmpv-api', () => ({
  getProperty: getPropertyMock,
  setProperty: vi.fn(async () => {}),
  command: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => false),
}))

import { useSubtitles } from './useSubtitles'

// Regression test: useSubtitles.toggle() used to have no try/catch around
// its mpv calls, unlike every other user-triggered action in the app
// (openFile, togglePause, playlist ops) -- a thrown error
// (e.g. mpv not ready yet) propagated as an unhandled rejection out of
// `void subtitles.toggle()` in App.tsx instead of surfacing the standard
// French error banner via onError.
describe('useSubtitles.toggle', () => {
  it('reports the error via onError instead of rejecting uncaught', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useSubtitles(onError))

    await act(async () => {
      await result.current.toggle()
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toContain('mpv not initialized')
  })

  it('does not throw when onError is omitted (optional param)', async () => {
    const { result } = renderHook(() => useSubtitles())
    await expect(act(async () => {
      await result.current.toggle()
    })).resolves.not.toThrow()
  })
})

// Regression test: the subtitle button (CC icon, highlighted violet via
// `is-active` when `visible` is true) used to be driven by mpv's
// `sub-visibility` property alone. mpv keeps sub-visibility=yes even when
// no track is selected (sid=no, e.g. after picking "Désactivés" in the
// track menu), so the button stayed lit with no subtitles on screen.
describe('useSubtitles visible state with sid=no', () => {
  it('reports visible=false when no subtitle track is selected even if sub-visibility is yes', async () => {
    getPropertyMock.mockImplementation(async (name: string): Promise<unknown> => {
      if (name === 'sid') return 'no'
      if (name === 'sub-visibility') return true
      if (name === 'track-list/count') return 1
      if (/^track-list\/\d+\/type$/.test(name)) return 'sub'
      if (/^track-list\/\d+\/id$/.test(name)) return 1
      if (/^track-list\/\d+\/selected$/.test(name)) return false
      throw new Error(`unexpected property: ${name}`)
    })

    const { result } = renderHook(() => useSubtitles())

    await act(async () => {
      await result.current.onFileLoaded('/tmp/video.mkv')
    })

    expect(result.current.available).toBe(true)
    expect(result.current.visible).toBe(false)
  })
})

// Regression test: onFileLoaded is async and fire-and-forget from
// usePlayer, so two rapid file switches (next/prev spam) can interleave.
// Without a sequence guard, the OLDER call's late-resolving sidecar
// discovery would overwrite the NEWER file's subtitle state (wrong
// sidecar loaded into mpv, wrong visible/available flags). The fix: a
// monotonic sequence number -- any await point that finds a newer
// sequence bails without touching state.
describe('useSubtitles onFileLoaded out-of-order guard', () => {
  it('a stale (slower) onFileLoaded does not overwrite the newer file\'s state', async () => {
    // findSidecarSubtitle probes many candidate paths in parallel via
    // exists(). We make A's probes hang (manual promise) and B's resolve
    // immediately, so A's onFileLoaded is still awaiting when B's runs.
    let resolveA: (() => void) | null = null
    const aGate = new Promise<void>((r) => { resolveA = r })
    const fsMock = await import('@tauri-apps/plugin-fs')
    vi.mocked(fsMock.exists).mockImplementation(async (p: string | URL) => {
      const s = String(p)
      if (s.includes('/a.')) {
        await aGate // A's sidecar discovery hangs until we release it
        return false // A has no sidecar after all
      }
      if (s.includes('/b.')) return true // B has a sidecar
      return false
    })

    // B has a sidecar, so onFileLoaded(B) calls loadSubtitle + setVisible.
    // Track the loadSubtitle command to know B's sidecar was loaded.
    const { command } = await import('tauri-plugin-libmpv-api')
    const commandMock = vi.mocked(command)
    commandMock.mockClear()

    const { result } = renderHook(() => useSubtitles())

    // Start A's onFileLoaded (its sidecar probe hangs).
    const aDone = result.current.onFileLoaded('/tmp/a.mkv')
    // Let A reach the await findSidecarSubtitle(...) point.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    // Start B's onFileLoaded while A is still pending. B has a sidecar.
    await act(async () => {
      await result.current.onFileLoaded('/tmp/b.mkv')
    })
    // B completed: its sidecar was loaded and subtitles shown.
    expect(commandMock).toHaveBeenCalledWith('sub-add', expect.anything())
    expect(result.current.visible).toBe(true)
    const commandsAfterB = commandMock.mock.calls.length

    // Release A's gate. A's onFileLoaded resumes but its sequence is
    // stale (B started after A), so it must bail without touching state
    // or issuing any further mpv command.
    await act(async () => {
      resolveA!()
      await aDone
    })
    // No new sub-add from the stale A call.
    expect(commandMock.mock.calls.length).toBe(commandsAfterB)
    // B's visible state is untouched.
    expect(result.current.visible).toBe(true)
  })
})
