import type { PlaylistItem } from '../hooks/usePlaylist'

interface PlaylistPanelProps {
  open: boolean
  queue: PlaylistItem[]
  currentIndex: number
  shuffle: boolean
  repeat: boolean
  onToggleShuffle: () => void
  onToggleRepeat: () => void
  onPlay: (index: number) => void
  onRemove: (index: number) => void
  onClear: () => void
  onClose: () => void
}

export function PlaylistPanel({ open, queue, currentIndex, shuffle, repeat, onToggleShuffle, onToggleRepeat, onPlay, onRemove, onClear, onClose }: PlaylistPanelProps) {
  if (!open) return null
  return (
    <div className="playlist-panel" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="playlist-panel__header">
        <span className="playlist-panel__title">File d'attente ({queue.length})</span>
        <button
          type="button"
          className={`icon-btn${shuffle ? ' is-active' : ''}`}
          aria-label="Lecture aléatoire"
          title="Lecture aléatoire"
          onClick={(e) => { e.stopPropagation(); onToggleShuffle() }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M17 3l4 4-4 4V8h-2.7l-2.9 3.2-1.4-1.3L13.4 6H17V3zM3 6h4.3l2.1 2.3-1.3 1.4L6.5 8H3V6zm14 7v-3l4 4-4 4v-3h-3.6l-2.9-3.2 1.4-1.4L14.3 13H17zM3 16h3.5l5.9-6.6 1.4 1.4L7.9 18H3v-2z" />
          </svg>
        </button>
        <button
          type="button"
          className={`icon-btn${repeat ? ' is-active' : ''}`}
          aria-label="Répéter la file"
          title="Répéter la file"
          onClick={(e) => { e.stopPropagation(); onToggleRepeat() }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
            <path d="M7 7h10v2l4-3-4-3v2H5v6h2V7zm10 10H7v-2l-4 3 4 3v-2h12v-6h-2v4z" />
          </svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Vider la file" title="Vider la file" onClick={onClear}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
          </svg>
        </button>
        <button type="button" className="icon-btn" aria-label="Fermer" title="Fermer (Échap)" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>
      <ul className="playlist-panel__list">
        {queue.map((item, i) => (
          <li
            key={`${i}-${item.path}`}
            className={`playlist-panel__item${i === currentIndex ? ' is-current' : ''}`}
            onClick={() => onPlay(i)}
          >
            <span className="playlist-panel__name" title={item.path}>{item.name}</span>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Retirer ${item.name}`}
              title={`Retirer ${item.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(i)
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </li>
        ))}
        {queue.length === 0 && (
          <li className="playlist-panel__empty">File vide — déposez des vidéos</li>
        )}
      </ul>
    </div>
  )
}
