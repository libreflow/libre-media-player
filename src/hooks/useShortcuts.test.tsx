import { act, cleanup, render } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const setPropertyMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('tauri-plugin-libmpv-api', () => ({
  setProperty: setPropertyMock,
}))

import { useKeyboardShortcuts } from './useShortcuts'

// Regression test for a stale-closure bug: useKeyboardShortcuts used to
// depend on [isFullscreen, volume, toggleFullscreen, togglePause] only.
// toggleMotion/togglePlaylist are plain inline arrows recreated on every
// App render (not useCallback-memoized), so the keydown listener captured
// whichever closure existed at the last re-subscribe -- in practice the
// very first render, since togglePause/toggleFullscreen stay referentially
// stable. Pressing 'm' or 'l' a second time called a STALE closure that
// still read the original state and always recomputed the same result,
// so the shortcut visibly worked once then appeared frozen.
function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

// Mirrors the real reference-stability shape from App.tsx: togglePause and
// toggleFullscreen are useCallback-stabilized; toggleMotion/togglePlaylist
// are freshly-created arrows closing over local state, exactly like
// `() => void motion.toggle()` and `() => playlist.setPanelOpen(!playlist.panelOpen)`.
function Harness({ onSnapshot }: { onSnapshot: (s: { enabled: boolean; panelOpen: boolean }) => void }) {
  const [enabled, setEnabled] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const stableTogglePause = useCallback(() => {}, [])
  const stableToggleFullscreen = useCallback(() => {}, [])
  // Exact replica of useMotionInterpolation's `toggle`: useCallback closing
  // over `enabled`, deps=[enabled] (not an updater function).
  const motionToggle = useCallback(() => setEnabled(!enabled), [enabled])

  useKeyboardShortcuts({
    hasMedia: true,
    volume: 100,
    isFullscreen: false,
    isPlaylistOpen: panelOpen,
    togglePause: stableTogglePause,
    toggleFullscreen: stableToggleFullscreen,
    toggleSubtitles: () => {},
    toggleMotion: () => motionToggle(),
    playNext: () => {},
    playPrevious: () => {},
    togglePlaylist: () => setPanelOpen(!panelOpen),
  })

  onSnapshot({ enabled, panelOpen })
  return null
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('toggles motion ("m") repeatedly, not just once, when togglePause/toggleFullscreen stay stable', () => {
    const snapshots: { enabled: boolean; panelOpen: boolean }[] = []
    render(<Harness onSnapshot={(s) => snapshots.push(s)} />)

    act(() => press('m'))
    expect(snapshots.at(-1)!.enabled).toBe(true)

    act(() => press('m'))
    expect(snapshots.at(-1)!.enabled).toBe(false)

    act(() => press('m'))
    expect(snapshots.at(-1)!.enabled).toBe(true)
  })

  it('toggles the playlist panel ("l") repeatedly, not just once', () => {
    const snapshots: { enabled: boolean; panelOpen: boolean }[] = []
    render(<Harness onSnapshot={(s) => snapshots.push(s)} />)

    act(() => press('l'))
    expect(snapshots.at(-1)!.panelOpen).toBe(true)

    act(() => press('l'))
    expect(snapshots.at(-1)!.panelOpen).toBe(false)

    act(() => press('l'))
    expect(snapshots.at(-1)!.panelOpen).toBe(true)
  })

  it('still respects hasMedia=false by not calling togglePause on space/k', () => {
    const togglePause = vi.fn()
    function NoMediaHarness() {
      useKeyboardShortcuts({
        hasMedia: false,
        volume: 100,
        isFullscreen: false,
        isPlaylistOpen: false,
        togglePause,
        toggleFullscreen: () => {},
        toggleSubtitles: () => {},
        toggleMotion: () => {},
        playNext: () => {},
        playPrevious: () => {},
        togglePlaylist: () => {},
      })
      return null
    }
    render(<NoMediaHarness />)
    act(() => press('k'))
    expect(togglePause).not.toHaveBeenCalled()
  })

  it('Escape closes the playlist panel first, before touching fullscreen', () => {
    const toggleFullscreen = vi.fn()
    const togglePlaylist = vi.fn()
    function EscapeHarness({ isPlaylistOpen }: { isPlaylistOpen: boolean }) {
      useKeyboardShortcuts({
        hasMedia: true,
        volume: 100,
        isFullscreen: true,
        isPlaylistOpen,
        togglePause: () => {},
        toggleFullscreen,
        toggleSubtitles: () => {},
        toggleMotion: () => {},
        playNext: () => {},
        playPrevious: () => {},
        togglePlaylist,
      })
      return null
    }
    render(<EscapeHarness isPlaylistOpen={true} />)
    act(() => press('Escape'))
    expect(togglePlaylist).toHaveBeenCalledTimes(1)
    expect(toggleFullscreen).not.toHaveBeenCalled()
  })

  it('Escape falls back to exiting fullscreen when the playlist is already closed', () => {
    const toggleFullscreen = vi.fn()
    const togglePlaylist = vi.fn()
    function EscapeHarness({ isPlaylistOpen }: { isPlaylistOpen: boolean }) {
      useKeyboardShortcuts({
        hasMedia: true,
        volume: 100,
        isFullscreen: true,
        isPlaylistOpen,
        togglePause: () => {},
        toggleFullscreen,
        toggleSubtitles: () => {},
        toggleMotion: () => {},
        playNext: () => {},
        playPrevious: () => {},
        togglePlaylist,
      })
      return null
    }
    render(<EscapeHarness isPlaylistOpen={false} />)
    act(() => press('Escape'))
    expect(toggleFullscreen).toHaveBeenCalledTimes(1)
    expect(togglePlaylist).not.toHaveBeenCalled()
  })
})

// Regression test: ArrowUp/ArrowDown used to adjust the volume (and
// preventDefault) even with no media loaded, unlike every other shortcut
// gated on hasMedia.
describe('volume shortcuts respect hasMedia', () => {
  it('does not change the volume on ArrowUp/ArrowDown when hasMedia is false', () => {
    setPropertyMock.mockClear()
    function NoMediaHarness() {
      useKeyboardShortcuts({
        hasMedia: false,
        volume: 100,
        isFullscreen: false,
        isPlaylistOpen: false,
        togglePause: () => {},
        toggleFullscreen: () => {},
        toggleSubtitles: () => {},
        toggleMotion: () => {},
        playNext: () => {},
        playPrevious: () => {},
        togglePlaylist: () => {},
      })
      return null
    }
    render(<NoMediaHarness />)
    act(() => press('ArrowUp'))
    act(() => press('ArrowDown'))
    expect(setPropertyMock).not.toHaveBeenCalled()
  })
})
