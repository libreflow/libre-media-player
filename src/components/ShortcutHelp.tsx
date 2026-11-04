import { t, type MessageKey } from '../i18n'

interface ShortcutHelpProps {
  open: boolean
  onClose: () => void
}

// One row of the shortcuts help overlay: [keys] + description. The keys
// array supports a shifted pair like z / Z.
function Row({ keys, labelKey }: { keys: string[]; labelKey: MessageKey }) {
  return (
    <div className="shortcuts-help__row">
      <span className="shortcuts-help__keys">
        {keys.map((k) => (
          <kbd key={k} className="shortcuts-help__kbd">{k}</kbd>
        ))}
      </span>
      <span className="shortcuts-help__label">{t(labelKey)}</span>
    </div>
  )
}

// Shortcuts help overlay (UI-audit follow-up: discoverability). Most
// shortcuts had NO visible affordance anywhere -- screenshots, A/V delays,
// playback speed were all invisible features until this. Toggled with the
// 'h' physical key or the '?' button in the control bar, closed with
// Escape (topmost-layer priority).
export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  if (!open) return null
  return (
    <div
      className="shortcuts-help"
      role="dialog"
      aria-modal="false"
      aria-label={t('helpTitle')}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="shortcuts-help__panel">
        <div className="shortcuts-help__title">{t('helpTitle')}</div>
        <div className="shortcuts-help__grid">
          <Row keys={[t('kbdSpace'), 'K']} labelKey="scPlayPause" />
          <Row keys={['←', '→']} labelKey="scSeek" />
          <Row keys={['↑', '↓']} labelKey="scVolume" />
          <Row keys={['F']} labelKey="scFullscreen" />
          <Row keys={['N']} labelKey="nextTrack" />
          <Row keys={['P']} labelKey="previousTrack" />
          <Row keys={['L']} labelKey="queue" />
          <Row keys={['S']} labelKey="subtitles" />
          <Row keys={['z', 'Z']} labelKey="scSubDelay" />
          <Row keys={['[', ']']} labelKey="scAudioDelay" />
          <Row keys={['<', '>']} labelKey="scSpeed" />
          <Row keys={['C']} labelKey="scScreenshot" />
          <Row keys={['H']} labelKey="helpTitle" />
        </div>
        <div className="shortcuts-help__hint">{t('helpHint')}</div>
        <button type="button" className="icon-btn shortcuts-help__close" aria-label={t('close')} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
