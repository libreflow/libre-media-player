// mpv chapter metadata helpers (roadmap #61). Chapters are read one scalar
// property at a time, mirroring src/subtitles.ts's track-list strategy: a
// single getProperty('chapter-list', 'node') goes through the native
// wrapper's node-decoding path that is known to crash on some setups.

export interface Chapter {
  title: string
  time: number
}

// Parses raw per-chapter field records (read via scalar getProperty calls
// on 'chapter-list/<i>/time' and 'chapter-list/<i>/title') into Chapter
// objects. Entries without a numeric time are skipped (mpv reports 0 for
// the 'no chapters' case and this function must never produce them).
// Exposed for unit testing.
export function parseChapters(raw: { time: unknown; title?: unknown }[]): Chapter[] {
  const chapters: Chapter[] = []
  for (const entry of raw) {
    const time = Number(entry.time)
    if (!Number.isFinite(time)) continue
    chapters.push({
      title: typeof entry.title === 'string' && entry.title.length > 0
        ? entry.title
        : `Chapitre ${chapters.length + 1}`,
      time,
    })
  }
  return chapters
}

// Reads mpv's chapter list for the loaded file via scalar properties.
// Returns null when the file has no chapters or the count can't be read
// (the caller treats both as "nothing to draw on the seek bar").
export async function readChapters(
  getProperty: (name: string, format: 'double' | 'string') => Promise<unknown>,
): Promise<Chapter[] | null> {
  const count = await getProperty('chapter-list/count', 'double')
  if (typeof count !== 'number' || count <= 0) return null
  const raw: { time: unknown; title?: unknown }[] = []
  for (let i = 0; i < count; i++) {
    const time = await getProperty(`chapter-list/${i}/time`, 'double')
    let title: unknown
    try {
      title = await getProperty(`chapter-list/${i}/title`, 'string')
    } catch {
      title = undefined
    }
    raw.push({ time, title })
  }
  return parseChapters(raw)
}

// The chapter active at the given position (the last one whose start time
// is <= t), or null before the first chapter.
export function chapterAt(chapters: Chapter[], t: number | null): Chapter | null {
  if (t == null || chapters.length === 0) return null
  let current: Chapter | null = null
  for (const c of chapters) {
    if (c.time <= t) current = c
    else break
  }
  return current
}
