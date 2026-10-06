import { SeekBar } from './controls/SeekBar'
import { VolumeControl } from './controls/VolumeControl'
import { TrackMenu } from './controls/TrackMenu'
import { SubtitleButton } from './controls/SubtitleButton'
import type { MpvTrack } from '../subtitles'

interface ControlsProps {
  paused: boolean
  volume: number
  filename: string | null
  isFullscreen: boolean
  subtitlesAvailable: boolean
  subtitlesVisible: boolean
  hasNext: boolean
  hasPrevious: boolean
  onToggleSubtitles: () => void
  subTracks: MpvTrack[]
  audioTracks: MpvTrack[]
  onSelectSubtrack: (id: number) => void
  onDisableSubtitles: () => void
  onSelectAudioTrack: (id: number) => void
  onPlayNext: () => void
  onPlayPrevious: () => void
  onOpenFile: () => void
  onOpenDefaultAppsSettings: () => void
  onTogglePlaylist: () => void
  togglePause: () => void
  toggleFullscreen: () => void
  setVolume: (v: number) => void
  onSeekChange: (t: number) => void
  onSeekCommit: (t: number) => void
  seekingRef: React.MutableRefObject<boolean>
  timePos: number | null
  duration: number | null
}

export function Controls(props: ControlsProps) {
  const {
    paused, volume, filename, isFullscreen,
    subtitlesAvailable, subtitlesVisible, hasNext, hasPrevious,
    onToggleSubtitles, onPlayNext, onPlayPrevious, onOpenFile, onOpenDefaultAppsSettings, onTogglePlaylist,
    subTracks, audioTracks, onSelectSubtrack, onDisableSubtitles, onSelectAudioTrack,
    togglePause, toggleFullscreen, setVolume,
    onSeekChange, onSeekCommit, seekingRef, timePos, duration,
  } = props
  return (
    <div className="controls" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <SeekBar
        timePos={timePos}
        duration={duration}
        seekingRef={seekingRef}
        onSeekChange={onSeekChange}
        onSeekCommit={onSeekCommit}
        paused={paused}
      />
      <div className="bottom-row">
        <button type="button" className="icon-btn" onClick={togglePause} aria-label={paused ? 'Lecture' : 'Pause'} title={paused ? 'Lecture (Espace)' : 'Pause (Espace)'}>
          {paused ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          )}
        </button>
        <button type="button" className="icon-btn" disabled={!hasPrevious} onClick={onPlayPrevious} aria-label="Piste précédente" title="Piste précédente (p)">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
        <button type="button" className="icon-btn" disabled={!hasNext} onClick={onPlayNext} aria-label="Piste suivante" title="Piste suivante (n)">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6l8.5 6L6 18V6zm10 0h2v12h-2z" /></svg>
        </button>
        <TrackMenu
          label="Pistes audio"
          tracks={audioTracks}
          onSelect={onSelectAudioTrack}
          disabledSelected={false}
        />
        <VolumeControl volume={volume} setVolume={setVolume} />
        <SubtitleButton
          subtitlesAvailable={subtitlesAvailable}
          subtitlesVisible={subtitlesVisible}
          subTracks={subTracks}
          disabledSelected={!subTracks.some((t) => t.selected)}
          onToggleSubtitles={onToggleSubtitles}
          onSelectSubtrack={onSelectSubtrack}
          onDisableSubtitles={onDisableSubtitles}
        />
        <span className="filename">{filename ?? ''}</span>
        <button type="button" className="icon-btn" onClick={onTogglePlaylist} aria-label="File d'attente (l)" title="File d'attente (l)">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2zm14 0h2v2h-2v-2zm2-5l-6 4v-8l6 4z" />
          </svg>
        </button>
        <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen() }} aria-label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'} title={isFullscreen ? 'Quitter le plein écran (f)' : 'Plein écran (f)'}>
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z" /></svg>
          )}
        </button>
        <button type="button" className="icon-btn" onClick={onOpenFile} aria-label="Ouvrir un autre fichier" title="Ouvrir un autre fichier">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenDefaultAppsSettings}
          aria-label="Définir comme lecteur par défaut"
          title="Ouvre les réglages Windows pour définir Libre Media Player comme lecteur vidéo par défaut"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.44.17-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
