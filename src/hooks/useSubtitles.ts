import { useCallback, useEffect, useRef, useState } from 'react'
import {
  audioTracks,
  countSubtitleTracks,
  findSidecarSubtitle,
  isSubtitleActive,
  loadSubtitle,
  selectedSubtitleTrackId,
  setAudioTrack,
  setSubtitleTrack,
  setSubtitleVisible,
  subtitleTracks,
  type MpvTrack,
} from '../subtitles'

// Auto-loads a sidecar subtitle file (same name as the video, or with a
// common language tag) when a file is opened, and exposes a visible/hidden
// toggle. If no sidecar exists, the toggle is a no-op (embedded tracks are
// left to mpv's own defaults).
export function useSubtitles(onError?: (msg: string) => void) {
  const [available, setAvailable] = useState(false)
  const [visible, setVisible] = useState(false)
  const [subTracks, setSubTracks] = useState<MpvTrack[]>([])
  const [audio, setAudio] = useState<MpvTrack[]>([])
  // The (load generation, video path) pair for which the sidecar is
  // currently loaded, so we don't re-add the same sub track when the user
  // merely toggles visibility or re-triggers onFileLoaded within one
  // load. The generation comes from usePlayer's loadSeqRef and increments
  // on every successful loadfile AND on stop: mpv discards tracks added
  // via sub-add on each loadfile, so the same path reloaded (repeat loop,
  // stop then reopen from recents) must re-run the sidecar load -- a bare
  // path guard used to skip it and silently lose subtitles.
  const loadedForRef = useRef<{ generation: number; path: string } | null>(null)
  // Monotonic sequence number for onFileLoaded calls. onFileLoaded is
  // async and fire-and-forget from usePlayer, so two rapid file switches
  // (next/prev spam, multi-drop) can interleave: file A's sidecar
  // discovery can resolve AFTER file B's, and without a sequence guard
  // A's late result would overwrite B's subtitle state (wrong sidecar
  // loaded into mpv, wrong visible/available flags). Each call captures
  // its sequence; any await point that finds a newer sequence has been
  // superseded and bails without touching state.
  const loadSeqRef = useRef(0)

  // Refresh the track lists (sub + audio) for the currently loaded file.
  // `isStale` lets onFileLoaded pass its sequence guard so a refresh that
  // outlives a newer file load never overwrites the newer file's track
  // lists (each getTracks call is several sequential mpv IPC round-trips,
  // so a newer onFileLoaded can easily start while this one is pending).
  const refreshTracks = useCallback(
    async (isStale?: () => boolean) => {
      try {
        const subs = await subtitleTracks()
        if (isStale?.()) return
        const audio = await audioTracks()
        if (isStale?.()) return
        setSubTracks(subs)
        setAudio(audio)
      } catch {
        // Track listing is best-effort (e.g. no file loaded yet).
      }
    },
    [],
  )

  const onFileLoaded = useCallback(async (videoPath: string, loadGeneration?: number) => {
    const seq = ++loadSeqRef.current
    // True when a newer onFileLoaded call has started, meaning this one's
    // results are stale and must not touch state or mpv.
    const superseded = () => seq !== loadSeqRef.current
    try {
      const sidecar = await findSidecarSubtitle(videoPath)
      if (superseded()) return
      const alreadyLoadedForThisLoad =
        loadedForRef.current != null &&
        loadedForRef.current.path === videoPath &&
        loadGeneration != null &&
        loadedForRef.current.generation === loadGeneration
      if (!alreadyLoadedForThisLoad) {
        loadedForRef.current =
          loadGeneration != null ? { generation: loadGeneration, path: videoPath } : null
        if (sidecar) {
          setAvailable(true)
          await loadSubtitle(sidecar)
          if (superseded()) return
          await setSubtitleVisible(true)
          if (superseded()) return
          setVisible(true)
        } else {
          // No sidecar, but the container may embed sub tracks (MKV, MP4...).
          // Count only tracks of type 'sub' -- track-list/count would report
          // the total track count (video + audio + subs), which is always
          // non-zero for any playable file.
          const subCount = await countSubtitleTracks()
          if (superseded()) return
          setAvailable(subCount > 0)
          // isSubtitleActive (sid != no AND sub-visibility) rather than
          // sub-visibility alone: mpv keeps sub-visibility=yes with sid=no,
          // which left the button lit after "Désactivés" + reopen.
          setVisible(subCount > 0 ? await isSubtitleActive() : false)
          if (superseded()) return
        }
      }
      await refreshTracks(superseded)
    } catch {
      if (superseded()) return
      // Subtitle discovery is best-effort; never block playback on it.
      setAvailable(false)
      setVisible(false)
      loadedForRef.current =
        loadGeneration != null ? { generation: loadGeneration, path: videoPath } : null
    }
  }, [refreshTracks])

  const toggle = useCallback(async () => {
    try {
      // setProperty('sub-visibility') never rejects (it's a plain mpv flag),
      // so the old try/catch never caught the "no sub track" case and the
      // button always ended up marked active. Check the real track count
      // instead and no-op when there is nothing to toggle.
      if ((await countSubtitleTracks()) === 0) return
      // Prefer mpv's real state: if an embedded track is active, toggling
      // visibility applies to it too, not just our sidecar.
      // Base "next" on isSubtitleActive, not sub-visibility alone: mpv
      // keeps sub-visibility=yes even with sid=no ("Désactivés" in the
      // track menu), which made the button toggle on a hidden state and
      // stay lit (violet) with no subtitles on screen.
      const next = !(await isSubtitleActive())
      await setSubtitleVisible(next)
      if (next && (await selectedSubtitleTrackId()) === 'no') {
        // No track selected: visibility alone shows nothing -- re-select
        // the first available sub track so turning subtitles back on
        // actually displays something.
        const tracks = await subtitleTracks()
        if (tracks.length > 0) await setSubtitleTrack(tracks[0].id)
      }
      setVisible(next)
      setAvailable(true)
      void refreshTracks()
    } catch (e) {
      // Unlike the "no sub track" case above (a normal, silent no-op), a
      // thrown error here means the mpv call itself failed (e.g. called too
      // soon after startup, before mpv finished initializing) -- surface it
      // like every other user-triggered action in the app (openFile,
      // togglePause, playlist ops) instead of letting an
      // unhandled rejection escape from `void subtitles.toggle()` in App.tsx.
      onError?.(`Sous-titres indisponibles : ${String(e)}`)
    }
  }, [onError, refreshTracks])

  // Forget the sidecar-loaded marker on unmount: a StrictMode
  // remount (or a runtime reload) must not carry a stale (generation,
  // path) pair into the next mount, where it could wrongly suppress a
  // legitimate sidecar re-add for that same path.
  useEffect(() => () => {
    loadedForRef.current = null
  }, [])

  const selectSubtrack = useCallback(async (id: number) => {
    try {
      await setSubtitleTrack(id)
      setVisible(true)
      setAvailable(true)
      void refreshTracks()
    } catch (e) {
      // Same reasoning as toggle() above: a user-triggered action must
      // surface its failure via onError, not escape as an unhandled
      // rejection from `void subtitles.selectSubtrack(id)` in App.tsx.
      onError?.(`Sélection du sous-titre impossible : ${String(e)}`)
    }
  }, [refreshTracks, onError])

  const disableSubtitles = useCallback(async () => {
    try {
      await setSubtitleTrack('no')
      setVisible(false)
      void refreshTracks()
    } catch (e) {
      onError?.(`Désactivation des sous-titres impossible : ${String(e)}`)
    }
  }, [refreshTracks, onError])

  const selectAudioTrack = useCallback(async (id: number) => {
    try {
      await setAudioTrack(id)
      void refreshTracks()
    } catch (e) {
      onError?.(`Sélection de la piste audio impossible : ${String(e)}`)
    }
  }, [refreshTracks, onError])

  return {
    available,
    visible,
    subTracks,
    audioTracks: audio,
    onFileLoaded,
    toggle,
    selectSubtrack,
    disableSubtitles,
    selectAudioTrack,
  }
}
