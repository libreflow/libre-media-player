import { afterEach, describe, expect, it } from 'vitest'
import { detectSystemLocale, getLocale, LOCALES, LOCALE_LABELS, setLocale, t } from './i18n'

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
    for (const locale of LOCALES.filter((l) => l !== 'auto')) {
      setLocale(locale)
      expect(t('screenshotTaken', { path: 'x' })).not.toContain('undefined')
      expect(t('queueTitle', { count: 2 })).toContain('2')
    }
  })
})


describe('detectSystemLocale', () => {
  const originalLanguages: readonly string[] = [...navigator.languages]
  const originalLanguage = navigator.language

  function setNavigatorLanguages(languages: readonly string[] | undefined, language = 'fr') {
    Object.defineProperty(navigator, 'languages', { value: languages, configurable: true })
    Object.defineProperty(navigator, 'language', { value: language, configurable: true })
  }

  afterEach(() => setNavigatorLanguages(originalLanguages, originalLanguage))

  it('suit la première langue système supportée', () => {
    setNavigatorLanguages(['de-DE', 'en-GB', 'fr'])
    expect(detectSystemLocale()).toBe('en')
  })

  it('matche le sous-tag principal (fr-CA -> fr)', () => {
    setNavigatorLanguages(['fr-CA'])
    expect(detectSystemLocale()).toBe('fr')
    setNavigatorLanguages(['en-US', 'fr-FR'])
    expect(detectSystemLocale()).toBe('en')
  })

  it('retombe sur fr si aucune langue système n’est supportée', () => {
    setNavigatorLanguages(['de-DE', 'ja-JP'])
    expect(detectSystemLocale()).toBe('fr')
  })

  it('retombe sur fr si la liste est vide', () => {
    setNavigatorLanguages([])
    expect(detectSystemLocale()).toBe('fr')
  })
})

describe('LOCALE_LABELS', () => {
  it('couvre chaque entrée du sélecteur, auto inclus', () => {
    for (const l of LOCALES) {
      expect(LOCALE_LABELS[l]).toBeTruthy()
    }
  })
})
