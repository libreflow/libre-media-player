import { useCallback, useEffect, useRef, useState } from 'react'
import { command, getProperty } from 'tauri-plugin-libmpv-api'
import { usePlayer } from './hooks/usePlayer'
import { useKeyboardShortcuts, useFullscreen, useControlsVisibility } from './hooks/useShortcuts'
import { useFilePicker } from './hooks/useFilePicker'
import { useFileAssociation } from './hooks/useFileAssociation'
import { useSubtitles } from './hooks/useSubtitles'
import { usePlaylist } from './hooks/usePlaylist'
import { useRecentFiles } from './hooks/useRecentFiles'
import { useLocale, useUpdateCheck } from './hooks/useAppPrefs'
import { openDefaultAppsSettings } from './defaultApps'
import { formatTime } from './utils'
import { t } from './i18n'
import { readChapters, type Chapter } from './chapters'
import { Controls } from './components/Controls'
import { PlaylistPanel } from './components/PlaylistPanel'
import './App.css'

// How long the seek OSD stays on screen after an arrow-key seek.
const SEEK_OSD_MS = 900

function App() {
  const { switchLocale } = useLocale()
  const { showControls, onPointerActivity } = useControlsVisibility()
  const [error, setError] = useState<string | null>(null)
  // Generic OSD for one-shot confirmations (screenshot, update prompt).
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNotice = useCallback((msg: string, ms = 2500) => {
    setNotice(msg)
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(null), ms)
  }, [])
  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
  }, [])
  // Chapters of the loaded file (roadmap #61) — read once per successful
  // load via the player's onFileLoaded callback.
  const [chapters, setChapters] = useState<Chapter[]>([])
  const chaptersRef = useRef<Chapter[]>([])
  const onError = useCallback((msg: string) => setError(msg), [])
  const subtitles = useSubtitles(onError)
  // Forward BOTH arguments (path AND loadGeneration): usePlayer invokes
  // onFileLoaded with the generation of the load that produced the
  // callback, and useSubtitles' sidecar dedup relies on it to tell
  // "same load, re-triggered" from "same path reloaded". A wrapper that
  // dropped the generation silently disabled that guard in production
  // while its unit tests (which passed the generation directly) stayed
  // green.
  const player = usePlayer((path, loadGeneration) => {
    void subtitles.onFileLoaded(path, loadGeneration)
    // Chapter discovery is best-effort: files without chapters (or an mpv
    // hiccup) simply render a bare seek bar like before.
    void readChapters((name, format) => getProperty(name, format))
      .then((chapters) => {
        chaptersRef.current = chapters ?? []
        setChapters(chapters ?? [])
      })
      .catch(() => {
        chaptersRef.current = []
        setChapters([])
      })
  })
  const clearPlayerError = player.clearError
  const dismissError = useCallback(() => {
    setError(null)
    clearPlayerError()
  }, [clearPlayerError])
  const { isFullscreen, toggleFullscreen } = useFullscreen(onError)
  const { recents, recordOpened, openRecent, clear: clearRecents } = useRecentFiles({
    loadFile: player.loadFile,
    onError,
  })
  // Single load path wrapped so every successful open (picker, drag-drop,
  // file association, playlist navigation, recents) lands in the recents
  // list. recordOpened is stable ([] deps) so the wrapper only changes
  // identity when player.loadFile does, which keeps every downstream
  // effect subscription (drag-drop listener, playlist end-file listener)
  // as stable as before.
  const loadFile = useCallback(
    (path: string) =>
      player.loadFile(path).then((result) => {
        recordOpened(path)
        return result
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: player.loadFile is stable (useCallback on the memoized resume object), recordOpened is []-deps; depending on the whole `player` object would churn this wrapper (and every effect keyed on it) on every mpv state tick.
    [player.loadFile, recordOpened],
  )
  const { isDragOver, openFile } = useFilePicker({
    readyRef: player.readyRef,
    loadFile,
    // Single route for every multi-file entry point (dialog multi-pick and
    // drag-drop alike): the queue, so picked files get prev/next navigation
    // too. The dialog always returns an array (multiple: true), so one
    // callback covers both.
    onFilesDropped: (paths) => {
      if (player.readyRef.current) playlist.append(paths)
    },
    onError,
  })
  const playlist = usePlaylist({
    ready: player.ready,
    loadFile,
    loadInFlightRef: player.loadInFlightRef,
    stopPlayback: () => void player.stopPlayback(),
    onError,
  })
  useFileAssociation({
    whenReady: player.whenReady,
    loadFile,
    onError,
  })

  const hasMedia = player.filename != null

  // On-screen display for arrow-key seeks: shows "+10s" / "-10s" with the
  // resulting position, fading out after a short delay. Repeated presses
  // within the window just restart the timer (and re-render the text).
  const [seekOsd, setSeekOsd] = useState<{ delta: number; at: number | null } | null>(null)
  const seekOsdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seekBy = useCallback((delta: number) => {
    // Fire-and-forget, but swallow rejections: a failed seek (e.g. mpv busy)
    // must not surface as an unhandled rejection.
    void command('seek', [delta, 'relative']).catch(() => {})
    // mpv reports the new time-pos through the property observer, but it
    // can lag a tick behind the keypress; show the delta immediately so
    // the OSD never feels unresponsive. The absolute position follows on
    // the next observer tick (player.timePos changes re-render below).
    setSeekOsd({ delta, at: player.timePos != null ? player.timePos + delta : null })
    if (seekOsdTimerRef.current) clearTimeout(seekOsdTimerRef.current)
    seekOsdTimerRef.current = setTimeout(() => setSeekOsd(null), SEEK_OSD_MS)
  }, [player.timePos])

  // Clear the OSD timer on unmount so it never fires setState on a
  // destroyed tree (StrictMode double-mount in dev).
  useEffect(() => () => {
    if (seekOsdTimerRef.current) clearTimeout(seekOsdTimerRef.current)
  }, [])

  // Auto-update (roadmap #63): a found update shows a clickable notice.
  const { update, install } = useUpdateCheck(showNotice, onError)
  useEffect(() => {
    if (update != null) showNotice(t('updateAvailable', { version: update.version }), 8000)
  }, [update, showNotice])

  // Screenshot capture (roadmap #60): fire-and-forget with an OSD notice
  // carrying the destination path.
  const takeScreenshot = useCallback(() => {
    player.takeScreenshot()
      .then((path) => showNotice(t('screenshotTaken', { path })))
      .catch((e) => onError(t('screenshotFailed', { err: String(e) })))
  }, [player, showNotice, onError])

  useKeyboardShortcuts({
    hasMedia,
    volume: player.volume,
    isFullscreen,
    isPlaylistOpen: playlist.panelOpen,
    togglePause: player.togglePause,
    toggleFullscreen,
    toggleSubtitles: subtitles.toggle,
    playNext: playlist.playNext,
    playPrevious: playlist.playPrevious,
    togglePlaylist: () => playlist.setPanelOpen(!playlist.panelOpen),
    seekBy,
    setVolume: player.setVolume,
    adjustSubDelay: player.adjustSubDelay,
    adjustAudioDelay: player.adjustAudioDelay,
    takeScreenshot,
  })

  const onSeekCommit = useCallback((t: number) => {
    // .finally does not handle a rejection -- append .catch so a failed
    // commit seek never becomes an unhandled rejection.
    void command('seek', [t, 'absolute'])
      .finally(() => {
        player.seekingRef.current = false
      })
      .catch(() => {})
  }, [player.seekingRef])

  const errorToDisplay = error ?? player.error

  return (
    <div
      className={`player${hasMedia ? ' has-media' : ''}${showControls ? ' show-controls' : ''}${isDragOver ? ' drag-over' : ''}`}
      onMouseMove={onPointerActivity}
      onClick={hasMedia ? player.togglePause : undefined}
      onDoubleClick={hasMedia ? toggleFullscreen : undefined}
    >
      {errorToDisplay && (
        <div
          className="error-banner error-banner--overlay"
          role="alert"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {errorToDisplay}
          {/* Init failure is retryable: a transient error (libmpv DLL not
              yet extracted, GPU init hiccup) used to leave the app stuck on
              this banner until restart. The retry button re-runs mpv init. */}
          {!player.ready && player.error && (
            <button type="button" className="error-banner__retry" onClick={(e) => { e.stopPropagation(); player.retryInit() }}>
              {t('retry')}
            </button>
          )}
          {/* A load failure doesn't invalidate the player -- let the user
              dismiss the banner instead of waiting for the next successful
              load to clear it. */}
          <button
            type="button"
            className="error-banner__close"
            aria-label={t('closeErrorMessage')}
            title={t('close')}
            onClick={(e) => {
              e.stopPropagation()
              dismissError()
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>
      )}
      {seekOsd && hasMedia && (
        <div className="seek-osd" key={seekOsd.delta + String(seekOsd.at)}>
          {seekOsd.delta > 0 ? `+${seekOsd.delta}s` : `${seekOsd.delta}s`}
          {seekOsd.at != null && <span className="seek-osd__pos">{formatTime(seekOsd.at)}</span>}
        </div>
      )}
      {isDragOver && (
        <div className="drag-overlay">{t('dropOverlay')}</div>
      )}
      {notice && (
        <div
          className="seek-osd"
          role="status"
          onClick={update != null ? (e) => { e.stopPropagation(); void install() } : undefined}
        >
          {notice}
        </div>
      )}

      {!hasMedia && (
        <div className="drop-zone">
          <svg className="drop-zone__logo" viewBox="0 0 64 64" aria-hidden="true">
            <defs>
              <linearGradient id="lmp-logo-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8f76ff" />
                <stop offset="1" stopColor="#6c4bff" />
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#lmp-logo-grad)" />
            <path d="M26 20l20 12-20 12z" fill="#fff" />
          </svg>
          <div className="drop-zone__title">{t('appName')}</div>
          <button
            type="button"
            className="open-btn"
            disabled={!player.ready}
            onClick={(e) => {
              e.stopPropagation()
              void openFile()
            }}
          >
            {player.ready ? t('openVideo') : t('initializing')}
          </button>
          <div className="drop-zone__hint">{t('dropHint')}</div>
          {recents.length > 0 && (
            <div className="recents">
              <div className="recents__header">
                <span className="recents__title">{t('recentsTitle')}</span>
                <button
                  type="button"
                  className="recents__clear"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearRecents()
                  }}
                >
                  {t('recentsClear')}
                </button>
              </div>
              <ul className="recents__list">
                {recents.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className="recents__item"
                      title={entry.path}
                      onClick={(e) => {
                        e.stopPropagation()
                        openRecent(entry.path)
                      }}
                    >
                      {entry.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <PlaylistPanel
        open={playlist.panelOpen}
        queue={playlist.queue}
        currentIndex={playlist.currentIndex}
        shuffle={playlist.shuffle}
        repeat={playlist.repeat}
        onToggleShuffle={playlist.toggleShuffle}
        onToggleRepeat={playlist.toggleRepeat}
        onPlay={(i) => void playlist.playIndex(i)}
        onRemove={playlist.removeAt}
        onClear={playlist.clear}
        onClose={() => playlist.setPanelOpen(false)}
      />

      <Controls
        paused={player.paused}
        volume={player.volume}
        filename={player.filename}
        isFullscreen={isFullscreen}
        subtitlesAvailable={subtitles.available}
        subtitlesVisible={subtitles.visible}
        onToggleSubtitles={() => void subtitles.toggle()}
        subTracks={subtitles.subTracks}
        audioTracks={subtitles.audioTracks}
        onSelectSubtrack={(id) => void subtitles.selectSubtrack(id)}
        onDisableSubtitles={() => void subtitles.disableSubtitles()}
        onSelectAudioTrack={(id) => void subtitles.selectAudioTrack(id)}
        // With repeat or shuffle active, next/previous wrap around (see
        // usePlaylist's playNext/playPrevious), so the buttons must stay
        // enabled even at the queue's edges -- otherwise the UI says
        // "no next" while the 'n' key still advances.
        hasNext={
          playlist.currentIndex < playlist.queue.length - 1 ||
          playlist.repeat ||
          (playlist.shuffle && playlist.queue.length > 1)
        }
        hasPrevious={playlist.currentIndex > 0 || (playlist.repeat && playlist.queue.length > 0)}
        onPlayNext={playlist.playNext}
        onPlayPrevious={playlist.playPrevious}
        onOpenFile={() => void openFile()}
        onOpenDefaultAppsSettings={() => {
          void openDefaultAppsSettings().catch((e) => onError(`Impossible d'ouvrir les réglages : ${String(e)}`))
        }}
        onTogglePlaylist={() => playlist.setPanelOpen(!playlist.panelOpen)}
        togglePause={player.togglePause}
        toggleFullscreen={toggleFullscreen}
        setVolume={player.setVolume}
        onSeekChange={player.setTimePos}
        onSeekCommit={onSeekCommit}
        seekingRef={player.seekingRef}
        timePos={player.timePos}
        duration={player.duration}
        visible={showControls || !hasMedia}
        chapters={chapters}
        onSwitchLocale={switchLocale}
      />
    </div>
  )
}

export default App
