import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { command } from 'tauri-plugin-libmpv-api'
import { MAX_VOLUME } from '../utils'

// Global keyboard shortcuts. Read current state via a single ref mirroring
// `opts` (updated every render, like useFileAssociation's optsRef) rather
// than re-binding the listener when individual callbacks change identity --
// this keeps a single, stable keydown handler for the window's lifetime
// while still seeing fresh values/callbacks on every keypress.
//
// This used to depend on only [isFullscreen, volume, toggleFullscreen,
// togglePause], which left toggleMotion/togglePlaylist (plain inline arrows
// recreated every App render, not useCallback-memoized) captured by the
// closure from whichever render last changed one of those four deps -- in
// practice the very first render, since togglePause/toggleFullscreen are
// stable and volume/isFullscreen only change on user action. Pressing 'm'
// or 'l' a second time called a stale closure of toggleMotion/togglePlaylist,
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
  toggleMotion: () => void
  playNext: () => void
  playPrevious: () => void
  togglePlaylist: () => void
  // Single volume path (same as the slider): updates React state + mpv AND
  // persists the value. The shortcuts used to setProperty('volume')
  // directly, which never ran updateSettings -- a keyboard-adjusted volume
  // was silently lost on restart.
  setVolume: (v: number) => void
}) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const opts = optsRef.current
      // Don't hijack typing in a focused input (e.g. a future search box).
      if (e.target instanceof HTMLInputElement) return
      // Let Space activate a focused button natively instead of also firing
      // the play/pause shortcut (double action on a single keypress).
      if (e.key === ' ' && e.target instanceof HTMLButtonElement) return
      switch (e.key) {
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
        case 'Escape':
          // Close the topmost layer first: the queue panel, then fullscreen.
          if (opts.isPlaylistOpen) opts.togglePlaylist()
          else if (opts.isFullscreen) opts.toggleFullscreen()
          break
        case 'ArrowRight':
          if (opts.hasMedia) {
            e.preventDefault()
            void command('seek', [5, 'relative'])
          }
          break
        case 'ArrowLeft':
          if (opts.hasMedia) {
            e.preventDefault()
            void command('seek', [-5, 'relative'])
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
        case 's':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.toggleSubtitles()
          }
          break
        case 'm':
          if (opts.hasMedia) {
            e.preventDefault()
            opts.toggleMotion()
          }
          break
        case 'n':
          e.preventDefault()
          if (opts.hasMedia) opts.playNext()
          break
        case 'p':
          e.preventDefault()
          if (opts.hasMedia) opts.playPrevious()
          break
        case 'l':
          e.preventDefault()
          opts.togglePlaylist()
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

export function useFullscreen(onError: (msg: string) => void) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = useCallback(() => {
    const win = getCurrentWindow()
    void win.isFullscreen().then((fs) => {
      void win.setFullscreen(!fs).catch((e) => onError(`Plein écran indisponible : ${String(e)}`))
      setIsFullscreen(!fs)
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
