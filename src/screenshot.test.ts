import { describe, expect, it } from 'vitest'
import { screenshotArgs, screenshotPath } from './screenshot'

describe('screenshotPath', () => {
  it('crée un chemin PNG à côté de la vidéo', () => {
    expect(screenshotPath('C:\\v\\movie.mkv', new Set())).toBe(
      'C:\\v\\movie.mkv.1.png',
    )
  })

  it('incrémente jusqu’à un nom libre', () => {
    const existing = new Set(['c:\\v\\movie.mkv.1.png'])
    expect(screenshotPath('C:\\v\\movie.mkv', existing)).toBe(
      'C:\\v\\movie.mkv.2.png',
    )
  })
})

describe('screenshotArgs', () => {
  it('inclut le chemin, les sous-titres et pas d’OSD mpv', () => {
    expect(screenshotArgs('/tmp/shot.png')).toEqual(['/tmp/shot.png', 'subtitles', false])
  })
})
