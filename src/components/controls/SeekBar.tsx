import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../../utils'
import { t } from '../../i18n'
import { chapterAt, type Chapter } from '../../chapters'

interface SeekBarProps {
  timePos: number | null
  duration: number | null
  seekingRef: React.MutableRefObject<boolean>
  onSeekChange: (t: number) => void
  onSeekCommit: (t: number) => void
  paused: boolean
  visible: boolean
  chapters: Chapter[]
}

// Smooth progress rendering. mpv reports time-pos on its internal ticks
// (~1s apart or coarser depending on options), so rendering the raw value
// makes the bar jump in visible steps. Between ticks we extrapolate the
// playback position with requestAnimationFrame, giving a continuously
// gliding bar like VLC/modern web players. Extrapolation stops while
// paused, while the user is dragging (seekingRef), and when the video
// hasn't started (timePos == null).
export function SeekBar({ timePos, duration, seekingRef, onSeekChange, onSeekCommit, paused, visible, chapters }: SeekBarProps) {
  const [displayPos, setDisplayPos] = useState<number | null>(timePos)
  // Hover preview (roadmap #61): position hovered on the track and the
  // chapter (if any) it would jump to, shown in a floating tooltip.
  const [hover, setHover] = useState<{ pos: number; chapter: Chapter | null } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
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

  // rAF loop: advance the displayed position between observer ticks. It
  // only runs while the bar is actually on screen (the controls overlay is
  // hidden during playback after the idle timeout) -- extrapolating a
  // position nobody can see re-rendered this subtree at ~60fps for the
  // entire duration of every video.
  useEffect(() => {
    if (!visible || paused || timePos == null || duration == null || duration <= 0) return
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
  }, [visible, paused, timePos, duration, seekingRef])

  const fillPercent = duration != null && duration > 0
    ? `${Math.min(100, Math.max(0, ((displayPos ?? 0) / duration) * 100))}%`
    : '0%'

  // Maps a pointer x within the track to a time value.
  const posFromClientX = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || duration == null || duration <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }

  const currentChapter = chapterAt(chapters, displayPos)

  return (
    <div className="seek-row">
      <span className="time">{formatTime(displayPos)}</span>
      <div
        className="seek-track-wrap"
        ref={trackRef}
        onPointerMove={(e) => {
          const pos = posFromClientX(e.clientX)
          if (pos != null) setHover({ pos, chapter: chapterAt(chapters, pos) })
        }}
        onPointerLeave={() => setHover(null)}
      >
        <input
          type="range"
          className="seek-bar"
          min={0}
          max={duration ?? 0}
          step={0.1}
          value={displayPos ?? 0}
          style={{ '--fill': fillPercent } as React.CSSProperties}
          // ARIA slider semantics (roadmap #56): the range input is already
          // a native slider, but the value textualized via aria-valuetext
          // lets screen readers announce the formatted time instead of a
          // raw second count.
          aria-valuetext={formatTime(displayPos)}
          aria-label={t('play')}
          onChange={(e) => {
            seekingRef.current = true
            const v = Number(e.target.value)
            setDisplayPos(v)
            onSeekChange(v)
          }}
          onMouseUp={(e) => onSeekCommit(Number(e.currentTarget.value))}
          // onKeyUp only commits when a change actually happened (a real
          // keyboard drag: onChange fired and set seekingRef). When the
          // global arrow-key shortcut preventDefault'ed the keydown, no
          // onChange ran and seekingRef is still false -- committing here
          // would send a STALE absolute seek that cancels the relative seek
          // the shortcut just issued.
          onKeyUp={(e) => {
            if (seekingRef.current) onSeekCommit(Number(e.currentTarget.value))
          }}
          onTouchEnd={(e) => onSeekCommit(Number(e.currentTarget.value))}
        />
        {chapters.map((c, i) => (
          <span
            key={`chapter-${i}-${c.time}`}
            className="seek-chapter"
            style={{ left: duration != null && duration > 0 ? `${(c.time / duration) * 100}%` : undefined }}
          />
        ))}
        {hover && (
          <span className="seek-hover" style={{ left: duration != null ? `${(hover.pos / duration) * 100}%` : undefined }}>
            <span className="seek-hover__time">{formatTime(hover.pos)}</span>
            {hover.chapter && <span className="seek-hover__chapter">{hover.chapter.title}</span>}
          </span>
        )}
      </div>
      <span className="time">{formatTime(duration)}</span>
      {currentChapter && (
        <span className="chapter-label" role="status">{currentChapter.title}</span>
      )}
    </div>
  )
}
