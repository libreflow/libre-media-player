
import { useRef } from 'react'
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
  const panelRef = useRef<HTMLDivElement | null>(null)
  if (!open) return null

  // Focus trap: the overlay dims the app behind it, but focus could still
  // Tab out into the (hidden) controls -- Space/arrows there acted on the
  // video THROUGH the backdrop. Wrapping keeps focus inside the dialog.
  const onTabPressed = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, [tabindex]:not([tabindex="-1"])',
    )
    if (!focusables || focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div
      className="shortcuts-help"
      role="dialog"
      aria-modal="true"
      aria-label={t('helpTitle')}
      onKeyDown={onTabPressed}
      onClick={(e) => {
        e.stopPropagation()
        // Clicking the dimmed backdrop closes the overlay -- the gesture
        // every track menu already teaches (mousedown outside = close).
        if (e.target === e.currentTarget) onClose()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="shortcuts-help__panel" ref={panelRef}>
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
        <button
          type="button"
          className="icon-btn shortcuts-help__close"
          aria-label={t('close')}
          onClick={onClose}
          // Focus starts inside the dialog (before, Tab wandered through
          // the controls BEHIND the dimmed backdrop).
          autoFocus
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
