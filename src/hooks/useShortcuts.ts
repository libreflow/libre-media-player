import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { MAX_VOLUME } from '../utils'

// Seek step (seconds) for ArrowLeft/ArrowRight. 10s matches VLC's default
// arrow seek; 5s felt too short to make progress on long videos.
const SEEK_STEP = 10

// Global keyboard shortcuts. Read current state via a single ref mirroring
// `opts` (updated every render, like useFileAssociation's optsRef) rather
// than re-binding the listener when individual callbacks change identity --
// this keeps a single, stable keydown handler for the window's lifetime
// while still seeing fresh values/callbacks on every keypress.
//
// This used to depend on only [isFullscreen, volume, toggleFullscreen,
// togglePause], which left togglePlaylist (a plain inline arrow
// recreated every App render, not useCallback-memoized) captured by the
// closure from whichever render last changed one of those four deps -- in
// practice the very first render, since togglePause/toggleFullscreen are
// stable and volume/isFullscreen only change on user action. Pressing 'm'
// 'l' a second time called a stale closure of togglePlaylist,
// which still read the ORIGINAL `enabled`/`panelOpen` value from that first
// render and always computed the same "turn on" result -- so the shortcut
// visibly worked once, then appeared frozen until some other opts field
// happened to change and the effect re-subscribed.
export function useKeyboardShortcuts(opts: {
  hasMedia: boolean
  volume: number
  isFullscreen: boolean
  isPlaylistOpen: boolean
  togglePause: () => void
  toggleFullscreen: () => void
  toggleSubtitles: () => void
  playNext: () => void
  playPrevious: () => void
  togglePlaylist: () => void
  // Relative seek in seconds (negative = backward). Provided by the caller
  // so the hook stays mpv-free and testable; the caller also shows the OSD.
  seekBy: (delta: number) => void
  // Single volume path (same as the slider): updates React state + mpv AND
  // persists the value. The shortcuts used to setProperty('volume')
  // directly, which never ran updateSettings -- a keyboard-adjusted volume
  // was silently lost on restart.
  setVolume: (v: number) => void
  // Subtitle delay nudge in seconds (roadmap #59): z = earlier, Z (shift+z)
  // = later, matching mpv's own default bindings. Both fire on the same
  // physical key so keyboard layouts stay irrelevant.
  adjustSubDelay: (delta: number) => void
  // Audio delay nudge in seconds (roadmap #58): the [ and ] physical keys,
  // matching mpv's own default bindings for audio-delay up/down.
  adjustAudioDelay: (delta: number) => void
  // Screenshot capture (roadmap #60). The KeyC physical key: 's' is already
  // the subtitle toggle here and Control+S is reserved by the OS/browser.
  takeScreenshot: () => void
}) {
  const optsRef = useRef(opts)
  // Keep the ref in sync inside an effect (not during render) so the
  // keydown listener below always reads the latest opts.
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const opts = optsRef.current
      // Don't hijack typing in a focused text input (e.g. a future search
      // box). Range sliders (seek bar, volume) are exempt: they keep focus
      // after a click, and arrows must still seek/adjust the volume then --
      // our preventDefault() below also cancels the slider's native arrow
      // step, so the keypress does not move the slider AND seek at once.
      if (
        e.target instanceof HTMLInputElement &&
        e.target.type !== 'range'
      ) return
      // Let Space activate a focused button natively instead of also firing
      // the play/pause shortcut (double action on a single keypress).
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return
      // Route letters through e.code (the PHYSICAL key, layout-independent)
      // instead of e.key (the layout-produced character): matching e.key
      // made every letter shortcut hostage to the keyboard layout, working
      // on QWERTY but silently broken on layouts where those keys produce
      // a different character or sit behind a dead key. Physical-key
      // matching is layout-independent by construction. Ignore chords so
      // an OS/extension modifier shortcut is never hijacked.
      if (e.ctrlKey || e.altKey || e.metaKey) return
      // Shift widens the letter shortcut alphabet without extra physical keys
      // (e.g. z = subtitles earlier, Z = subtitles later); physical-key
      // matching below keeps both layout-independent.
      const letter = letterShortcut(e)
      switch (letter != null ? `${e.shiftKey ? letter.toUpperCase() : letter}` : e.key) {
        case ' ':
        case 'k':
          e.preventDefault()
          if (opts.hasMedia) opts.togglePause()
          break
        case 'f':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.toggleFullscreen()
          }
          break
        case 's':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.toggleSubtitles()
          }
          break
        case 'z':
          if (opts.hasMedia) {
            e.preventDefault()
            // mpv semantics: sub-delay -0.1 moves subs earlier.
            opts.adjustSubDelay(-0.1)
          }
          break
        case 'Z':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.adjustSubDelay(0.1)
          }
          break
        case 'c':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.takeScreenshot()
          }
          break
        case 'n':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.playNext()
          }
          break
        case 'p':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.playPrevious()
          }
          break
        case 'l':
          e.preventDefault()
          // The queue panel is useful without a playing file too (it lists
          // what will play next once one is opened), but opening it on the
          // home screen with an EMPTY queue is pure noise -- gate on media
          // presence so 'l' on the drop zone does nothing instead of showing
          // a bare panel.
          if (opts.hasMedia) opts.togglePlaylist()
          break
        case 'Escape':
          // Close the topmost layer first: the queue panel, then fullscreen.
          if (opts.isPlaylistOpen) opts.togglePlaylist()
          else if (opts.isFullscreen) opts.toggleFullscreen()
          break
        case 'ArrowRight':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.seekBy(SEEK_STEP)
          }
          break
        case 'ArrowLeft':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.seekBy(-SEEK_STEP)
          }
          break
        case 'ArrowUp':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.setVolume(Math.min(MAX_VOLUME, opts.volume + 5))
          }
          break
        case 'ArrowDown':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.setVolume(Math.max(0, opts.volume - 5))
          }
          break
        case '[':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.adjustAudioDelay(0.1)
          }
          break
        case ']':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.adjustAudioDelay(-0.1)
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // Deps intentionally []: optsRef always carries the latest opts (every
    // field, including callbacks of any stability), so the listener never
    // needs to re-subscribe -- see the hook-level comment above.
  }, [])
}

// Maps a keydown to the letter shortcut it should trigger, based on the
// PHYSICAL key (e.code) rather than the character it produced (e.key):
// matching e.key worked on QWERTY but silently broke on layouts where our
// letters sit behind Shift or dead keys. Physical-key matching makes every
// shortcut layout-independent by construction (the 'KeyN' position always
// means next, whether the layout prints 'n', digits-with-Shift or a
// composed accent). Returns null for non-letter keys so the caller falls
// back to e.key (Space, arrows and Escape are the same on every layout).
function letterShortcut(e: KeyboardEvent): string | null {
  const m = /^Key([A-Z])$/.exec(e.code)
  return m ? m[1].toLowerCase() : null
}

export function useFullscreen(onError: (msg: string) => void) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    const win = getCurrentWindow()
    void win.isFullscreen().then((fs) => {
      // Only flip the React state after the window confirms the change --
      // an optimistic flip used to leave the button icon stale when
      // setFullscreen itself failed (the state claimed fullscreen while
      // the window wasn't).
      void win
        .setFullscreen(!fs)
        .then(() => setIsFullscreen(!fs))
        .catch((e) => onError(`Plein écran indisponible : ${String(e)}`))
    })
  }, [onError])

  // Keep the React state in sync when fullscreen is toggled from outside
  // our own UI (OS-native F11, window-manager shortcuts, ...). Without
  // this listener the fullscreen button icon would go stale. The window
  // object exposes no onFullscreenChanged helper; the raw event works.
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await getCurrentWindow().listen<boolean>(
        'tauri://fullscreen-changed',
        ({ payload }) => setIsFullscreen(payload),
      )
    })()
    return () => unlisten?.()
  }, [])

  return { isFullscreen, toggleFullscreen }
}

export function useControlsVisibility() {
  const [showControls, setShowControls] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleHideControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setShowControls(false), 2600)
  }, [])

  const onPointerActivity = useCallback(() => {
    setShowControls(true)
    scheduleHideControls()
  }, [scheduleHideControls])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }, [])

  return { showControls, onPointerActivity }
}
