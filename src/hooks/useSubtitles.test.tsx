import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('tauri-plugin-libmpv-api', () => ({
  getProperty: vi.fn(async () => {
    throw new Error('mpv not initialized: no active window')
  }),
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
