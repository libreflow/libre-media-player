import { useCallback, useEffect, useRef, useState } from 'react'
import { command, listenEvents, type MpvEvent } from 'tauri-plugin-libmpv-api'
import { loadSettings, updateSettings } from '../settings'

export interface PlaylistItem {
  path: string
  name: string
}

function basename(path: string): string {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return slash === -1 ? path : path.slice(slash + 1)
}

// Playback queue. Files are appended (multi-file drag-drop, file dialog),
// navigated with next/previous (buttons, `n`/`p` keys), and playback
// auto-advances when mpv reports the current file ended (EOF).
//
// `loadFile` must be the player's single-file loader: it resets resume
// tracking and reads back the real pause state, so reusing it for
// navigation keeps all of that behavior consistent.
export function usePlaylist(opts: {
  ready: boolean
  loadFile: (path: string) => Promise<void>
  // Stops playback entirely (used when the currently-playing item is
  // removed and nothing else remains to advance to).
  stopPlayback?: () => void | Promise<void>
  // True while the player is loading a file: an end-file event landing during
  // a load switch comes from the outgoing file, not a natural EOF, and must
  // not trigger an auto-advance that would race the load in flight.
  loadInFlightRef?: { current: boolean }
  onError: (msg: string) => void
}) {
  const [queue, setQueue] = useState<PlaylistItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [panelOpen, setPanelOpen] = useState(false)
  const [shuffle, setShuffleState] = useState(false)
  const [repeat, setRepeatState] = useState(false)
  // Restore the persisted shuffle/repeat preferences once on mount. Like
  // every other settings-backed value (volume), they
  // used to be plain useState(false) and silently reset on every restart.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const settings = await loadSettings()
        if (cancelled) return
        setShuffleState(settings.shuffle)
        setRepeatState(settings.repeat)
      } catch {
        // best-effort; defaults (false) apply
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Refs mirroring state so the once-attached end-file listener sees fresh
  // values without re-subscribing on every queue change.
  const queueRef = useRef<PlaylistItem[]>([])
  const indexRef = useRef(-1)
  queueRef.current = queue
  indexRef.current = currentIndex
  const shuffleRef = useRef(false)
  const repeatRef = useRef(false)
  shuffleRef.current = shuffle
  repeatRef.current = repeat

  // loadFile is stable (memoized with [resume] in usePlayer), but mirroring
  // it in a ref keeps playIndex itself identity-stable so the end-file
  // listener below never re-subscribes.
  const loadFileRef = useRef(opts.loadFile)
  loadFileRef.current = opts.loadFile

  const playIndex = useCallback(
    async (index: number) => {
      const item = queueRef.current[index]
      if (!item) return
      // Only commit the index once the file actually loads -- a corrupt
      // file used to leave the queue pointing at an unplayable "ghost"
      // item, breaking prev/next navigation and EOF auto-advance.
      await loadFileRef.current(item.path)
      if (queueRef.current[index] === item) setCurrentIndex(index)
    },
    [],
  )

  // Append files to the queue. When the queue was empty, the first file is
  // played immediately (standard player behavior).
  //
  // Paths already present in the queue (including the currently-playing
  // one) are skipped: dropping/multi-picking a file that's already queued
  // must be a no-op, not a duplicate entry. Also dedupes within the
  // incoming batch itself (e.g. the same file dropped twice at once).
  const append = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return
      const existing = new Set(queueRef.current.map((i) => i.path))
      const newPaths: string[] = []
      for (const p of paths) {
        if (existing.has(p)) continue
        existing.add(p)
        newPaths.push(p)
      }
      if (newPaths.length === 0) return
      const items = newPaths.map((p) => ({ path: p, name: basename(p) }))
      const wasEmpty = queueRef.current.length === 0
      queueRef.current = [...queueRef.current, ...items]
      setQueue(queueRef.current)
      if (wasEmpty) void playIndex(0)
    },
    [playIndex],
  )

  const playNext = useCallback(() => {
    // currentIndex -1 means the playing item was removed from the queue:
    // "next" would compute index 0 and jump to an arbitrary file, so stay
    // put until the user picks something explicit.
    if (indexRef.current === -1) return
    const len = queueRef.current.length
    if (len === 0) return
    if (shuffleRef.current && len > 1) {
      // Pick a random index other than the current one.
      let next = indexRef.current
      while (next === indexRef.current) {
        next = Math.floor(Math.random() * len)
      }
      void playIndex(next)
      return
    }
    const next = indexRef.current + 1
    if (next < len) void playIndex(next)
    else if (repeatRef.current) void playIndex(0)
  }, [playIndex])

  const playPrevious = useCallback(() => {
    if (indexRef.current === -1) return
    if (indexRef.current > 0) {
      void playIndex(indexRef.current - 1)
    } else if (repeatRef.current && queueRef.current.length > 0) {
      // Mirror playNext's repeat behavior: wrapping back from the first
      // item jumps to the last one instead of being a dead end.
      void playIndex(queueRef.current.length - 1)
    }
  }, [playIndex])

  const stopPlaybackRef = useRef(opts.stopPlayback)
  stopPlaybackRef.current = opts.stopPlayback
  const removeAt = useCallback((index: number) => {
    const current = indexRef.current
    const next = queueRef.current.filter((_, i) => i !== index)
    queueRef.current = next
    setQueue(next)
    if (current === -1) return
    if (index < current) {
      setCurrentIndex(current - 1)
      return
    }
    if (index !== current) return
    // Removing the playing item advances to the item that just shifted into
    // its slot (VLC behavior). Previously this left the index at -1 while
    // the file kept playing -- a "ghost" entry with disabled prev/next.
    if (index < next.length) {
      void playIndex(index)
    } else {
      setCurrentIndex(-1)
      void stopPlaybackRef.current?.()
    }
  }, [playIndex])

  const clear = useCallback(() => {
    queueRef.current = []
    indexRef.current = -1
    setQueue([])
    setCurrentIndex(-1)
  }, [])

  // Auto-advance when the current file reaches EOF. The plugin emits every
  // mpv event under the single Tauri event name 'mpv-event-{window}' with the
  // event type in the payload (listenEvents handles the name/payload shape),
  // so the OLD listener on a bare 'end-file' Tauri event name NEVER fired --
  // auto-advance was silently dead. Only advance on a natural end (reason
  // 'eof'), not on an error or a manual loadfile switch (those set reason
  // 'redirect'/'stop' and are user-driven anyway).
  useEffect(() => {
    if (!opts.ready) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      try {
        unlisten = await listenEvents((mpvEvent: MpvEvent) => {
          if (mpvEvent.event !== 'end-file') return
          if (opts.loadInFlightRef?.current) return
          if (mpvEvent.reason === 'eof') playNext()
        })
      } catch (e) {
        if (!cancelled) opts.onError(`File d'attente indisponible : ${String(e)}`)
      }
    })()
    return () => {
      cancelled = true
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: playNext reads refs and is stable
  }, [opts.ready, playNext])

  // Keep mpv's keep-open consistent with playback position in the queue:
  // auto-advance handles EOF when there IS a next item, so keep-open must
  // not hold the last frame; otherwise hold it. Keyed on "has a next" rather
  // than queue length: a 2-file queue playing the second (last) item would
  // otherwise hit EOF with keep-open='no' and show a black window instead
  // of the frozen final frame.
  useEffect(() => {
    if (!opts.ready) return
    const hasNext = currentIndex >= 0 && currentIndex < queue.length - 1
    void command('set_property', ['keep-open', hasNext ? 'no' : 'always'])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: queue position only
  }, [opts.ready, queue.length, currentIndex])

  const toggleShuffle = useCallback(() => {
    setShuffleState((v) => {
      const next = !v
      void updateSettings({ shuffle: next })
      return next
    })
  }, [])
  const toggleRepeat = useCallback(() => {
    setRepeatState((v) => {
      const next = !v
      void updateSettings({ repeat: next })
      return next
    })
  }, [])

  return {
    queue,
    currentIndex,
    panelOpen,
    setPanelOpen,
    shuffle,
    repeat,
    toggleShuffle,
    toggleRepeat,
    append,
    playIndex,
    playNext,
    playPrevious,
    removeAt,
    clear,
  }
}
