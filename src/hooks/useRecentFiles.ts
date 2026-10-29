import { useCallback, useEffect, useRef, useState } from 'react'
import { addRecentFile, clearRecentFiles, pruneRecentFiles, type RecentEntry } from '../recent'
import { basename } from '../utils'
import { userFacingMessage } from '../errors'

// Home screen's recently-opened list. Loaded and pruned (dead paths
// dropped) once on mount; entries are added by the app whenever a file
// actually starts loading. All persistence is best-effort -- a failure to
// read or write recent.json must never surface as an error banner.
export function useRecentFiles(opts: {
  loadFile: (path: string) => Promise<void>
  onError: (msg: string) => void
}) {
  const [recents, setRecents] = useState<RecentEntry[]>([])

  // Keep the latest callbacks reachable without re-running the mount
  // effect (same optsRef pattern as useFileAssociation).
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  // Load + prune once on mount. A file deleted since last run disappears
  // from the list right away instead of failing on click.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await pruneRecentFiles()
      if (!cancelled) setRecents(list)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Records that a file was opened -- call AFTER a successful load so the
  // list only contains files that actually played. Fire-and-forget: the
  // UI updates from the returned list, but a persistence failure is
  // silently ignored.
  const recordOpened = useCallback((path: string) => {
    void addRecentFile(path, basename(path))
      .then((list) => {
        if (list.length > 0) setRecents(list)
      })
      .catch(() => {})
  }, [])

  const openRecent = useCallback((path: string) => {
    void optsRef.current.loadFile(path).catch((e) => {
      optsRef.current.onError(userFacingMessage("Impossible d'ouvrir ce fichier.", e).message)
    })
  }, [])

  const clear = useCallback(() => {
    void clearRecentFiles()
    setRecents([])
  }, [])

  return { recents, recordOpened, openRecent, clear }
}
