import { act, cleanup, render } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
function press(key: string, code?: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code: code ?? key }))
}

// Real keydown events originate at the FOCUSED element and bubble to
// window, so e.target is the focused element -- not window. Dispatching
// on window directly would make every e.target check see `window`.
// Dispatch on document.activeElement to reproduce the real targeting.
function pressFocused(key: string, code?: string) {
  const target = document.activeElement ?? window
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, code: code ?? key, bubbles: true, cancelable: true }),
  )
}

// jsdom's KeyboardEvent supports the `code` init property; the explicit
// cast keeps the common no-code press() call sites unchanged.


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
    seekBy: () => {},
    setVolume: () => {},
  })

  onSnapshot({ panelOpen })
  return null
}

// Shared cleanup for every describe below: render() mounts into the same
// document.body, so without cleanup the sliders/inputs of one test leak
// into the next and getByTestId finds duplicates.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useKeyboardShortcuts', () => {
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

  it('matches letter shortcuts by PHYSICAL key (layout-independent), not e.key', () => {
    // On AZERTY, the physical 'KeyL' position produces the same 'l', but
    // the invariant that matters is: the shortcut follows the physical key
    // whatever character the layout prints. Simulate a layout where the
    // 'KeyL' position produces a different character (e.g. a Dvorak-like
    // layout printing 'n' there) -- the shortcut must still fire 'l'.
    const togglePlaylist = vi.fn()
    function LayoutHarness() {
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
        togglePlaylist,
        seekBy: () => {},
        setVolume: () => {},
      })
      return null
    }
    render(<LayoutHarness />)
    act(() => press('n', 'KeyL'))
    expect(togglePlaylist).toHaveBeenCalledTimes(1)
  })

  it('ignores Ctrl/Alt/Meta chords so OS shortcuts are never hijacked', () => {
    const togglePlaylist = vi.fn()
    function ChordHarness() {
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
        togglePlaylist,
        seekBy: () => {},
        setVolume: () => {},
      })
      return null
    }
    render(<ChordHarness />)
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'l', code: 'KeyL', ctrlKey: true }),
      ),
    )
    expect(togglePlaylist).not.toHaveBeenCalled()
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
        seekBy: () => {},
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
        seekBy: () => {},
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
        seekBy: () => {},
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
        seekBy: () => {},
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
        seekBy: () => {},
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
        seekBy: () => {},
        setVolume,
      })
      return null
    }
    render(<VolumeHarness />)
    act(() => press('ArrowUp'))
    expect(setVolume).toHaveBeenCalledWith(130)
  })
})

// ArrowLeft/ArrowRight seek by +/-10s (VLC's step) via the injected seekBy
// callback. The hook no longer calls mpv directly -- the caller owns the
// command AND the OSD, which keeps this hook unit-testable.
describe('arrow-key seeking', () => {
  it('seeks forward 10s on ArrowRight and backward 10s on ArrowLeft', () => {
    const seekBy = vi.fn()
    function Harness() {
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
        seekBy,
        setVolume: () => {},
      })
      return null
    }
    render(<Harness />)
    act(() => press('ArrowRight'))
    expect(seekBy).toHaveBeenCalledWith(10)
    act(() => press('ArrowLeft'))
    expect(seekBy).toHaveBeenCalledWith(-10)
    expect(seekBy).toHaveBeenCalledTimes(2)
  })

  it('does not seek when hasMedia is false', () => {
    const seekBy = vi.fn()
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
        seekBy,
        setVolume: () => {},
      })
      return null
    }
    render(<NoMediaHarness />)
    act(() => press('ArrowRight'))
    act(() => press('ArrowLeft'))
    expect(seekBy).not.toHaveBeenCalled()
  })

  it('still seeks when a range slider (seek bar / volume) has focus', () => {
    // After clicking the seek bar the slider keeps keyboard focus; the
    // shortcuts must NOT stop working there (the old blanket
    // HTMLInputElement guard ignored all sliders). The hook's
    // preventDefault also cancels the slider's native arrow step so the
    // keypress does not move the slider AND seek at the same time.
    const seekBy = vi.fn()
    const setVolume = vi.fn()
    function SliderHarness() {
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
        seekBy,
        setVolume,
      })
      return (
        <div>
          <input type="range" data-testid="seek" />
          <input type="range" data-testid="vol" />
          <input type="text" data-testid="text" />
        </div>
      )
    }
    const { getByTestId } = render(<SliderHarness />)

    act(() => {
      getByTestId('seek').focus()
      pressFocused('ArrowRight')
    })
    expect(seekBy).toHaveBeenCalledWith(10)

    act(() => {
      getByTestId('vol').focus()
      pressFocused('ArrowUp')
    })
    expect(setVolume).toHaveBeenCalledWith(105)

    // Text inputs are still exempt: typing letters there must not fire
    // letter shortcuts, and arrows are left to the caret.
    act(() => {
      getByTestId('text').focus()
      pressFocused('ArrowRight')
      pressFocused('k')
    })
    expect(seekBy).toHaveBeenCalledTimes(1)
  })

  it('prevents the default slider arrow behavior so it does not double-seek', () => {
    function Harness() {
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
        seekBy: () => {},
        setVolume: () => {},
      })
      return <input type="range" data-testid="seek" />
    }
    const { getByTestId } = render(<Harness />)
    act(() => {
      getByTestId('seek').focus()
      const prevented = !document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }),
      )
      expect(prevented).toBe(true)
    })
  })
})
