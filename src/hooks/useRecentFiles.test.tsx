import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// useRecentFiles persists through recent.ts (plugin-fs under the hood);
// mock it so the hook's wiring (prune-on-mount, record->list update,
// open->loadFile, clear) is tested without a Tauri webview.
const recentMock = vi.hoisted(() => ({
  addRecentFile: vi.fn(async (path: string, name: string) => [
    { path, name, openedAt: 1 },
  ]),
  pruneRecentFiles: vi.fn(async () => [
    { path: 'C:/movies/a.mkv', name: 'a.mkv', openedAt: 1 },
    { path: 'C:/movies/b.mkv', name: 'b.mkv', openedAt: 2 },
  ]),
  clearRecentFiles: vi.fn(async () => {}),
}))

vi.mock('../recent', () => recentMock)

import { useRecentFiles } from './useRecentFiles'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useRecentFiles', () => {
  it('loads and shows the pruned recents list on mount', async () => {
    const { result } = renderHook(() =>
      useRecentFiles({ loadFile: vi.fn(), onError: vi.fn() }),
    )
    await waitFor(() => {
      expect(result.current.recents).toHaveLength(2)
    })
    expect(result.current.recents[0].path).toBe('C:/movies/a.mkv')
  })

  it('recordOpened updates the list from the persisted result', async () => {
    const { result } = renderHook(() =>
      useRecentFiles({ loadFile: vi.fn(), onError: vi.fn() }),
    )
    await waitFor(() => {
      expect(result.current.recents).toHaveLength(2)
    })
    act(() => result.current.recordOpened('C:/movies/new.mkv'))
    await waitFor(() => {
      expect(recentMock.addRecentFile).toHaveBeenCalledWith('C:/movies/new.mkv', 'new.mkv')
      expect(result.current.recents).toHaveLength(1)
    })
  })

  it('openRecent routes through loadFile', async () => {
    const loadFile = vi.fn(async () => {})
    const { result } = renderHook(() =>
      useRecentFiles({ loadFile, onError: vi.fn() }),
    )
    await waitFor(() => {
      expect(result.current.recents).toHaveLength(2)
    })
    act(() => result.current.openRecent('C:/movies/a.mkv'))
    await waitFor(() => {
      expect(loadFile).toHaveBeenCalledWith('C:/movies/a.mkv')
    })
  })

  it('openRecent surfaces loadFile failures through onError', async () => {
    const loadFile = vi.fn(async () => {
      throw new Error('boom')
    })
    const onError = vi.fn()
    const { result } = renderHook(() => useRecentFiles({ loadFile, onError }))
    await waitFor(() => {
      expect(result.current.recents).toHaveLength(2)
    })
    act(() => result.current.openRecent('C:/movies/a.mkv'))
    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
    })
  })

  it('clear empties the list and persists the clear', async () => {
    const { result } = renderHook(() =>
      useRecentFiles({ loadFile: vi.fn(), onError: vi.fn() }),
    )
    await waitFor(() => {
      expect(result.current.recents).toHaveLength(2)
    })
    act(() => result.current.clear())
    expect(result.current.recents).toEqual([])
    expect(recentMock.clearRecentFiles).toHaveBeenCalled()
  })
})

// Regression test (audit #4): openRecent used to bypass the queue with a
// bare load -- the reopened file played outside the playlist with no
// prev/next navigation. The hook now routes through onOpenRecent when the
// app provides one (App wires it to the queue) and only falls back to the
// bare load otherwise.
describe('useRecentFiles openRecent queue routing (audit #4)', () => {
  it('routes through onOpenRecent when provided, not the bare load', async () => {
    const loadFile = vi.fn(async () => {})
    const onOpenRecent = vi.fn()
    const { result } = renderHook(() =>
      useRecentFiles({ loadFile, onOpenRecent, onError: vi.fn() }),
    )
    await waitFor(() => {
      expect(result.current.recents).toHaveLength(2)
    })
    act(() => result.current.openRecent('C:/movies/a.mkv'))
    expect(onOpenRecent).toHaveBeenCalledWith('C:/movies/a.mkv')
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('falls back to the bare load when no routing is provided', async () => {
    const loadFile = vi.fn(async () => {})
    const { result } = renderHook(() =>
      useRecentFiles({ loadFile, onError: vi.fn() }),
    )
    await waitFor(() => {
      expect(result.current.recents).toHaveLength(2)
    })
    act(() => result.current.openRecent('C:/movies/a.mkv'))
    expect(loadFile).toHaveBeenCalledWith('C:/movies/a.mkv')
  })
})
