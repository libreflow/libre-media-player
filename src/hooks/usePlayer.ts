import { useCallback, useEffect, useRef, useState } from 'react'
import {
  init,
  destroy,
  observeProperties,
  command,
  setProperty,
  getProperty,
  type MpvObservableProperty,
} from 'tauri-plugin-libmpv-api'
import { loadSettings, updateSettings } from '../settings'
import { describeLoadError } from '../mpvErrors'
import { screenshotPath } from '../screenshot'
import { exists } from '@tauri-apps/plugin-fs'
import { userFacingMessage } from '../errors'
import { t } from '../i18n'
import { useResumePosition } from './useResumePosition'
import { nextPlaybackSpeed } from '../utils'

const OBSERVED_PROPERTIES = [
  ['pause', 'flag'],
  ['time-pos', 'double', 'none'],
  ['duration', 'double', 'none'],
  ['filename', 'string', 'none'],
  ['volume', 'int64'],
  // speed stays a plain double (never none: mpv defaults to 1, even with
  // no file loaded), so the observer callback's value needs no null-case.
  ['speed', 'double'],
] as const satisfies MpvObservableProperty[]

export interface PlayerState {
  ready: boolean
  error: string | null
  filename: string | null
  paused: boolean
  /** Optimistic mirror of mpv's pause (flip is immediate; the React state
   * only follows the property observer). Read at interaction time when the
   * CURRENT value matters more than the last committed render. */
  pausedRef: React.MutableRefObject<boolean>
  timePos: number | null
  duration: number | null
  volume: number
}

export function usePlayer(
  // loadGeneration identifies the mpv load that produced this callback
  // (incremented per loadfile and per stop) -- see loadGenerationRef below.
  onFileLoaded?: (path: string, loadGeneration: number) => void,
): PlayerState & {
  loadFile: (path: string) => Promise<void>
  loadInFlightRef: React.MutableRefObject<boolean>
  seekingRef: React.MutableRefObject<boolean>
  readyRef: React.MutableRefObject<boolean>
  whenReady: () => Promise<void>
  setTimePos: (t: number) => void
  togglePause: () => void
  setVolume: (v: number) => void
  // mpv's audio-delay property (seconds, negative = audio earlier). Kept in
  // state so the UI can display the current compensation.
  adjustAudioDelay: (delta: number) => void
  audioDelay: number
  // mpv's sub-delay property (seconds). Positive delays subtitles.
  adjustSubDelay: (delta: number) => void
  subDelay: number
  // mpv's playback speed property (1 = normal). Speed is a per-file
  // diagnostic like A/V delay, NOT a preference: mpv resets it on
  // loadfile and so does the mirrored React state.
  adjustSpeed: (delta: number) => number
  speed: number
  // Keep-speed preference (see toggleKeepSpeed): true when the chosen
  // playback speed survives loadfile.
  keepPlaybackSpeed: boolean
  toggleKeepSpeed: () => void
  // Mute toggle ('m' shortcut): 0 <-> last non-zero volume; returns the
  // resulting volume for the OSD.
  toggleMute: () => number
  // Captures the displayed frame (subtitles included) to a PNG next to
  // the video (roadmap #60). Returns the destination path so the caller
  // can show a confirmation OSD.
  takeScreenshot: () => Promise<string>
  // Stops playback and clears the current file, returning the player to
  // its empty state.
  stopPlayback: () => Promise<void>
  // Re-runs mpv init after a failure (clears the rejected init promise).
  // Exposed so the UI can offer a "Réessayer" button on the error banner.
  retryInit: () => void
  // Clears the player error banner without re-running init -- for a
  // transient load failure (e.g. one corrupt file) the player is still
  // fully usable, and the banner used to be un-dismissable until the next
  // successful load.
  clearError: () => void
} {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [paused, setPaused] = useState(true)
  const [timePos, setTimePos] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [volume, setVolumeState] = useState(100)
  const [audioDelay, setAudioDelayState] = useState(0)
  const [subDelay, setSubDelayState] = useState(0)
  const [speed, setSpeedState] = useState(1)
  const speedRef = useRef(1)
  // Last speed the USER chose via < / > (or the reset chip). With the
  // keep-speed preference on, this is the speed the next file starts at.
  const lastSpeedRef = useRef(1)
  // Mirror of mpv's volume for interaction-time reads (toggleMute), kept in
  // sync by the property observer and setVolume, like pausedRef for pause.
  const volumeRef = useRef(100)
  // Last non-zero volume, the value unmuting returns to (40 is the same
  // sane floor VolumeControl's button uses when the slider never moved).
  const lastNonZeroVolumeRef = useRef(100)
  // Keep-speed preference (roadmap follow-up): when on, mpv's
  // reset-on-next-file list drops 'speed' so the chosen speed survives
  // loadfile, and the React mirror follows lastSpeedRef instead of 1.
  const [keepSpeed, setKeepSpeedState] = useState(false)
  const keepSpeedRef = useRef(false)
  const seekingRef = useRef(false)
  const readyRef = useRef(false)
  const pausedRef = useRef(true)
  // Resolved once the player's mpv init completes successfully -- lets
  // callers (file association) await readiness instead of polling readyRef.
  // Re-installed on every mount cycle so a StrictMode unmount/remount can't
  // leave callers waiting on a promise from a destroyed player.
  const readyPromiseRef = useRef<Promise<void>>(Promise.resolve())
  const whenReady = useCallback(() => readyPromiseRef.current, [])
  // Guards against StrictMode's double-mount racing two concurrent init()
  // calls against an mpv instance that only tolerates one.
  const initPromiseRef = useRef<Promise<unknown> | null>(null)
  // Cancellation signal + observeProperties unlisten for the CURRENT init
  // cycle. doInit stores the unlisten here once observeProperties resolves
  // so the effect cleanup (and retryInit) can always tear it down, even if
  // the component unmounts while observeProperties is still in flight.
  const initSignalRef = useRef<{ cancelled: boolean } | null>(null)
  const observeUnlistenRef = useRef<(() => void) | null>(null)
  // Resolver for the current readiness promise, stored in a ref so
  // retryInit can resolve it after a successful re-init.
  // True while a doInit cycle is running (between its start and its
  // settle). retryInit refuses to start a second cycle while this is
  // set -- two concurrent native init() calls are the double-click race
  // fixed alongside this flag.
  const initInFlightRef = useRef(false)
  const readyResolveRef = useRef<(() => void) | null>(null)
  // Full path of the currently loaded file, as passed to loadFile -- NOT
  // the same as `filename` (mpv's observed 'filename' property is just the
  // basename, which is ambiguous as a resume-map key across directories).
  const currentPathRef = useRef<string | null>(null)
  // Generation counter incremented on every mpv load transition (successful
  // loadfile, stop). Passed to onFileLoaded so consumers (useSubtitles) can
  // tell "same file, still the same load" (don't re-add the sidecar) from
  // "same path reloaded" (mpv discarded sub-add tracks; the sidecar must be
  // re-added -- repeat loop, stop then reopen from recents).
  const loadGenerationRef = useRef(0)

  // Reads the current audio/sub track selection from mpv into the resume
  // tracking state. Reading per-save (rather than in the property observer)
  // avoids a stale sid/aid when the user switches tracks right before
  // pausing or closing. trackSelection is reached through a ref because
  // it lives on the resume object which is created just below.
  const trackSelectionRef = useRef<(sel: { sid: string | null; aid: string | null }) => void>(() => {})
  const captureTrackSelection = useCallback(async () => {
    // Flush a pending debounced volume save: this callback runs before
    // every resume checkpoint, including the AWAITED one on window close --
    // without this, a volume changed within the 600ms debounce window was
    // lost when quitting right after adjusting it.
    if (volumeSaveTimerRef.current) {
      clearTimeout(volumeSaveTimerRef.current)
      volumeSaveTimerRef.current = null
    }
    const pendingVolume = pendingVolumeRef.current
    pendingVolumeRef.current = null
    if (pendingVolume != null) await updateSettings({ volume: pendingVolume })
    try {
      const [sid, aid] = await Promise.all([
        getProperty('sid', 'string'),
        getProperty('aid', 'string'),
      ])
      trackSelectionRef.current({ sid, aid })
    } catch {
      // Track selection is optional enrichment for resume; ignore failures.
    }
  }, [])

  const resume = useResumePosition(ready, captureTrackSelection)
  trackSelectionRef.current = resume.trackSelection
  // Keep the latest onFileLoaded callback reachable from the stable
  // loadFile without re-creating loadFile (and the listeners that depend
  // on its identity) on every render.
  const onFileLoadedRef = useRef(onFileLoaded)
  onFileLoadedRef.current = onFileLoaded

  // Initialize mpv once, embedded in this window. The effect body is
  // extracted into a retryable `doInitInner` so a failed init (missing
  // libmpv DLL, GPU init error, ...) can be retried by the user instead of
  // leaving the app stuck on the error banner forever.
  const doInitInner = useCallback(async (signal: { cancelled: boolean }) => {
    // Reuse the in-flight (or completed) init across StrictMode's
    // unmount/remount cycle instead of calling init() twice.
    if (!initPromiseRef.current) {
      initPromiseRef.current = init({
        initialOptions: {
          vo: 'gpu-next',
          hwdec: 'auto-safe',
          'keep-open': 'always',
          'force-window': 'yes',
          // mpv KEEPS runtime option changes from one file to the next
          // ("Normally, mpv will try to keep all settings when playing the
          // next file") -- the React-side resets in loadFileInner assumed
          // the opposite, desyncing the mirror state when a file was
          // opened at a non-default speed/delay. Declaring the resets
          // here makes mpv itself restore the defaults on every loadfile.
          'reset-on-next-file': 'speed,audio-delay,sub-delay',
        },
        observedProperties: OBSERVED_PROPERTIES,
      })
    }
    await initPromiseRef.current
    if (signal.cancelled) return
    const unlisten = await observeProperties(OBSERVED_PROPERTIES, (event) => {
      switch (event.name) {
        case 'pause':
          pausedRef.current = event.data
          setPaused(event.data)
          // Checkpoint immediately on pause -- the user stopping to
          // step away is exactly the moment a resume point matters
          // most, don't wait for the next periodic tick.
          if (event.data) void resume.checkpoint()
          break
        case 'time-pos':
          // Skip the transition window: the OLD file keeps emitting until
          // the new one starts, and after onFileChangeIncoming the tracked
          // path already points at the NEW file -- a tick landing in that
          // gap saved A's position under B's key (the guard documented in
          // loadFileInner's comments, applied here where the ticks land).
          if (loadInFlightRef.current) break
          resume.track({ timePos: event.data })
          if (!seekingRef.current) setTimePos(event.data)
          break
        case 'duration':
          resume.track({ duration: event.data })
          setDuration(event.data)
          break
        case 'filename':
          setFilename(event.data)
          break
        case 'volume':
          volumeRef.current = event.data
          if (event.data > 0) lastNonZeroVolumeRef.current = event.data
          setVolumeState(event.data)
          break
        case 'speed':
          speedRef.current = event.data
          setSpeedState(event.data)
          break
      }
    })
    if (signal.cancelled) {
      unlisten()
      return
    }
    observeUnlistenRef.current = unlisten
    // Restore the persisted volume once the player is up (mpv's own
    // default is 100 and would otherwise override the saved value), and
    // apply the keep-speed preference to mpv's per-file reset list.
    try {
      const { volume: saved, keepPlaybackSpeed } = await loadSettings()
      keepSpeedRef.current = keepPlaybackSpeed
      setKeepSpeedState(keepPlaybackSpeed)
      await setProperty('volume', saved)
      volumeRef.current = saved
      if (saved > 0) lastNonZeroVolumeRef.current = saved
      setVolumeState(saved)
      if (keepPlaybackSpeed) {
        // Drop 'speed' from the per-file reset list so the chosen speed
        // survives loadfile (the init options declare the full list;
        // this runtime override narrows it when the preference is on).
        await setProperty('reset-on-next-file', 'audio-delay,sub-delay')
      }
    } catch {
      // best-effort; default volume (100) stays
    }
    if (signal.cancelled) return
    setError(null)
    setReady(true)
    readyRef.current = true
    readyResolveRef.current?.()
    readyResolveRef.current = null
  }, [resume])

  // Wrapper around doInitInner that tracks the in-flight state so
  // retryInit can refuse to start a second concurrent init cycle.
  const doInit = useCallback(async (signal: { cancelled: boolean }) => {
    initInFlightRef.current = true
    try {
      await doInitInner(signal)
    } finally {
      initInFlightRef.current = false
    }
  }, [doInitInner])

  // Manual retry after a failed init: clears the cached init promise (the
  // old one already rejected, keeping it would make every retry await the
  // same rejection) and re-runs doInit.
  //
  // An in-flight init is outright IGNORED, not cancelled-and-replaced:
  // replacing it would null initPromiseRef before the old doInit assigned
  // its promise, and the new doInit would then start a SECOND native
  // init() while the first is still running. When no init is in flight
  // (the failed case the button exists for), the rejected cached promise
  // is cleared and init re-runs.
  const clearError = useCallback(() => setError(null), [])

  const retryInit = useCallback(() => {
    if (initInFlightRef.current) return
    if (initSignalRef.current) initSignalRef.current.cancelled = true
    observeUnlistenRef.current?.()
    observeUnlistenRef.current = null
    initPromiseRef.current = null
    setError(null)
    setReady(false)
    readyRef.current = false
    const signal = { cancelled: false }
    initSignalRef.current = signal
    readyPromiseRef.current = new Promise<void>((resolve) => {
      readyResolveRef.current = resolve
    })
    void doInit(signal).catch((e) => {
      if (signal.cancelled) return
      setError(userFacingMessage(t('errInitEngine'), e).message)
    })
  }, [doInit])

  useEffect(() => {
    readyPromiseRef.current = new Promise<void>((resolve) => {
      readyResolveRef.current = resolve
    })
    const signal = { cancelled: false }
    initSignalRef.current = signal

    void doInit(signal).catch((e) => {
      if (signal.cancelled) return
      // Same mapping as retryInit: the raw technical reason (e.g. a missing
      // DLL name) must not leak to the banner -- only the summary.
      setError(userFacingMessage(t('errInitEngine'), e).message)
    })

    return () => {
      signal.cancelled = true
      observeUnlistenRef.current?.()
      observeUnlistenRef.current = null
      // Only destroy when init actually completed; otherwise a StrictMode
      // double-mount would call destroy() on an uninitialized player.
      if (readyRef.current) {
        readyRef.current = false
        void destroy().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: resume's callbacks are stable (useCallback with [] deps)
  }, [doInit])

  // The control bar used to reserve a bottom video margin via
  // setVideoMarginRatio so the picture never sat under it -- but that
  // visibly SHRANK the video (black bars appearing at the sides/bottom in
  // fullscreen) every time the controls showed or hid. The controls are
  // now a true overlay: the video keeps its full size at all times and
  // the bar simply floats above it with a gradient fade. Nothing to sync
  // anymore.

  // Cancel a pending debounced volume save on unmount. A real quit flushes
  // the pending value through the close checkpoint (captureTrackSelection
  // flushes it before persisting resume state); this cleanup only guards
  // dev StrictMode remounts, where dropping the save is harmless (the next
  // mount re-reads the persisted settings).
  useEffect(() => () => {
    if (volumeSaveTimerRef.current) {
      clearTimeout(volumeSaveTimerRef.current)
      volumeSaveTimerRef.current = null
    }
  }, [])

  const loadFileInner = useCallback(async (path: string) => {
    setError(null)
    // Grab the outgoing file's resume state synchronously, BEFORE loadfile:
    // the old file keeps emitting time-pos/pause events for as long as the
    // switch takes, and tracking must still point at it until the new file
    // actually starts. The actual tracking reset happens after loadfile
    // succeeds -- resetting earlier let the old file's positions be saved
    // under the new file's key (see the checkpoint in the observer).
    await resume.onFileChangeOutgoing()
    try {
      const previousPath = currentPathRef.current
      currentPathRef.current = path
      try {
        await command('loadfile', [path])
      } catch (e) {
        // Restore the previous file's tracking on failure so the seek/resume
        // logic doesn't point at a file that never actually loaded.
        currentPathRef.current = previousPath
        throw e
      }
      loadGenerationRef.current += 1
      // The new file owns the tracking from here on.
      resume.onFileChangeIncoming(path)
      // Observed properties only fire on CHANGE -- without this reset the
      // seek bar kept showing the previous file's duration/position until
      // the new file's first events landed.
      setDuration(null)
      setTimePos(null)
      // A/V and subtitle delay compensation are per-file diagnostics, not a
      // preference: mpv resets them on loadfile, so mirroring that reset in
      // React state keeps the UI honest (roadmap #55/#59). Playback speed
      // is reset the same way (mpv restores speed=1 on loadfile).
      setAudioDelayState(0)
      setSubDelayState(0)
      // With keep-speed on, mpv did NOT reset the speed (the reset list
      // excludes it), so the mirror must keep the user's choice too;
      // otherwise the chip shows ×1 while the video plays at ×1.5.
      const startSpeed = keepSpeedRef.current ? lastSpeedRef.current : 1
      speedRef.current = startSpeed
      setSpeedState(startSpeed)
      // mpv starts playback automatically on loadfile; read the REAL state
      // back instead of assuming one, since observeProperties only fires on
      // CHANGE and never emits if our guess already matched reality.
      const actuallyPaused = await getProperty('pause', 'flag')
      pausedRef.current = actuallyPaused ?? false
      setPaused(actuallyPaused ?? false)
      // Resume where we left off, if we have a remembered position for
      // THIS exact path (not just "some" file -- see getResumePosition's
      // own threshold logic for "too close to start"/"already finished").
      // Best-effort with a short retry: mpv executes loadfile asynchronously
      // and a seek issued before the file is fully up can be rejected with
      // "error running command" -- the file itself loads and plays fine, so
      // this must NOT fail the whole load (it used to bubble up to the
      // catch below and show "Impossible de lire ce fichier" while the
      // video played normally).
      const resumeAt = await resume.resumeAt(path)
      if (resumeAt != null && currentPathRef.current === path) {
        const seekResume = async (attempts: number): Promise<boolean> => {
          try {
            await command('seek', [resumeAt, 'absolute'])
            return true
          } catch {
            if (attempts > 0 && currentPathRef.current === path) {
              await new Promise((r) => setTimeout(r, 100))
              return seekResume(attempts - 1)
            }
            return false
          }
        }
        if (await seekResume(5)) {
          resume.track({ timePos: resumeAt })
          setTimePos(resumeAt)
        }
      }
      // Restore the remembered audio/sub track selection, if any. Track ids
      // refer to THIS file's track-list (ids are per-file in mpv), so a bad
      // id (file changed since) is rejected by mpv and ignored here.
      try {
        const tracks = await resume.resumeTracks(path)
        if (tracks && currentPathRef.current === path) {
          if (tracks.sid != null) await setProperty('sid', tracks.sid)
          if (tracks.aid != null) await setProperty('aid', tracks.aid)
        }
      } catch {
        // best-effort; defaults apply
      }
      onFileLoadedRef.current?.(path, loadGenerationRef.current)
    } catch (e) {
      setError(describeLoadError(e))
      // Re-throw so callers (playlist playIndex) can detect the failure;
      // the UI error is already surfaced via setError above.
      throw e
    }
  }, [resume])

  // Serializes loadFile calls: two concurrent loadfile commands against the
  // same mpv instance (e.g. a double-clicked file arriving while an EOF
  // auto-advance is still loading) crash the native player. Every load
  // chains behind the previous one; a failed load still lets the next run.
  const loadChainRef = useRef<Promise<void>>(Promise.resolve())
  const loadInFlightRef = useRef(false)

  const loadFile = useCallback((path: string) => {
    const run = loadChainRef.current.then(async () => {
      loadInFlightRef.current = true
      try {
        await loadFileInner(path)
      } finally {
        loadInFlightRef.current = false
      }
    })
    // Keep the chain alive even when a load fails (unhandled rejections
    // would both log noise and kill the chain).
    loadChainRef.current = run.catch(() => {})
    return run
  }, [loadFileInner])

  // Audio/sub delay compensation (roadmap #55/#58/#59). mpv's properties
  // are the single source of truth; React state mirrors them for display.
  // Applied with += semantics (mpv accepts additive assignments like
  // "audio-delay +0.1" through setProperty as a plain string value).
  const adjustAudioDelay = useCallback((delta: number) => {
    setAudioDelayState((d) => d + delta)
    void command('add', ['audio-delay', delta]).catch(() => {})
  }, [])

  const adjustSubDelay = useCallback((delta: number) => {
    setSubDelayState((d) => d + delta)
    void command('add', ['sub-delay', delta]).catch(() => {})
  }, [])

  // Playback speed (< / > shortcuts): mpv's `speed` property is the source
  // of truth, mirrored in React state for the OSD. The clamped next value
  // is returned so the caller can display it without awaiting the property
  // observer round-trip.
  const adjustSpeed = useCallback((delta: number): number => {
    const apply = (): number => {
      const next = nextPlaybackSpeed(speedRef.current, delta)
      speedRef.current = next
      lastSpeedRef.current = next
      setSpeedState(next)
      void setProperty('speed', next).catch(() => {})
      return next
    }
    // A load is mid-flight: mpv applies reset-on-next-file when the new
    // file starts, which would fight a delta applied NOW (the mirror was
    // already reset to 1). Queue the delta behind the load instead of
    // dropping the keypress -- the returned value is the best immediate
    // approximation for the OSD (the chain resolves in well under a
    // second).
    if (loadInFlightRef.current) {
      const chained = loadChainRef.current.then(() => {
        void apply()
      })
      loadChainRef.current = chained.catch(() => {})
      return nextPlaybackSpeed(1, delta)
    }
    return apply()
  }, [])

  const togglePause = useCallback(() => {
    const next = !pausedRef.current
    pausedRef.current = next
    void setProperty('pause', next).catch(() => {
      // mpv didn't take it (instance busy/destroyed): roll the optimistic
      // flip back so the next flash icon reflects the REAL state.
      pausedRef.current = !next
    })
  }, [])

  // Stops playback and clears the current file, returning the player to
  // its empty state (drop zone). mpv's `stop` clears the observed filename
  // property back to null, which propagates through the property observer
  // and flips hasMedia to false. The local state resets mirror loadFileInner's
  // post-load resets (observed properties only fire on CHANGE, so a leftover
  // duration/timePos would otherwise survive on the UI side).
  const stopPlayback = useCallback(async () => {
    // Checkpoint the position BEFORE stopping: the periodic timer saves at
    // most every RESUME_SAVE_INTERVAL_MS (5s), so removing the playing item
    // from the queue or clearing the queue used to silently drop up to 5
    // seconds of progress for a file the user intentionally keeps around.
    // Await it -- stop discards the tracked position right after, so a
    // fire-and-forget save could still race the stop.
    await resume.checkpoint().catch(() => {})
    setPaused(true)
    pausedRef.current = true
    setDuration(null)
    setTimePos(null)
    setFilename(null)
    // Reset the mirrored speed too: 'stop' keeps mpv's runtime speed (the
    // actual value is restored by reset-on-next-file at the next loadfile)
    // and the home screen would otherwise show a stale ×0.5 chip. With
    // keep-speed on, mpv keeps the runtime speed -- mirror the same value.
    const stopSpeed = keepSpeedRef.current ? lastSpeedRef.current : 1
    speedRef.current = stopSpeed
    setSpeedState(stopSpeed)
    // Invalidate the current load generation: mpv's stop discards tracks
    // added via sub-add, so a later reopen of the SAME path must re-run the
    // sidecar load (a bare path-based guard used to skip it).
    loadGenerationRef.current += 1
    await command('stop')
  }, [resume])

  // Screenshot capture: mpv refuses to overwrite an existing file and
  // errors on a collision, so the destination name is computed from the
  // set of PNGs that already exist -- both captured this session (the
  // in-memory set) and on disk from previous runs (exists()). Without the
  // disk probe, the second launch of the app always collided with the
  // previous session's "movie.1.png" and the capture failed.
  const screenshotTakenRef = useRef(new Set<string>())
  const takeScreenshot = useCallback(async (): Promise<string> => {
    const videoPath = currentPathRef.current
    if (!videoPath) throw new Error('aucune vidéo en lecture')
    const dest = await screenshotPath(videoPath, screenshotTakenRef.current, exists)
    // Reserve the destination BEFORE the round-trip: two rapid presses
    // (key auto-repeat) computed the SAME free name while the first
    // capture was in flight, and mpv refuses to overwrite -- the second
    // one always failed. Rolled back when the capture truly fails, so
    // the slot stays usable.
    screenshotTakenRef.current.add(dest.toLowerCase())
    try {
      await command('screenshot-to-file', [dest, 'subtitles'])
    } catch (e) {
      screenshotTakenRef.current.delete(dest.toLowerCase())
      throw e
    }
    return dest
  }, [])

  // Debounced persistence for the volume: the slider fires setVolume on
  // every input event during a drag (~60/s), and persisting on each call
  // meant a settings.json read+write per tick. React state and mpv stay
  // instant; only the disk write waits for the value to settle.
  const volumeSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingVolumeRef = useRef<number | null>(null)
  const setVolume = useCallback((v: number) => {
    volumeRef.current = v
    if (v > 0) lastNonZeroVolumeRef.current = v
    setVolumeState(v)
    void setProperty('volume', v).catch(() => {})
    pendingVolumeRef.current = v
    if (volumeSaveTimerRef.current) clearTimeout(volumeSaveTimerRef.current)
    volumeSaveTimerRef.current = setTimeout(() => {
      volumeSaveTimerRef.current = null
      pendingVolumeRef.current = null
      void updateSettings({ volume: v })
    }, 600)
  }, [])

  // Mute toggle for the 'm' shortcut: 0 <-> the last non-zero volume.
  // Returns the resulting volume so the caller can show it in the OSD.
  const toggleMute = useCallback((): number => {
    const next = volumeRef.current === 0 ? lastNonZeroVolumeRef.current : 0
    setVolume(next)
    return next
  }, [setVolume])

  // Flips the keep-speed preference. Enabling it mid-session captures the
  // CURRENT speed as the one to keep (a file playing at ×1.5 stays at ×1.5
  // for the next one); disabling restores mpv's full per-file reset list.
  const toggleKeepSpeed = useCallback(() => {
    const next = !keepSpeedRef.current
    keepSpeedRef.current = next
    setKeepSpeedState(next)
    if (next) lastSpeedRef.current = speedRef.current
    void setProperty(
      'reset-on-next-file',
      next ? 'audio-delay,sub-delay' : 'speed,audio-delay,sub-delay',
    ).catch(() => {})
    void updateSettings({ keepPlaybackSpeed: next }).catch(() => {})
  }, [])

  return {
    ready,
    error,
    filename,
    paused,
    // Optimistic mirror (togglePause flips it immediately; the React state
    // only follows the mpv observer). Callers needing the CURRENT pause
    // state at interaction time (the App pause flash) read this instead of
    // the possibly-stale state value.
    pausedRef,
    timePos,
    duration,
    volume,
    loadFile,
    loadInFlightRef,
    seekingRef,
    readyRef,
    whenReady,
    setTimePos,
    togglePause,
    setVolume,
    adjustAudioDelay,
    audioDelay,
    adjustSubDelay,
    subDelay,
    adjustSpeed,
    speed,
    keepPlaybackSpeed: keepSpeed,
    toggleKeepSpeed,
    toggleMute,
    stopPlayback,
    takeScreenshot,
    retryInit,
    clearError,
  }
}
