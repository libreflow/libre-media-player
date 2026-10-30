import { useCallback, useEffect, useState } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { loadSettings, updateSettings } from '../settings'
import { setLocale, t, detectSystemLocale, type LocaleSetting } from '../i18n'

// App-level preferences shared by the updater and language hooks (roadmap
// #63/#64): loads the persisted locale once on mount so the UI renders in
// the user's language from the first paint. The setting is React state so
// the language selector always reflects the active choice (not a static
// defaultValue that would desync from the persisted setting at startup).
// 'auto' resolves to the system language (detected at startup); an
// explicit 'fr'/'en' choice from the selector is persisted and wins.
export function useLocale() {
  const [localeSetting, setLocaleSetting] = useState<LocaleSetting>('auto')

  useEffect(() => {
    let cancelled = false
    void loadSettings()
      .then((settings) => {
        if (!cancelled) {
          const resolved = settings.locale === 'auto' ? detectSystemLocale() : settings.locale
          setLocale(resolved)
          setLocaleSetting(settings.locale)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const switchLocale = useCallback((newSetting: LocaleSetting) => {
    const resolved = newSetting === 'auto' ? detectSystemLocale() : newSetting
    setLocale(resolved)
    setLocaleSetting(newSetting)
    void updateSettings({ locale: newSetting }).catch(() => {})
  }, [])

  return { localeSetting, switchLocale }
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
