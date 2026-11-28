import { t, LOCALES, type Locale } from '../i18n'
import type { Chapter } from '../chapters'
import { SeekBar } from './controls/SeekBar'
import { VolumeControl } from './controls/VolumeControl'
import { TrackMenu } from './controls/TrackMenu'
import { SubtitleButton } from './controls/SubtitleButton'
import { SettingsMenu } from './controls/SettingsMenu'
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
  /** Whether the controls overlay is currently shown (drives the seek
   * bar's extrapolation loop: no point re-rendering at 60fps for a bar
   * that's invisible). */
  visible: boolean
  /** Chapter markers drawn on the seek bar (roadmap #61). */
  chapters: Chapter[]
  /** Current UI language (roadmap #64) -- keeps the selector in sync with
   * the persisted locale loaded on mount (a hardcoded defaultValue would
   * show FR while the UI renders in the persisted language). */
  locale: Locale
  /** Switches the UI language (roadmap #64) and persists it. */
  onSwitchLocale: (locale: Locale) => void
  /** Current playback speed (mpv mirror). When != 1 a chip shows it -- the
   * < / > OSD disappears and the user would otherwise not remember it. */
  speed: number
  /** Resets the speed chip back to 1 (one click instead of N keypresses). */
  onResetSpeed: () => void
  /** Opens the shortcuts help overlay. */
  onOpenShortcuts: () => void
  /** Keep-speed preference + its toggle (settings menu, roadmap
   * follow-up): when on, the chosen playback speed survives loadfile. */
  keepPlaybackSpeed: boolean
  onToggleKeepSpeed: () => void
  /** Toggles to a non-zero value when a full-screen overlay opens (help):
   *  the track menus read it to close -- they otherwise stayed open UNDER
   *  the help overlay, and Escape would only reveal them back. */
  menusCloseSignal: number
}

export function Controls(props: ControlsProps) {
  const {
    paused, volume, filename, isFullscreen,
    subtitlesAvailable, subtitlesVisible, hasNext, hasPrevious,
    onToggleSubtitles, onPlayNext, onPlayPrevious, onOpenFile, onOpenDefaultAppsSettings, onTogglePlaylist,
    subTracks, audioTracks, onSelectSubtrack, onDisableSubtitles, onSelectAudioTrack,
    togglePause, toggleFullscreen, setVolume,
    onSeekChange, onSeekCommit, seekingRef, timePos, duration, visible, chapters, locale, onSwitchLocale,
    keepPlaybackSpeed, onToggleKeepSpeed,
    speed, onResetSpeed, onOpenShortcuts, menusCloseSignal,
  } = props
  return (
    <div className="controls" role="toolbar" aria-label={t('play')} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <SeekBar
        timePos={timePos}
        duration={duration}
        speed={speed}
        seekingRef={seekingRef}
        onSeekChange={onSeekChange}
        onSeekCommit={onSeekCommit}
        paused={paused}
        visible={visible}
        chapters={chapters}
      />
      <div className="bottom-row">
        <button type="button" className="icon-btn" onClick={togglePause} aria-label={paused ? t('play') : t('pause')} title={paused ? `${t('play')} (${t('kbdSpace')})` : `${t('pause')} (${t('kbdSpace')})`}>
          {paused ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          )}
        </button>
        <button type="button" className="icon-btn" disabled={!hasPrevious} onClick={onPlayPrevious} aria-label={t('previousTrack')} title={`${t('previousTrack')} (p)`}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>
        <button type="button" className="icon-btn" disabled={!hasNext} onClick={onPlayNext} aria-label={t('nextTrack')} title={`${t('nextTrack')} (n)`}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6l8.5 6L6 18V6zm10 0h2v12h-2z" /></svg>
        </button>
        <TrackMenu
          label={t('audioTracks')}
          tracks={audioTracks}
          onSelect={onSelectAudioTrack}
          disabledSelected={false}
          closeSignal={menusCloseSignal}
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
          closeSignal={menusCloseSignal}
        />
        <span className="filename">{filename ?? ''}</span>
        {speed !== 1 && (
          <button
            type="button"
            className="speed-chip"
            onClick={onResetSpeed}
            // Announce the ACTION (back to normal speed), not a hardcoded
            // "x1" that told screen-reader users nothing about the reset.
            title={t('resetSpeed')}
            aria-label={t('resetSpeed')}
          >
            ×{String(speed).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}
          </button>
        )}
        <SettingsMenu
          keepPlaybackSpeed={keepPlaybackSpeed}
          onToggleKeepSpeed={onToggleKeepSpeed}
          closeSignal={menusCloseSignal}
        />
        <label className="lang-switch">
          <span className="sr-only">{t('language')}</span>
          <select
            aria-label={t('language')}
            value={locale}
            onChange={(e) => onSwitchLocale(e.target.value as Locale)}
            onClick={(e) => e.stopPropagation()}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <button type="button" className="icon-btn" onClick={onTogglePlaylist} aria-label={`${t('queue')} (l)`} title={`${t('queue')} (l)`}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2zm14 0h2v2h-2v-2zm2-5l-6 4v-8l6 4z" />
          </svg>
        </button>
        <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen() }} aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')} title={isFullscreen ? `${t('exitFullscreen')} (f)` : `${t('fullscreen')} (f)`}>
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z" /></svg>
          )}
        </button>
        <button type="button" className="icon-btn" onClick={onOpenFile} aria-label={t('openOtherFile')} title={t('openOtherFile')}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenDefaultAppsSettings}
          aria-label={t('setDefaultPlayer')}
          title={t('setDefaultPlayerTitle')}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.44.17-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenShortcuts}
          aria-label={t('helpTitle')}
          title={`${t('helpTitle')} (h)`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.9 15.6h-1.9v-1.9h1.9v1.9zm1.7-6.8l-.9.9c-.7.7-.8 1-.8 2.1h-1.8v-.4c0-.9.1-1.4.8-2.1l1-1c.4-.4.6-.8.6-1.3 0-.9-.7-1.5-1.6-1.5s-1.6.6-1.7 1.6H8.4c.1-1.9 1.5-3.1 3.5-3.1s3.3 1.2 3.3 2.9c0 1-.4 1.6-1.1 2.3z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
