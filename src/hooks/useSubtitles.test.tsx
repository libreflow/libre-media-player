import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const getPropertyMock = vi.hoisted(() => vi.fn(async (_name: string): Promise<unknown> => {
  throw new Error('mpv not initialized: no active window')
}))
const existsMock = vi.hoisted(() => vi.fn(async (_p: string | URL): Promise<boolean> => false))

vi.mock('tauri-plugin-libmpv-api', () => ({
  getProperty: getPropertyMock,
  setProperty: vi.fn(async () => {}),
  command: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
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

// Regression test: mpv DISCARDS tracks added via sub-add on every loadfile
// (and on stop). Re-loading the same path -- a one-file repeat loop wrapping
// around, or stop-then-reopen from the recents list -- must therefore re-add
// the sidecar. The guard used to be the bare path, so the second onFileLoaded
// for the same path skipped the sub-add and subtitles silently disappeared
// from the second playthrough onward. The fix keys the guard on a load
// GENERATION (incremented per loadfile/stop by usePlayer): same path within
// the same load = skip, same path in a NEW generation = re-add.
describe('useSubtitles sidecar reload for the same path', () => {
  it('re-adds the sidecar when the same path is loaded in a new generation', async () => {
    const fsMock = await import('@tauri-apps/plugin-fs')
    vi.mocked(fsMock.exists).mockImplementation(async () => true)
    const { command } = await import('tauri-plugin-libmpv-api')
    const commandMock = vi.mocked(command)
    commandMock.mockClear()

    const { result } = renderHook(() => useSubtitles())

    // First load (generation 1): sidecar discovered and added.
    await act(async () => {
      await result.current.onFileLoaded('/tmp/video.mkv', 1)
    })
    expect(commandMock).toHaveBeenCalledWith('sub-add', ['/tmp/video.srt', 'auto'])
    expect(result.current.visible).toBe(true)

    // Second load of the SAME path, new generation (e.g. repeat wrap or
    // stop+reopen): the sidecar must be re-added, not skipped.
    commandMock.mockClear()
    await act(async () => {
      await result.current.onFileLoaded('/tmp/video.mkv', 2)
    })
    expect(commandMock).toHaveBeenCalledWith('sub-add', ['/tmp/video.srt', 'auto'])
    expect(result.current.visible).toBe(true)
  })

  it('does not re-add the sidecar when onFileLoaded re-runs within the same load', async () => {
    const fsMock = await import('@tauri-apps/plugin-fs')
    vi.mocked(fsMock.exists).mockImplementation(async () => true)
    const { command } = await import('tauri-plugin-libmpv-api')
    const commandMock = vi.mocked(command)
    commandMock.mockClear()

    const { result } = renderHook(() => useSubtitles())

    await act(async () => {
      await result.current.onFileLoaded('/tmp/video.mkv', 7)
    })
    expect(commandMock).toHaveBeenCalledWith('sub-add', ['/tmp/video.srt', 'auto'])
    const addsAfterFirst = commandMock.mock.calls.filter(
      (c) => c[0] === 'sub-add',
    ).length

    // Same path, same generation (e.g. a duplicate onFileLoaded call for the
    // current load): the sidecar must NOT be added again.
    await act(async () => {
      await result.current.onFileLoaded('/tmp/video.mkv', 7)
    })
    expect(
      commandMock.mock.calls.filter((c) => c[0] === 'sub-add').length,
    ).toBe(addsAfterFirst)
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

// Regression test (audit #2, N3): loadedForRef used to be set to the video
// path OPTIMISTICALLY -- at the top of the `if (loadedForRef.current !==
// videoPath)` block, BEFORE the awaited loadSubtitle/setSubtitleVisible
// calls. When a second load of the SAME path started while the first was
// still awaiting (rapid next/prev back to the same file, or a superseded
// call bailing at a guard), the first call's `loadedForRef = path` had
// already landed, so the second call saw `loadedForRef === path` and
// skipped the sidecar entirely -- no subtitle was ever loaded. The ref is
// now set only after every mpv call in the block has succeeded AND the
// call is still the latest.
describe('useSubtitles onFileLoaded same-path rapid reload (N3)', () => {
  it('a second load of the same path still loads the sidecar when the first call was superseded mid-flight', async () => {
    // The sidecar exists for /tmp/same.mkv from the start. The FIRST
    // onFileLoaded call is gated inside loadSubtitle (its sub-add command
    // hangs on a manual promise), so when the SECOND onFileLoaded of the
    // SAME path runs, the first is still in flight. With the OLD code,
    // the first call had already set loadedForRef = '/tmp/same.mkv'
    // optimistically (at the top of the loadedFor block, BEFORE its
    // awaits), so the second call saw loadedForRef === path and skipped
    // the sidecar entirely: no second sub-add, visible stays false. With
    // the fix, the first call has not set loadedForRef yet (it bails at
    // the superseded() guard after its gated sub-add resolves), so the
    // second call loads the sidecar: sub-add fires, visible becomes true.
    existsMock.mockImplementation(async (p: string | URL) => String(p).endsWith('/same.srt'))

    // Gate the FIRST sub-add command on a manual promise.
    let resolveFirstSubAdd: (() => void) | null = null
    const firstSubAddGate = new Promise<void>((r) => { resolveFirstSubAdd = r })
    let subAddCalls = 0
    const { command } = await import('tauri-plugin-libmpv-api')
    const commandMock = vi.mocked(command)
    commandMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'sub-add') {
        subAddCalls++
        if (subAddCalls === 1) await firstSubAddGate // first call hangs here
      }
    })
    getPropertyMock.mockImplementation(async (name: string): Promise<unknown> => {
      if (name === 'track-list/count') return 0
      if (name === 'sid') return 'no'
      if (name === 'sub-visibility') return true
      throw new Error(`unexpected property: ${name}`)
    })

    const { result } = renderHook(() => useSubtitles())

    // First onFileLoaded('/tmp/same.mkv'): sidecar found, sub-add gated.
    const firstDone = result.current.onFileLoaded('/tmp/same.mkv')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(subAddCalls).toBe(1)

    // Second onFileLoaded('/tmp/same.mkv') while the first is gated.
    // It must load the sidecar (a second sub-add) and show it.
    await act(async () => {
      await result.current.onFileLoaded('/tmp/same.mkv')
    })
    expect(commandMock).toHaveBeenCalledWith('sub-add', expect.anything())
    expect(result.current.visible).toBe(true)
    expect(subAddCalls).toBe(2)

    // Release the first call. Its sequence is stale, so it bails at the
    // superseded() guard -- without having poisoned loadedForRef in a way
    // that breaks the second call.
    await act(async () => {
      resolveFirstSubAdd!()
      await firstDone
    })
    // Still exactly two sub-adds; the stale first call issued no extra.
    expect(subAddCalls).toBe(2)
    expect(result.current.visible).toBe(true)
  })
})

// Regression test (audit #2, N2): refreshTracks() at the end of
// onFileLoaded issues several sequential mpv IPC calls (getProperty per
// track field). A newer onFileLoaded can start while the older call's
// refresh is still pending; without a guard, the stale refresh commits
// its (older file's) track list AFTER the newer call already set the
// newer file's -- the track menu then shows the wrong file's tracks.
// The fix threads onFileLoaded's sequence guard into refreshTracks so a
// stale refresh bails before every setState.
describe('useSubtitles stale refreshTracks does not overwrite newer tracks (N2)', () => {
  it('a stale refreshTracks does not overwrite the newer file\'s subTracks', async () => {
    // getTracks reads 'track-list/count' first, then per-track fields.
    // A's onFileLoaded calls getProperty('track-list/count') twice: once in
    // countSubtitleTracks (the embedded-sub check) and once inside the
    // refreshTracks at the end. Gate only the SECOND call for file A (the
    // refreshTracks one) on a manual promise; every other call resolves
    // immediately. That leaves A fully finished except its refresh, which
    // hangs -- exactly the interleaving the staleness guard protects
    // against.
    let currentFile = 'a'
    let resolveAGate: (() => void) | null = null
    const aGate = new Promise<void>((r) => { resolveAGate = r })
    const countCalls: string[] = []
    getPropertyMock.mockImplementation(async (name: string): Promise<unknown> => {
      if (name === 'track-list/count') {
        countCalls.push(currentFile)
        if (currentFile === 'a' && countCalls.filter((f) => f === 'a').length === 2) {
          await aGate // A's refreshTracks count call hangs until released
          return 1 // A has 1 sub track
        }
        return currentFile === 'a' ? 1 : 2
      }
      if (name === 'sid') return currentFile === 'a' ? 'no' : '1'
      if (name === 'sub-visibility') return false
      if (/^track-list\/\d+\/type$/.test(name)) return 'sub'
      if (/^track-list\/\d+\/id$/.test(name)) {
        const idx = Number(/^track-list\/(\d+)\/id$/.exec(name)![1])
        return currentFile === 'a' ? 1 : idx + 10 // B's ids: 10, 11
      }
      if (/^track-list\/\d+\/selected$/.test(name)) return false
      throw new Error(`unexpected property: ${name}`)
    })

    const fsMock = await import('@tauri-apps/plugin-fs')
    // No sidecars for either file: the sidecar branch is skipped and the
    // flow goes straight to refreshTracks.
    vi.mocked(fsMock.exists).mockImplementation(async () => false)

    const { result } = renderHook(() => useSubtitles())

    // Start A's onFileLoaded. It finds no sidecar, counts embedded subs,
    // and hangs inside its final refreshTracks' first getProperty.
    currentFile = 'a'
    const aDone = result.current.onFileLoaded('/tmp/a.mkv')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })

    // Start B's onFileLoaded while A's refresh is gated. B completes fully
    // and sets subTracks to B's two tracks (ids 10 and 11).
    currentFile = 'b'
    await act(async () => {
      await result.current.onFileLoaded('/tmp/b.mkv')
    })
    expect(result.current.subTracks.map((t) => t.id)).toEqual([10, 11])

    // Release A's gate. A's refreshTracks resumes; with the old code it
    // would commit A's tracks (id 1) over B's. With the fix, the staleness
    // guard bails before setSubTracks.
    await act(async () => {
      resolveAGate!()
      await aDone
    })
    expect(result.current.subTracks.map((t) => t.id)).toEqual([10, 11])
  })
})
