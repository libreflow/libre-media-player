import { useCallback, useEffect, useState } from 'react'
import { setProperty } from 'tauri-plugin-libmpv-api'
import { loadSettings, updateSettings } from '../settings'

// Smooth-motion (fluidity) toggle, backed by mpv's display-sync
// interpolation. When enabled:
//   - `video-sync=display-resample` keeps video timing locked to the
//     monitor's refresh rate (mpv adjusts the audio clock slightly).
//   - `interpolation` blends consecutive frames so pans remain smooth even
//     when fps and refresh aren't integer multiples (24fps on 60Hz, ...).
// When disabled, mpv's default timing (`video-sync=audio`) is restored.
//
// This is exactly the kind of motion handling VLC and Windows Media Player
// lack; exposing it as one toggle keeps the UI honest about the trade-off:
// interpolation changes the "film feel" (24fps cadence) into a smoother,
// more video-like motion.
export function useMotionInterpolation(ready: boolean) {
  const [enabled, setEnabled] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Apply the current preference to mpv once the player is ready.
  useEffect(() => {
    if (!ready) return
    let cancelled = false
    ;(async () => {
      const settings = await loadSettings()
      if (cancelled) return
      setEnabled(settings.motionInterpolation)
      setLoaded(true)
      await applyToMpv(settings.motionInterpolation).catch(() => {
        // Player not ready yet or the property was rejected -- leave the
        // stored preference alone; toggle() re-applies it on next use.
      })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: apply once per ready transition
  }, [ready])

  const applyToMpv = async (on: boolean) => {
    if (on) {
      await setProperty('video-sync', 'display-resample')
      await setProperty('interpolation', 'yes')
    } else {
      await setProperty('video-sync', 'audio')
      await setProperty('interpolation', 'no')
    }
  }

  const toggle = useCallback(async () => {
    const next = !enabled
    setEnabled(next)
    await updateSettings({ motionInterpolation: next })
    try {
      await applyToMpv(next)
    } catch {
      // mpv property sets shouldn't fail post-init, but if they do, revert
      // the UI state so the toggle doesn't lie.
      setEnabled(!next)
    }
  }, [enabled])

  return { enabled, loaded, toggle }
}
