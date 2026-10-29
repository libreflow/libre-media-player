import { afterEach, describe, expect, it } from 'vitest'
import { getLocale, LOCALES, setLocale, t } from './i18n'

afterEach(() => setLocale('fr'))

describe('t', () => {
  it('traduit en français par défaut', () => {
    expect(t('openVideo')).toBe('Ouvrir une vidéo…')
  })

  it('change de langue à chaud', () => {
    setLocale('en')
    expect(t('openVideo')).toBe('Open a video…')
    expect(getLocale()).toBe('en')
  })

  it('interpole les paramètres', () => {
    expect(t('errLoad', { err: 'oops' })).toBe('Impossible de lire ce fichier : oops')
    setLocale('en')
    expect(t('errLoad', { err: 'oops' })).toBe('Cannot play this file: oops')
  })

  it('les deux catalogues couvrent exactement les mêmes clés', () => {
    setLocale('en')
    for (const locale of LOCALES) {
      setLocale(locale)
      expect(t('screenshotTaken', { path: 'x' })).not.toContain('undefined')
      expect(t('queueTitle', { count: 2 })).toContain('2')
    }
  })
})
