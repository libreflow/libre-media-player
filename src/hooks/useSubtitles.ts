import { useCallback, useEffect, useRef, useState } from 'react'
import {
  audioTracks,
  countSubtitleTracks,
  findSidecarSubtitle,
  isSubtitleVisible,
  loadSubtitle,
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
  // The video path whose sidecar is currently loaded, so we don't re-add
  // the same sub track when the user merely toggles visibility.
  const loadedForRef = useRef<string | null>(null)

  // Refresh the track lists (sub + audio) for the currently loaded file.
  const refreshTracks = useCallback(async () => {
    try {
      setSubTracks(await subtitleTracks())
      setAudio(await audioTracks())
    } catch {
      // Track listing is best-effort (e.g. no file loaded yet).
    }
  }, [])

  const onFileLoaded = useCallback(async (videoPath: string) => {
    try {
      const sidecar = await findSidecarSubtitle(videoPath)
      if (loadedForRef.current !== videoPath) {
        loadedForRef.current = videoPath
        if (sidecar) {
          setAvailable(true)
          await loadSubtitle(sidecar)
          await setSubtitleVisible(true)
          setVisible(true)
        } else {
          // No sidecar, but the container may embed sub tracks (MKV, MP4...).
          // Count only tracks of type 'sub' -- track-list/count would report
          // the total track count (video + audio + subs), which is always
          // non-zero for any playable file.
          const subCount = await countSubtitleTracks()
          setAvailable(subCount > 0)
          setVisible(subCount > 0 ? await isSubtitleVisible() : false)
        }
      }
      await refreshTracks()
    } catch {
      // Subtitle discovery is best-effort; never block playback on it.
      setAvailable(false)
      setVisible(false)
      loadedForRef.current = videoPath
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
      const next = !(await isSubtitleVisible())
      await setSubtitleVisible(next)
      setVisible(next)
      setAvailable(true)
    } catch (e) {
      // Unlike the "no sub track" case above (a normal, silent no-op), a
      // thrown error here means the mpv call itself failed (e.g. called too
      // soon after startup, before mpv finished initializing) -- surface it
      // like every other user-triggered action in the app (openFile,
      // togglePause, playlist ops) instead of letting an
      // unhandled rejection escape from `void subtitles.toggle()` in App.tsx.
      onError?.(`Sous-titres indisponibles : ${String(e)}`)
    }
  }, [onError])

  // Reset when the app starts (no file loaded yet).
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
