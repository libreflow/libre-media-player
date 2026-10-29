import { describe, expect, it } from 'vitest'
import { userFacingMessage } from './errors'

// The error banner shows the message of the UserFacingError produced here;
// the raw technical detail (mpv/Tauri strings in English) must never leak
// into it, but stays reachable on the object for diagnostics.

describe('userFacingMessage', () => {
  it('maps mpv command rejections to a clear French message', () => {
    const err = userFacingMessage('Impossible de lire ce fichier.', 'error running command: seek')
    expect(err.message).toBe(
      'Le fichier est introuvable, illisible, ou son format n’est pas pris en charge.',
    )
    expect(err.detail).toBe('error running command: seek')
  })

  it('maps missing-file errors', () => {
    const err = userFacingMessage('Impossible de lire ce fichier.', 'no such file or directory')
    expect(err.message).toContain('introuvable')
  })

  it('maps mpv init failures to the engine message', () => {
    const err = userFacingMessage('Échec.', new Error('failed to initialize mpv context'))
    expect(err.message).toContain('mpv')
    expect(err.message).not.toContain('failed to initialize')
  })

  it('keeps the fallback for unknown errors and hides the raw detail', () => {
    const err = userFacingMessage('Une erreur est survenue.', new Error('weird unknown failure xyz'))
    expect(err.message).toBe('Une erreur est survenue.')
    expect((err.detail as Error).message).toBe('weird unknown failure xyz')
  })

  it('handles non-Error thrown values', () => {
    const err = userFacingMessage('Une erreur est survenue.', 42)
    expect(err.message).toBe('Une erreur est survenue.')
    expect(err.detail).toBe(42)
  })
})
