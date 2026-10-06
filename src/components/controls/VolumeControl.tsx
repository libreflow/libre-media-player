import { useEffect, useRef } from 'react'
import { MAX_VOLUME } from '../../utils'

interface VolumeControlProps {
  volume: number
  setVolume: (v: number) => void
}

export function VolumeControl({ volume, setVolume }: VolumeControlProps) {
  const fillPercent = `${Math.min(100, Math.max(0, (volume / MAX_VOLUME) * 100))}%`
  const muted = volume === 0
  // Three icon states like VLC: crossed speaker when muted, one arc for
  // a low level, two arcs once the level is comfortable.
  const low = !muted && volume <= 50
  // Clicking the speaker icon toggles between 0 and the last non-zero
  // value (40 is a sane floor when the slider was never moved).
  const lastNonZeroRef = useRef(40)
  // Mirrored inside an effect (not during render) for the React Compiler
  // lint; toggleMute reads it at click time, after commit.
  useEffect(() => {
    if (volume > 0) lastNonZeroRef.current = volume
  }, [volume])
  const toggleMute = () => setVolume(muted ? lastNonZeroRef.current : 0)
  return (
    <div className="volume-row">
      <button
        type="button"
        className="icon-btn volume-icon"
        onClick={toggleMute}
        aria-label={muted ? 'Réactiver le son' : 'Couper le son'}
      >
        {muted ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M3 10v4h4l5 5V5L7 10H3z" />
            <path d="M19.5 8.5l-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4-2.1-2.1z" transform="translate(4 -2)" />
          </svg>
        ) : low ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M3 10v4h4l5 5V5L7 10H3z" />
            <path d="M14.5 8.5a4.5 4.5 0 010 7" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M3 10v4h4l5 5V5L7 10H3z" />
            <path d="M14.5 8.5a4.5 4.5 0 010 7" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M17.5 6a8 8 0 010 12" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        )}
      </button>
      <input
        type="range"
        className="volume-bar"
        min={0}
        max={MAX_VOLUME}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        style={{ '--fill': fillPercent } as React.CSSProperties}
      />
    </div>
  )
}
