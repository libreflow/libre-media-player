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
          <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-3.02a15.7 15.7 0 0 0-1.05-5.4A8.03 8.03 0 0 1 19.93 11zM12 4.04c.83 1.2 1.7 3.44 1.88 6.96h-3.76c.18-3.52 1.05-5.76 1.88-6.96zM4.07 13h3.02c.14 1.96.5 3.8 1.05 5.4A8.03 8.03 0 0 1 4.07 13zm3.02-2H4.07a8.03 8.03 0 0 1 4.07-5.4 15.7 15.7 0 0 0-1.05 5.4zM12 19.96c-.83-1.2-1.7-3.44-1.88-6.96h3.76c-.18 3.52-1.05 5.76-1.88 6.96zm2.86-1.56c.55-1.6.91-3.44 1.05-5.4h3.02a8.03 8.03 0 0 1-4.07 5.4z" />
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
