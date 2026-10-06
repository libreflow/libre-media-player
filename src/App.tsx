import { useCallback, useState } from 'react'
import { command } from 'tauri-plugin-libmpv-api'
import { usePlayer } from './hooks/usePlayer'
import { useKeyboardShortcuts, useFullscreen, useControlsVisibility } from './hooks/useShortcuts'
import { useFilePicker } from './hooks/useFilePicker'
import { useFileAssociation } from './hooks/useFileAssociation'
import { useSubtitles } from './hooks/useSubtitles'
import { usePlaylist } from './hooks/usePlaylist'
import { openDefaultAppsSettings } from './defaultApps'
import { Controls } from './components/Controls'
import { PlaylistPanel } from './components/PlaylistPanel'
import './App.css'

function App() {
  const { showControls, onPointerActivity } = useControlsVisibility()
  const [error, setError] = useState<string | null>(null)
  const onError = useCallback((msg: string) => setError(msg), [])
  const subtitles = useSubtitles(onError)
  const player = usePlayer((path) => void subtitles.onFileLoaded(path))
  const { isFullscreen, toggleFullscreen } = useFullscreen(onError)
  const { isDragOver, openFile } = useFilePicker({
    readyRef: player.readyRef,
    loadFile: player.loadFile,
    onFilesDropped: (paths) => {
      if (player.readyRef.current) playlist.append(paths)
    },
    onFilePicked: (path) => {
      if (player.readyRef.current) playlist.append([path])
    },
    onError,
  })
  const playlist = usePlaylist({
    ready: player.ready,
    loadFile: player.loadFile,
    loadInFlightRef: player.loadInFlightRef,
    stopPlayback: () => void player.stopPlayback(),
    onError,
  })
  useFileAssociation({
    readyRef: player.readyRef,
    loadFile: player.loadFile,
    onError,
  })

  const hasMedia = player.filename != null

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
    setVolume: player.setVolume,
  })

  const onSeekCommit = useCallback((t: number) => {
    void command('seek', [t, 'absolute']).finally(() => {
      player.seekingRef.current = false
    })
  }, [player.seekingRef])

  const errorToDisplay = error ?? player.error

  return (
    <div
      className={`player${hasMedia ? ' has-media' : ''}${showControls ? ' show-controls' : ''}${isDragOver ? ' drag-over' : ''}`}
      onMouseMove={onPointerActivity}
      onClick={hasMedia ? player.togglePause : undefined}
      onDoubleClick={hasMedia ? toggleFullscreen : undefined}
    >
      {errorToDisplay && <div className="error-banner error-banner--overlay">{errorToDisplay}</div>}
      {isDragOver && (
        <div className="drag-overlay">Déposer un fichier vidéo pour le lire</div>
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
          <div className="drop-zone__title">Libre Media Player</div>
          <button
            type="button"
            className="open-btn"
            disabled={!player.ready}
            onClick={(e) => {
              e.stopPropagation()
              void openFile()
            }}
          >
            {player.ready ? 'Ouvrir une vidéo…' : 'Initialisation du lecteur…'}
          </button>
          <div className="drop-zone__hint">…ou glissez-déposez vos fichiers ici</div>
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
        hasNext={playlist.currentIndex < playlist.queue.length - 1}
        hasPrevious={playlist.currentIndex > 0}
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
      />
    </div>
  )
}

export default App
