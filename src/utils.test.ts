import { describe, expect, it } from 'vitest'
import { basename, formatTime, pickSupportedFile, splitPath, swapExtension, VIDEO_EXTENSIONS } from './utils'

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

  it('clamps negative values to 0:00 instead of rendering "-1:-10"', () => {
    // Reachable via the seek OSD (timePos + delta can go below 0) or a
    // transient negative mpv time-pos.
    expect(formatTime(-10)).toBe('0:00')
    expect(formatTime(-65)).toBe('0:00')
  })
})

describe('swapExtension', () => {
  it('swaps the extension of a plain file name', () => {
    expect(swapExtension('C:/videos/movie.mkv', 'srt')).toBe('C:/videos/movie.srt')
    expect(swapExtension('movie', 'srt')).toBe('movie.srt')
  })

  it('ignores dots in directory components', () => {
    // Regression: lastIndexOf('.') over the WHOLE path truncated directories
    // containing a dot, so subtitle sidecar discovery silently failed for
    // any video inside e.g. "C:/Mes.Vidéos/".
    expect(swapExtension('C:/Mes.Vidéos/film.mkv', 'srt')).toBe('C:/Mes.Vidéos/film.srt')
    expect(swapExtension('C:\\dossier.avec.dots\\movie', 'srt')).toBe(
      'C:\\dossier.avec.dots\\movie.srt',
    )
  })

  it('keeps a file name that contains several dots intact except the last extension', () => {
    expect(swapExtension('C:/videos/mon.film.2024.mkv', 'ass')).toBe(
      'C:/videos/mon.film.2024.ass',
    )
  })
})

describe('splitPath / basename', () => {
  it('splits regular paths', () => {
    expect(splitPath('C:\\videos\\movie.mkv')).toEqual({ dir: 'C:\\videos\\', name: 'movie.mkv' })
    expect(splitPath('/home/u/movie.mkv')).toEqual({ dir: '/home/u/', name: 'movie.mkv' })
    expect(basename('C:/videos/movie.mkv')).toBe('movie.mkv')
  })

  it('handles a bare name without separator', () => {
    expect(splitPath('movie.mkv')).toEqual({ dir: '', name: 'movie.mkv' })
  })

  it('keeps a drive prefix on a drive-relative path ("C:name")', () => {
    // Regression: the old code returned { dir: '', name: 'C:movie.mkv' } for
    // this shape (its slice(3) branch was unreachable because the slash
    // index can never be 1 with path[1] === ':'), so basename() and the
    // sidecar "<bare>.<lang>.<ext>" variants were wrong for it.
    expect(splitPath('C:movie.mkv')).toEqual({ dir: 'C:', name: 'movie.mkv' })
    expect(basename('C:movie.mkv')).toBe('movie.mkv')
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
