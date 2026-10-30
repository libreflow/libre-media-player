import { describe, expect, it } from 'vitest'
import { screenshotArgs, screenshotPath } from './screenshot'

const nothingExists = async () => false

describe('screenshotPath', () => {
  it('crée un chemin PNG à côté de la vidéo', async () => {
    await expect(screenshotPath('C:\\v\\movie.mkv', new Set(), nothingExists)).resolves.toBe(
      'C:\\v\\movie.mkv.1.png',
    )
  })

  it('incrémente jusqu’à un nom libre (mémoire de session)', async () => {
    const existing = new Set(['c:\\v\\movie.mkv.1.png'])
    await expect(screenshotPath('C:\\v\\movie.mkv', existing, nothingExists)).resolves.toBe(
      'C:\\v\\movie.mkv.2.png',
    )
  })

  it('saute aussi les PNG laissés sur disque par une session précédente', async () => {
    // Regression: the in-memory set starts empty on every app launch, so a
    // "movie.mkv.1.png" from a previous run used to collide and mpv's
    // screenshot-to-file errored ("file exists") -- the capture failed on
    // every launch after the first.
    const onDisk = new Set(['c:\\v\\movie.mkv.1.png', 'c:\\v\\movie.mkv.2.png'])
    const fileExists = async (p: string) => onDisk.has(p.toLowerCase())
    await expect(screenshotPath('C:\\v\\movie.mkv', new Set(), fileExists)).resolves.toBe(
      'C:\\v\\movie.mkv.3.png',
    )
  })

  it('une sonde disque qui échoue est traitée comme "libre"', async () => {
    const failing = async () => {
      throw new Error('ipc down')
    }
    await expect(screenshotPath('C:\\v\\movie.mkv', new Set(), failing)).resolves.toBe(
      'C:\\v\\movie.mkv.1.png',
    )
  })
})

describe('screenshotArgs', () => {
  it('inclut le chemin, les sous-titres et pas d’OSD mpv', () => {
    expect(screenshotArgs('/tmp/shot.png')).toEqual(['/tmp/shot.png', 'subtitles', false])
  })
})
