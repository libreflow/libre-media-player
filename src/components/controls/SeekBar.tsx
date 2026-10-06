import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../../utils'

interface SeekBarProps {
  timePos: number | null
  duration: number | null
  seekingRef: React.MutableRefObject<boolean>
  onSeekChange: (t: number) => void
  onSeekCommit: (t: number) => void
  paused: boolean
}

// Smooth progress rendering. mpv reports time-pos on its internal ticks
// (~1s apart or coarser depending on options), so rendering the raw value
// makes the bar jump in visible steps. Between ticks we extrapolate the
// playback position with requestAnimationFrame, giving a continuously
// gliding bar like VLC/modern web players. Extrapolation stops while
// paused, while the user is dragging (seekingRef), and when the video
// hasn't started (timePos == null).
export function SeekBar({ timePos, duration, seekingRef, onSeekChange, onSeekCommit, paused }: SeekBarProps) {
  const [displayPos, setDisplayPos] = useState<number | null>(timePos)
  const timePosRef = useRef<number | null>(timePos)
  const pausedRef = useRef(paused)
  const durationRef = useRef<number | null>(duration)
  // Mirrored into refs for the rAF callback, but only inside an effect:
  // writing refs during render is a side effect the React Compiler lint
  // (rightly) flags; the rAF loop only reads them after commit anyway.
  useEffect(() => {
    timePosRef.current = timePos
    pausedRef.current = paused
    durationRef.current = duration
  }, [timePos, paused, duration])

  // Follow the raw position whenever it changes (or is cleared), EXCEPT
  // while the user is dragging: during a drag the input's own value is the
  // source of truth and observer updates must not snap the thumb back.
  useEffect(() => {
    if (seekingRef.current) return
    setDisplayPos(timePos)
  }, [timePos, seekingRef])

  // rAF loop: advance the displayed position between observer ticks.
  useEffect(() => {
    if (paused || timePos == null || duration == null || duration <= 0) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (!seekingRef.current && !pausedRef.current && timePosRef.current != null) {
        const dur = durationRef.current
        if (dur != null && dur > 0) {
          const elapsed = (now - last) / 1000
          const next = Math.min(timePosRef.current + elapsed, dur)
          setDisplayPos(next)
        }
      }
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, timePos, duration, seekingRef])

  const fillPercent = duration != null && duration > 0
    ? `${Math.min(100, Math.max(0, ((displayPos ?? 0) / duration) * 100))}%`
    : '0%'

  return (
    <div className="seek-row">
      <span className="time">{formatTime(displayPos)}</span>
      <input
        type="range"
        className="seek-bar"
        min={0}
        max={duration ?? 0}
        step={0.1}
        value={displayPos ?? 0}
        style={{ '--fill': fillPercent } as React.CSSProperties}
        onChange={(e) => {
          seekingRef.current = true
          const v = Number(e.target.value)
          setDisplayPos(v)
          onSeekChange(v)
        }}
        onMouseUp={(e) => onSeekCommit(Number(e.currentTarget.value))}
        onKeyUp={(e) => onSeekCommit(Number(e.currentTarget.value))}
        onTouchEnd={(e) => onSeekCommit(Number(e.currentTarget.value))}
      />
      <span className="time">{formatTime(duration)}</span>
    </div>
  )
}
