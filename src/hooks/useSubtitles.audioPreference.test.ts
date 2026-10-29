import { describe, expect, it } from 'vitest'
import { pickPreferredAudioTrack } from './useSubtitles'
import type { MpvTrack } from '../subtitles'

const track = (id: number, lang?: string): MpvTrack => ({
  id,
  type: 'audio',
  ...(lang != null && { lang }),
  selected: false,
})

describe('pickPreferredAudioTrack', () => {
  const tracks = [track(1, 'en'), track(2, 'fr'), track(3, 'ja')]

  it('sélectionne la piste correspondant à la langue préférée', () => {
    expect(pickPreferredAudioTrack(tracks, 'fr')?.id).toBe(2)
  })

  it('accepte une correspondance par préfixe (fre -> fr)', () => {
    expect(pickPreferredAudioTrack(tracks, 'fra')?.id).toBe(2)
  })

  it('retourne null pour "any" (aucune préférence)', () => {
    expect(pickPreferredAudioTrack(tracks, 'any')).toBeNull()
  })

  it('retourne null quand la langue est absente du fichier', () => {
    expect(pickPreferredAudioTrack(tracks, 'de')).toBeNull()
  })
})
