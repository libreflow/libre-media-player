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
// togglePlaylist is a plain inline arrow recreated on every
// App render (not useCallback-memoized), so the keydown listener captured
// whichever closure existed at the last re-subscribe -- in practice the
// very first render, since togglePause/toggleFullscreen stay referentially
// stable. Pressing 'l' a second time called a STALE closure that
// still read the original state and always recomputed the same result,
// so the shortcut visibly worked once then appeared frozen.
function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

// Mirrors the real reference-stability shape from App.tsx: togglePause and
// toggleFullscreen are useCallback-stabilized; togglePlaylist
// is a freshly-created arrow closing over local state, exactly like
// `() => playlist.setPanelOpen(!playlist.panelOpen)`.
function Harness({ onSnapshot }: { onSnapshot: (s: { panelOpen: boolean }) => void }) {
  const [panelOpen, setPanelOpen] = useState(false)
  const stableTogglePause = useCallback(() => {}, [])
  const stableToggleFullscreen = useCallback(() => {}, [])

  useKeyboardShortcuts({
    hasMedia: true,
    volume: 100,
    isFullscreen: false,
    isPlaylistOpen: panelOpen,
    togglePause: stableTogglePause,
    toggleFullscreen: stableToggleFullscreen,
    toggleSubtitles: () => {},
    playNext: () => {},
    playPrevious: () => {},
    togglePlaylist: () => setPanelOpen(!panelOpen),
    setVolume: () => {},
  })

  onSnapshot({ panelOpen })
  return null
}

describe('useKeyboardShortcuts', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('toggles the playlist panel ("l") repeatedly, not just once', () => {
    const snapshots: { panelOpen: boolean }[] = []
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
            playNext: () => {},
        playPrevious: () => {},
        togglePlaylist: () => {},
        setVolume: () => {},
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
            playNext: () => {},
        playPrevious: () => {},
        togglePlaylist,
        setVolume: () => {},
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
            playNext: () => {},
        playPrevious: () => {},
        togglePlaylist,
        setVolume: () => {},
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
    const setVolume = vi.fn()
    function NoMediaHarness() {
      useKeyboardShortcuts({
        hasMedia: false,
        volume: 100,
        isFullscreen: false,
        isPlaylistOpen: false,
        togglePause: () => {},
        toggleFullscreen: () => {},
        toggleSubtitles: () => {},
            playNext: () => {},
        playPrevious: () => {},
        togglePlaylist: () => {},
        setVolume,
      })
      return null
    }
    render(<NoMediaHarness />)
    act(() => press('ArrowUp'))
    act(() => press('ArrowDown'))
    expect(setVolume).not.toHaveBeenCalled()
  })

  it('routes ArrowUp/ArrowDown volume changes through setVolume (single path, persisted)', () => {
    const setVolume = vi.fn()
    function VolumeHarness() {
      useKeyboardShortcuts({
        hasMedia: true,
        volume: 100,
        isFullscreen: false,
        isPlaylistOpen: false,
        togglePause: () => {},
        toggleFullscreen: () => {},
        toggleSubtitles: () => {},
            playNext: () => {},
        playPrevious: () => {},
        togglePlaylist: () => {},
        setVolume,
      })
      return null
    }
    render(<VolumeHarness />)
    act(() => press('ArrowUp'))
    expect(setVolume).toHaveBeenCalledWith(105)
    act(() => press('ArrowDown'))
    expect(setVolume).toHaveBeenCalledWith(95)
  })

  it('clamps keyboard volume to MAX_VOLUME', () => {
    const setVolume = vi.fn()
    function VolumeHarness() {
      useKeyboardShortcuts({
        hasMedia: true,
        volume: 128,
        isFullscreen: false,
        isPlaylistOpen: false,
        togglePause: () => {},
        toggleFullscreen: () => {},
        toggleSubtitles: () => {},
            playNext: () => {},
        playPrevious: () => {},
        togglePlaylist: () => {},
        setVolume,
      })
      return null
    }
    render(<VolumeHarness />)
    act(() => press('ArrowUp'))
    expect(setVolume).toHaveBeenCalledWith(130)
  })
})
