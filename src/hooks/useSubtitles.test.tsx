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
