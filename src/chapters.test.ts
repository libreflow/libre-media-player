import { describe, expect, it } from 'vitest'
import { chapterAt, parseChapters } from './chapters'

describe('parseChapters', () => {
  it('construit des chapitres avec titres', () => {
    const chapters = parseChapters([
      { time: 0, title: 'Intro' },
      { time: 120.5, title: 'Acte I' },
    ])
    expect(chapters).toEqual([
      { title: 'Intro', time: 0 },
      { title: 'Acte I', time: 120.5 },
    ])
  })

  it('titre par défaut quand le champ est absent', () => {
    expect(parseChapters([{ time: 10 }])).toEqual([{ title: 'Chapitre 1', time: 10 }])
    expect(parseChapters([{ time: 10, title: '' }])).toEqual([{ title: 'Chapitre 1', time: 10 }])
  })

  it('ignore les entrées sans temps valide', () => {
    expect(parseChapters([{ time: undefined }, { time: 5 }, { time: Number.NaN }])).toEqual([
      { title: 'Chapitre 1', time: 5 },
    ])
  })
})

describe('chapterAt', () => {
  const chapters = parseChapters([
    { time: 0, title: 'A' },
    { time: 100, title: 'B' },
    { time: 200, title: 'C' },
  ])

  it('trouve le chapitre courant', () => {
    expect(chapterAt(chapters, 150)?.title).toBe('B')
    expect(chapterAt(chapters, 200)?.title).toBe('C')
    expect(chapterAt(chapters, 0)?.title).toBe('A')
  })

  it('retourne null sans position ni chapitres', () => {
    expect(chapterAt(chapters, null)).toBeNull()
    expect(chapterAt([], 10)).toBeNull()
  })
})
