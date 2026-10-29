import { describe, expect, it } from 'vitest'
import { describeEndFileError, describeLoadError } from './mpvErrors'

describe('describeLoadError', () => {
  it('traduit un fichier introuvable', () => {
    expect(describeLoadError(new Error('/v/movie.mkv: not found'))).toBe(
      'Fichier introuvable ou inaccessible.',
    )
  })

  it('traduit une erreur de permissions', () => {
    expect(describeLoadError('Permission denied')).toBe(
      "Accès au fichier refusé — vérifiez les permissions de lecture.",
    )
  })

  it('traduit un format non reconnu', () => {
    expect(describeLoadError('Failed to open movie.mkv')).toBe(
      "Format non reconnu ou fichier corrompu — impossible d'ouvrir ce fichier.",
    )
  })

  it('traduit un échec de commande mpv', () => {
    expect(describeLoadError('error running command')).toBe(
      'Le lecteur vidéo n’a pas pu démarrer la lecture de ce fichier.',
    )
  })

  it('retombe sur un message générique incluant l’erreur brute', () => {
    expect(describeLoadError('weird failure')).toBe(
      'Impossible de lire ce fichier : weird failure',
    )
  })

  it('gère un objet non-Error', () => {
    expect(describeLoadError(42)).toBe('Impossible de lire ce fichier : 42')
  })
})

describe('describeEndFileError', () => {
  it('explique une fin de lecture sur erreur', () => {
    expect(describeEndFileError()).toContain('corrompu')
  })
})
