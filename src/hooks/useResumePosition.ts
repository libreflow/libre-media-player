import { useCallback, useEffect, useMemo, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getResumePosition, getResumeTracks, saveResumePosition } from '../resume'

// How often to persist the resume position while playing (seconds of
// wall-clock time between writes). A crash/power loss between two
// checkpoints loses at most this much progress -- cheap tradeoff against
// writing to disk on every time-pos tick (several times a second).
const RESUME_SAVE_INTERVAL_MS = 5000

export interface ResumeTrackState {
  /** Full path of the currently loaded file (resume-map key). */
  path: string | null
  timePos: number | null
  duration: number | null
  /** Track selection snapshot, refreshed before each save. */
  sid: string | null
  aid: string | null
}

// Persists the playback position of the current file so re-opening it
// resumes where the user left off. All writes are checkpoint-based:
// on pause, every RESUME_SAVE_INTERVAL_MS while playing, on file switch
// (previous file), and on window close (awaited).
//
// The hook is deliberately push-driven: usePlayer feeds it the current
// path/position/duration through track() (called from mpv's property
// observer) and calls checkpoint() at the moments that matter.
export function useResumePosition(ready: boolean, onBeforeSave?: () => Promise<void>) {
  const stateRef = useRef<ResumeTrackState>({ path: null, timePos: null, duration: null, sid: null, aid: null })

  const track = useCallback((next: Partial<ResumeTrackState>) => {
    Object.assign(stateRef.current, next)
  }, [])

  const onBeforeSaveRef = useRef(onBeforeSave)
  // Keep the ref in sync inside an effect (not during render) so the
  // debounced checkpoint always calls the latest callback.
  useEffect(() => {
    onBeforeSaveRef.current = onBeforeSave
  })

  const checkpoint = useCallback(async () => {
    // Give the owner one chance to refresh the tracked state (e.g. the
    // current mpv track selection) before the entry is written.
    await onBeforeSaveRef.current?.().catch(() => {})
    const { path, timePos, duration, sid, aid } = stateRef.current
    if (!path || timePos == null) return
    await saveResumePosition(path, timePos, duration ?? 0, { sid: sid ?? undefined, aid: aid ?? undefined })
  }, [])

  // Split file-change handling in two so the mpv event window during
  // loadfile is airtight: the old file keeps emitting time-pos/pause
  // events until the new one actually starts, so tracking must keep
  // pointing at the OLD path for that whole duration. Saving the outgoing
  // position happens up front (on its own copy, in the background); the
  // tracking reset to the new path only once loadfile has succeeded.
  const onFileChangeOutgoing = useCallback(() => {
    const outgoing = stateRef.current
    const { path: oldPath, timePos, duration, sid, aid } = outgoing
    if (!oldPath || timePos == null) return
    void saveResumePosition(oldPath, timePos, duration ?? 0, { sid: sid ?? undefined, aid: aid ?? undefined })
  }, [])

  const onFileChangeIncoming = useCallback((path: string) => {
    stateRef.current = { path, timePos: null, duration: null, sid: null, aid: null }
  }, [])

  // Snapshot the current track selection into the tracking state; the
  // player calls this before every checkpoint so saves are never stale.
  const trackSelection = useCallback((sel: { sid: string | null; aid: string | null }) => {
    stateRef.current.sid = sel.sid
    stateRef.current.aid = sel.aid
  }, [])

  // Returns the remembered position for this path, or null.
  const resumeAt = useCallback((path: string) => getResumePosition(path), [])

  // Returns the remembered track selection for this path, or null.
  const resumeTracks = useCallback((path: string) => getResumeTracks(path), [])

  // Periodic checkpoint while playing, so a crash or power loss between
  // pauses loses at most RESUME_SAVE_INTERVAL_MS of progress.
  useEffect(() => {
    if (!ready) return
    const timer = setInterval(() => void checkpoint(), RESUME_SAVE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [ready, checkpoint])

  // Also checkpoint when the window is about to close -- the periodic timer
  // alone could miss up to RESUME_SAVE_INTERVAL_MS of progress right before
  // a clean quit. Await the save (not fire-and-forget): onCloseRequested's
  // wrapper awaits this handler before letting the window actually close,
  // so a bare `void checkpoint()` would race the write against process
  // exit and could lose it.
  useEffect(() => {
    if (!ready) return
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await getCurrentWindow().onCloseRequested(async () => {
        await checkpoint()
      })
    })()
    return () => unlisten?.()
  }, [ready, checkpoint])

  // Memoized so the returned object itself stays referentially stable --
  // every property here is already a []-deps useCallback, but without this
  // the OBJECT LITERAL was a fresh reference on every render regardless.
  // usePlayer's loadFile depends on this whole object ([resume]), so an
  // unstable object silently defeated loadFile's own memoization: it was
  // recreated on every mpv time-pos tick (several times a second during
  // playback), which in turn churned every effect depending on loadFile's
  // identity (e.g. useFilePicker's native drag-drop subscription).
  return useMemo(
    () => ({ track, checkpoint, onFileChangeOutgoing, onFileChangeIncoming, trackSelection, resumeAt, resumeTracks }),
    [track, checkpoint, onFileChangeOutgoing, onFileChangeIncoming, trackSelection, resumeAt, resumeTracks],
  )
}
