import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// Handles two distinct ways Libre Media Player can be told to open a file from outside
// its own UI (double-clicking a video in Explorer, "Open with" context menu):
//
// 1. Cold start: the OS launched a brand-new Libre Media Player process with the file's
//    path as a command-line argument. Rust stashes that path and the
//    frontend pulls it ONCE via `get_initial_file` as soon as the player is
//    ready -- a push (emit) on startup would race the frontend's listener
//    not being attached yet (the webview is still loading while Rust's
//    setup() already ran), so this direction is deliberately pull-based.
// 2. Libre Media Player is already running: tauri-plugin-single-instance intercepts the
//    second launch attempt entirely (no new process/window is created) and
//    Rust emits an `open-file` event with the new path instead. By
//    definition the frontend has been running for a while, so there's no
//    listener-attachment race here -- push (emit) is fine.
export function useFileAssociation(opts: {
  readyRef: React.MutableRefObject<boolean>
  loadFile: (path: string) => Promise<void>
  onError: (msg: string) => void
}) {
  // Mirrors opts into a ref so the effect below can stay [] (run once) --
  // loadFile/onError are stable (useCallback with [] deps) in every caller
  // today, but readyRef.current changes without a re-render, which is
  // exactly why this hook has to poll it (see below) rather than depend on
  // it directly.
  const optsRef = useRef(opts)
  // Keep the ref in sync inside an effect (not during render) so the
  // once-on-mount effect below still reads fresh opts.
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    let cancelled = false
    let unlisten: (() => void) | undefined

    const openWhenReady = async (path: string) => {
      // The player's mpv init (see usePlayer) is itself async and may still
      // be in flight when either the initial-file pull or an open-file event
      // arrives (the OS can launch us and single-instance can forward an
      // event before mpv has finished initializing). Poll readyRef rather
      // than failing outright -- loadFile would silently no-op/throw against
      // a not-yet-initialized player otherwise.
      const deadline = Date.now() + 10_000
      while (!optsRef.current.readyRef.current && Date.now() < deadline) {
        if (cancelled) return
        await new Promise((r) => setTimeout(r, 100))
      }
      if (cancelled) return
      await optsRef.current.loadFile(path)
    }

    ;(async () => {
      try {
        const initialPath = await invoke<string | null>('get_initial_file')
        if (!cancelled && initialPath) await openWhenReady(initialPath)
      } catch (e) {
        if (!cancelled) optsRef.current.onError(`Impossible d'ouvrir le fichier initial : ${String(e)}`)
      }

      if (cancelled) return
      unlisten = await listen<string>('open-file', (event) => {
        void openWhenReady(event.payload)
      })
    })()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])
}
