import { useCallback, useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { loadSettings, updateSettings } from '../settings'
import { setLocale, t, type Locale } from '../i18n'

// App-level preferences shared by the updater and language hooks (roadmap
// #63/#64): loads the persisted locale once on mount so the UI renders in
// the user's language from the first paint.
export function useLocale() {
  // The locale lives in React state (mirroring i18n's module-level value):
  // setLocale() alone mutates a module variable and triggers no re-render,
  // so the UI used to stay in the old language until some unrelated state
  // change happened to re-render the tree.
  const [locale, setLocaleState] = useState<Locale>('fr')

  useEffect(() => {
    let cancelled = false
    void loadSettings()
      .then((settings) => {
        if (!cancelled) {
          setLocale(settings.locale)
          setLocaleState(settings.locale)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const switchLocale = useCallback((next: Locale) => {
    setLocale(next)
    setLocaleState(next)
    void updateSettings({ locale: next }).catch(() => {})
  }, [])

  return { locale, switchLocale }
}

// Checks for a newer GitHub release once per app session (roadmap #63) and
// exposes a silent download+install action. The check is best-effort: on
// dev builds, unsigned releases or offline machines it resolves to
// "no update" without any error banner noise.
export function useUpdateCheck(onNotice: (msg: string) => void, onError: (msg: string) => void) {
  const [update, setUpdate] = useState<Update | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let cancelled = false
    void check()
      .then((result) => {
        if (!cancelled && result != null) setUpdate(result)
      })
      .catch(() => {
        // Offline / no endpoint configured: stay silent.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const install = useCallback(async () => {
    if (update == null || installing) return
    setInstalling(true)
    try {
      await update.downloadAndInstall()
      onNotice(t('updateReady'))
    } catch (e) {
      onError(t('updateCheckFailed', { err: String(e) }))
    } finally {
      setInstalling(false)
    }
  }, [update, installing, onNotice, onError])

  return { update, installing, install }
}
