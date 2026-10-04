import { useEffect, useRef, useState } from 'react'
import type { MpvTrack } from '../../subtitles'

interface TrackMenuProps {
  label: string
  tracks: MpvTrack[]
  onSelect: (id: number) => void
  onDisable?: () => void
  disabledSelected: boolean
}

export function TrackMenu({ label, tracks, onSelect, onDisable, disabledSelected }: TrackMenuProps) {
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

  if (tracks.length === 0) return null

  return (
    <div className="track-menu" ref={rootRef}>
      <button
        type="button"
        className={`icon-btn${open ? ' is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={label}
        title={label}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
      </button>
      {open && (
        <div
          className="track-menu__panel"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="track-menu__title">{label}</div>
          {onDisable && (
            <button
              type="button"
              className={`track-menu__item${disabledSelected ? ' is-selected' : ''}`}
              onClick={() => {
                onDisable()
                setOpen(false)
              }}
            >
              Désactivées
            </button>
          )}
          {tracks.map((t) => (
            <button
              key={`${t.type}-${t.id}`}
              type="button"
              className={`track-menu__item${t.selected && !disabledSelected ? ' is-selected' : ''}`}
              onClick={() => {
                onSelect(t.id)
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
