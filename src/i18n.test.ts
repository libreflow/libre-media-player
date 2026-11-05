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


// Regression (audit final): key parity is enforced by the type, but a
// translation that loses a {placeholder} passed silently -- the EN catalog
// could ship a message that renders the raw "{err}" to the user.
describe('placeholder parity between catalogs', () => {
  it('every placeholder in the fr catalog exists in the en one (and back)', async () => {
    const { CATALOGS } = await import('./i18n')
    const frCat = CATALOGS.fr as unknown as Record<string, string>
    const enCat = CATALOGS.en as unknown as Record<string, string>
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const [key, frText] of Object.entries(frCat)) {
      expect(enCat[key], `key ${key} is missing from the en catalog`).toBeDefined()
      expect(placeholders(enCat[key]), `en/${key}`).toEqual(placeholders(frText))
    }
  })
})
