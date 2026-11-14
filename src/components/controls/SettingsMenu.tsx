import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n'

interface SettingsMenuProps {
  /** Keep-speed preference (roadmap follow-up): when on, the chosen
   * playback speed survives loadfile instead of resetting to 1×. */
  keepPlaybackSpeed: boolean
  onToggleKeepSpeed: () => void
  /** Non-zero when a full-screen overlay opens (help): closes the menu so
   * it can't stay open UNDER the overlay. */
  closeSignal?: number
}

// Small settings popover (gear icon in the control bar). Deliberately
// reuses the track-menu classes: same floating glass panel, same outside
// click/Escape dismissal, same closeSignal consumption semantics as
// TrackMenu/SubtitleButton.
export function SettingsMenu({ keepPlaybackSpeed, onToggleKeepSpeed, closeSignal = 0 }: SettingsMenuProps) {
  const [open, setOpen] = useState(false)
  // Force-closed while a full-screen overlay (the shortcuts help) is up --
  // same CONSUME (not mask) semantics as TrackMenu.
  const shown = open && closeSignal === 0
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect -- deliberate: the signal must CONSUME 'open' (see TrackMenu)
    if (closeSignal) setOpen(false)
  }, [closeSignal])
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shown) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [shown])

  return (
    <div
      className="track-menu"
      ref={rootRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && shown) {
          setOpen(false)
          e.stopPropagation()
        }
      }}
    >
      <button
        type="button"
        className={`icon-btn${shown ? ' is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={t('settingsTitle')}
        title={t('settingsTitle')}
        aria-haspopup="menu"
        aria-expanded={shown}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M3 17h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zM3 5h18v10H3V5zm2 2v6h14V7H5z" />
          <path d="M7 9h10v2H7z" />
        </svg>
      </button>
      {shown && (
        <div
          className="track-menu__panel"
          role="menu"
          aria-label={t('settingsTitle')}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="track-menu__title">{t('settingsTitle')}</div>
          <button
            type="button"
            className={`track-menu__item${keepPlaybackSpeed ? ' is-selected' : ''}`}
            role="menuitemcheckbox"
            aria-checked={keepPlaybackSpeed}
            onClick={() => {
              onToggleKeepSpeed()
              setOpen(false)
            }}
          >
            {t('keepSpeed')}
          </button>
        </div>
      )}
    </div>
  )
}
