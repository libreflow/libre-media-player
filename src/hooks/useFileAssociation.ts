import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { userFacingMessage } from '../errors'
import { t } from '../i18n'

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
  whenReady: () => Promise<void>
  loadFile: (path: string) => Promise<void>
  onError: (msg: string) => void
}) {
  // Mirrors opts into a ref so the effect below can stay [] (run once) --
  // loadFile/onError are stable (useCallback with [] deps) in every caller
  // today, but whenReady() returns a fresh promise per init cycle, which is
  // exactly why the readiness wait below goes through optsRef rather than
  // a captured closure.
  const optsRef = useRef(opts)
  // Keep the ref in sync inside an effect (not during render) so the
  // once-on-mount effect below still reads fresh opts.
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    // Cancellation is a PER-MOUNT token (not an instance ref): StrictMode's
    // simulated unmount/remount would rearm a shared ref, letting the first
    // mount's in-flight work continue after its cleanup -- a double
    // loadFile for the initial file and a second open-file subscription
    // racing the first. A local token can only be rearmed by its own
    // effect run.
    const token = { cancelled: false }

    const openWhenReady = async (path: string) => {
      // The player's mpv init (see usePlayer) is itself async and may still
      // be in flight when either the initial-file pull or an open-file event
      // arrives (the OS can launch us and single-instance can forward an
      // event before mpv has finished initializing). Await the player's
      // own readiness promise instead of polling a ref; the timeout guard
      // keeps a failed/hung init (the promise never resolves) from pinning
      // the file open forever.
      try {
        await Promise.race([
          optsRef.current.whenReady(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
        ])
      } catch {
        if (token.cancelled) return
        optsRef.current.onError(t('errInitSlow'))
        return
      }
      if (token.cancelled) return
      await optsRef.current.loadFile(path)
    }

    // Subscribe to open-file BEFORE pulling the initial file: a second
    // launch's forwarded path can arrive while the cold-start pull (and
    // the mpv readiness wait behind it) is still pending, and an emit
    // against a not-yet-attached listener is silently lost. The Rust
    // single-instance callback also stashes the forwarded path into the
    // initial-file state, so the pull below still catches a forward that
    // raced ahead of this subscription.
    const unlistenPromise = listen<string>('open-file', (event) => {
      // openWhenReady awaits loadFile, which re-throws after surfacing
      // the error via player.error; catch here so a file forwarded by a
      // second instance that turns out unreadable doesn't leak an
      // unhandled rejection from this fire-and-forget listener.
      void openWhenReady(event.payload).catch(() => {})
    })

    ;(async () => {
      try {
        const initialPath = await invoke<string | null>('get_initial_file')
        if (!token.cancelled && initialPath) await openWhenReady(initialPath)
      } catch (e) {
        if (!token.cancelled) {
          optsRef.current.onError(userFacingMessage("Impossible d'ouvrir le fichier initial.", e).message)
        }
      }
    })()

    return () => {
      token.cancelled = true
      void unlistenPromise.then((unlisten) => unlisten(), () => {})
    }
  }, [])
}
