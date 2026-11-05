import { afterEach, describe, expect, it } from 'vitest'
import { setLocale, t } from './i18n'
import { describeEndFileError, describeLoadError } from './mpvErrors'

afterEach(() => setLocale('fr'))

// The messages now live in i18n (previously hardcoded French replicas that
// had already drifted from the catalog's typographic apostrophes); asserting
// against t() keeps the mapping and the catalog in lock-step by
// construction, and the EN assertions below prove the localization works.
describe('describeLoadError', () => {
  it('traduit un fichier introuvable', () => {
    expect(describeLoadError(new Error('/v/movie.mkv: not found'))).toBe(t('errFileNotFound'))
  })

  it('traduit une erreur de permissions', () => {
    expect(describeLoadError('Permission denied')).toBe(t('errPermission'))
  })

  it('traduit un format non reconnu', () => {
    expect(describeLoadError('Failed to open movie.mkv')).toBe(t('errFormat'))
  })

  it('traduit un échec de commande mpv', () => {
    expect(describeLoadError('error running command')).toBe(t('errCommand'))
  })

  it('retombe sur un message générique incluant l’erreur brute', () => {
    expect(describeLoadError('weird failure')).toBe(t('errLoad', { err: 'weird failure' }))
  })

  it('gère un objet non-Error', () => {
    expect(describeLoadError(42)).toBe(t('errLoad', { err: '42' }))
  })

  it('localise les messages en locale EN', () => {
    setLocale('en')
    expect(describeLoadError('Failed to open movie.mkv')).toBe(t('errFormat'))
    expect(t('errFormat')).toBe(
      'Unrecognized format or corrupt file — cannot open this file.',
    )
  })
})

describe('describeEndFileError', () => {
  it('explique une fin de lecture sur erreur', () => {
    expect(describeEndFileError()).toContain('corrompu')
  })
})
