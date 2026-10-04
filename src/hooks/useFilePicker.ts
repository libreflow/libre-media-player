import { useEffect, useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { hasVideoExtension, pickSupportedFile, VIDEO_EXTENSIONS } from '../utils'

// File picking via the native dialog + acceptance of files dropped onto the
// window (native OS drag-drop, not the HTML5 DnD API — mpv's video surface
// sits behind the webview and would otherwise swallow the drop before any
// HTML listener sees it).
export function useFilePicker(opts: {
  readyRef: React.MutableRefObject<boolean>
  loadFile: (path: string) => Promise<void>
  onFilesDropped?: (paths: string[]) => void
  onFilePicked?: (path: string) => void
  onError: (msg: string) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  const openFile = async () => {
    try {
      const paths = await openFileDialog({
        title: 'Ouvrir une vidéo',
        multiple: true,
        filters: [{ name: 'Vidéo', extensions: VIDEO_EXTENSIONS }],
      })
      if (!paths) return
      // Route through the queue like drag-drop does, so picked file(s)
      // get prev/next navigation too instead of playing "outside".
      if (Array.isArray(paths)) {
        if (opts.onFilesDropped) {
          opts.onFilesDropped(paths)
        } else if (paths[0]) {
          await opts.loadFile(paths[0])
        }
      } else if (opts.onFilePicked) {
        opts.onFilePicked(paths)
      } else {
        await opts.loadFile(paths)
      }
    } catch (e) {
      opts.onError(`Impossible d'ouvrir le sélecteur de fichier : ${String(e)}`)
    }
  }

  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'enter') setIsDragOver(true)
        if (event.payload.type === 'leave') setIsDragOver(false)
        if (event.payload.type === 'drop') {
          setIsDragOver(false)
          const paths = event.payload.paths
          // Keep only actual video files: a subtitle or artwork file
          // dropped alongside the movie must not enter the playback queue.
          const videos = paths.filter(hasVideoExtension)
          if (videos.length === 0) return
          if (opts.onFilesDropped) {
            opts.onFilesDropped(videos)
          } else {
            const path = pickSupportedFile(paths)
            if (path && opts.readyRef.current) void opts.loadFile(path)
          }
        }
      })
    })()
    return () => unlisten?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: loadFile is referentially stable (usePlayer's useCallback now depends on useResumePosition's memoized return object)
  }, [opts.loadFile])

  return { isDragOver, openFile }
}
