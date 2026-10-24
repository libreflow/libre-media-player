import { describe, expect, it } from 'vitest'
import { formatTime, pickSupportedFile, splitPath, VIDEO_EXTENSIONS } from './utils'

describe('formatTime', () => {
  it('renders a placeholder for null/NaN', () => {
    expect(formatTime(null)).toBe('--:--')
    expect(formatTime(Number.NaN)).toBe('--:--')
  })

  it('renders minutes:seconds under one hour', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(59)).toBe('0:59')
    expect(formatTime(60)).toBe('1:00')
    expect(formatTime(754)).toBe('12:34')
  })

  it('pads minutes and seconds to two digits over one hour', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(7665)).toBe('2:07:45')
    expect(formatTime(48175)).toBe('13:22:55')
  })

  it('floors fractional seconds', () => {
    expect(formatTime(59.9)).toBe('0:59')
    expect(formatTime(754.99)).toBe('12:34')
  })
})

describe('pickSupportedFile', () => {
  it('returns the only path when a single file is dropped', () => {
    expect(pickSupportedFile(['C:/movies/film.mkv'])).toBe('C:/movies/film.mkv')
  })

  it('prefers the first video file over other files', () => {
    expect(pickSupportedFile([
      'C:/movies/poster.jpg',
      'C:/movies/film.mkv',
      'C:/movies/film.srt',
    ])).toBe('C:/movies/film.mkv')
  })

  it('matches extensions case-insensitively', () => {
    expect(pickSupportedFile(['C:/movies/film.MP4', 'C:/movies/notes.txt']))
      .toBe('C:/movies/film.MP4')
  })

  it('falls back to the first path when nothing matches', () => {
    // Unknown extension: mpv may still play it, don't reject the drop.
    expect(pickSupportedFile(['C:/movies/film.srt', 'C:/movies/film.ass']))
      .toBe('C:/movies/film.srt')
  })

  it('returns null for an empty drop', () => {
    expect(pickSupportedFile([])).toBeNull()
  })

  it('knows the supported extensions list', () => {
    expect(VIDEO_EXTENSIONS).toContain('mkv')
    expect(VIDEO_EXTENSIONS).toContain('webm')
  })
})

// Regression test (audit #4): a bare drive-prefixed Windows path
// ("C:movie.mkv", resolved by Windows against the drive's current
// directory) used to keep the "C:" inside the basename.
describe('splitPath bare drive prefix (audit #4)', () => {
  it('splits "C:movie.mkv" into dir "C:" and name "movie.mkv"', () => {
    expect(splitPath('C:movie.mkv')).toEqual({ dir: 'C:', name: 'movie.mkv' })
  })
  it('still splits fully-qualified paths correctly', () => {
    expect(splitPath('C:/movies/movie.mkv')).toEqual({ dir: 'C:/movies/', name: 'movie.mkv' })
    expect(splitPath('C:\\movies\\movie.mkv')).toEqual({ dir: 'C:\\movies\\', name: 'movie.mkv' })
  })
})
