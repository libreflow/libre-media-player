import { useEffect, useRef, useState } from 'react'
import type { MpvTrack } from '../../subtitles'

interface SubtitleButtonProps {
  subtitlesAvailable: boolean
  subtitlesVisible: boolean
  subTracks: MpvTrack[]
  disabledSelected: boolean
  onToggleSubtitles: () => void
  onSelectSubtrack: (id: number) => void
  onDisableSubtitles: () => void
}

// Combined subtitle control: clicking the CC icon toggles subtitle visibility
// (the familiar quick action), while the small caret next to it opens the
// track picker -- one control instead of a toggle button plus a separate,
// easy-to-miss track menu button.
export function SubtitleButton({
  subtitlesAvailable,
  subtitlesVisible,
  subTracks,
  disabledSelected,
  onToggleSubtitles,
  onSelectSubtrack,
  onDisableSubtitles,
}: SubtitleButtonProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const hasTracks = subTracks.length > 0

  return (
    <div className="track-menu" ref={rootRef}>
      <div className="subtitle-btn-group">
        <button
          type="button"
          className={`icon-btn${subtitlesVisible ? ' is-active' : ''}`}
          disabled={!subtitlesAvailable}
          onClick={onToggleSubtitles}
          aria-label={subtitlesVisible ? 'Masquer les sous-titres' : 'Afficher les sous-titres'}
          title={subtitlesAvailable ? 'Sous-titres (s) — le chevron permet de choisir la piste' : 'Aucun sous-titre trouvé'}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm-2-4H10v-2h8v2z" />
          </svg>
        </button>
        {hasTracks && (
          <button
            type="button"
            className={`icon-btn subtitle-caret${open ? ' is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            aria-label="Choisir la piste de sous-titres"
            aria-expanded={open}
            title="Choisir la piste de sous-titres"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
        )}
      </div>
      {open && hasTracks && (
        <div
          className="track-menu__panel"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="track-menu__title">Sous-titres</div>
          <button
            type="button"
            className={`track-menu__item${disabledSelected ? ' is-selected' : ''}`}
            onClick={() => {
              onDisableSubtitles()
              setOpen(false)
            }}
          >
            Désactivés
          </button>
          {subTracks.map((t) => (
            <button
              key={`sub-${t.id}`}
              type="button"
              className={`track-menu__item${t.selected && !disabledSelected ? ' is-selected' : ''}`}
              onClick={() => {
                onSelectSubtrack(t.id)
                setOpen(false)
              }}
            >
              {t.title ?? t.lang ?? `Piste ${t.id}`}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
