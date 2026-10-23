import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'

// Full mock of the mpv plugin surface App (via usePlayer/usePlaylist) and
// the Tauri APIs its hooks touch. App pulls in nearly every hook, so the
// mock set covers: libmpv (init/destroy/observeProperties/command/
// setProperty/getProperty/listenEvents), Tauri path/fs/window/event/
// webview/core APIs, and the file dialog.
let propertyListener: ((event: { name: string; data: unknown }) => void) | null = null
// NOTE: `command` is a PLAIN function, not vi.fn. The rejection tests below
// rely on the process-level 'unhandledRejection' event, and probe-verified
// that a vi.fn-wrapped rejection (including via mockImplementation) does NOT
// fire it -- vitest's mock wrapper attaches its own rejection tracking that
// swallows the event. A plain function returning a rejected promise fires
// it reliably. Tests swap the implementation by reassigning commandImpl.
let commandImpl: (...args: unknown[]) => Promise<void> = async () => {}
vi.mock('tauri-plugin-libmpv-api', () => ({
  init: vi.fn(async () => 'main'),
  destroy: vi.fn(async () => {}),
  observeProperties: vi.fn(async (_props: unknown, cb: (e: { name: string; data: unknown }) => void) => {
    propertyListener = cb
    return () => { propertyListener = null }
  }),
  command: (...args: unknown[]) => commandImpl(...args),
  setProperty: vi.fn(async () => {}),
  getProperty: vi.fn(async () => true),
  listenEvents: vi.fn(async () => () => {}),
}))
vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn(async () => '/mock-config/'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(async () => false),
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(async () => '{}'),
  writeTextFile: vi.fn(async () => {}),
  rename: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    onCloseRequested: vi.fn(async () => () => {}),
    isFullscreen: vi.fn(async () => false),
    setFullscreen: vi.fn(async () => {}),
    listen: vi.fn(async () => () => {}),
  })),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined),
}))
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async () => () => {}),
  }),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

import App from './App'

// Vitest prints unhandled rejections but does not fail the test for them
// in this setup, so a bare `void rejectingPromise()` would pass silently.
// This module-level listener lets each test snapshot the count and assert
// it did not grow.
//
// The listener must be attached BEFORE the first test runs. Vitest's own
// unhandled-rejection handler is installed when the first test starts; a
// listener added inside a test body lands AFTER it, and vitest's handler
// marks the rejection as "handled" before ours sees it (probe-verified:
// inside-test listeners never fire). Module scope runs at import time,
// which is before any test body executes.
const unhandledRejections: unknown[] = []
process.on('unhandledRejection', (reason: unknown) => {
  unhandledRejections.push(reason)
})

// Regression test (audit #2, N4): onSeekCommit fired
// `void command('seek', [t, 'absolute']).finally(...)` -- .finally does NOT
// handle a rejection, so when mpv rejected the commit seek (player shutting
// down, command raced with a stop), the rejection escaped as an unhandled
// promise rejection. The fix appends .catch. This test drives the real
// SeekBar (change + mouseUp) through the real App with a command mock that
// rejects absolute seeks, and asserts no unhandled rejection leaked.
describe('App onSeekCommit swallows mpv rejections (N4)', () => {
  it('a rejected commit seek does not leak an unhandled rejection', async () => {
    const original = commandImpl
    commandImpl = async (...args: unknown[]) => {
      const [, seekArgs] = args
      if (Array.isArray(seekArgs) && seekArgs[1] === 'absolute') {
        throw new Error('mpv command failed: seek')
      }
    }

    try {
      const { container, findByText } = render(<App />)
      // Wait for the player to finish init and the controls to appear.
      await findByText('Ouvrir une vidéo…')

      // Simulate mpv reporting a loaded file with a duration and position
      // through the property observer captured at mock time.
      await act(async () => {
        propertyListener!({ name: 'filename', data: 'video.mkv' })
        propertyListener!({ name: 'duration', data: 100 })
        propertyListener!({ name: 'time-pos', data: 10 })
      })

      const seekBar = container.querySelector('.seek-bar') as HTMLInputElement
      expect(seekBar).not.toBeNull()

      const before = unhandledRejections.length
      // Drag the slider to 42 and release: SeekBar fires onSeekCommit(42),
      // App issues command('seek', [42, 'absolute']) which the mock rejects.
      await act(async () => {
        fireEvent.change(seekBar, { target: { value: '42' } })
        fireEvent.mouseUp(seekBar)
        // setTimeout(0) first: lets the rejection settle into the
        // unhandledRejection event before the longer drain.
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 10))
      })

      expect(unhandledRejections.length).toBe(before)
    } finally {
      commandImpl = original
    }
  })

  // Regression test (audit #2, N4): seekBy fired a bare
  // `void command('seek', [delta, 'relative'])`. When mpv rejected it (player
  // shutting down, command raced with a stop), the rejection escaped as an
  // unhandled promise rejection. The fix appends .catch. This test presses
  // ArrowRight through the real keyboard listener with a command mock that
  // rejects relative seeks, and asserts no unhandled rejection leaked.
  it('a rejected arrow-key seek does not leak an unhandled rejection', async () => {
    const original = commandImpl
    // Same plain-function requirement as above (see the NOTE at commandImpl).
    commandImpl = async (...args: unknown[]) => {
      const [, seekArgs] = args
      if (Array.isArray(seekArgs) && seekArgs[1] === 'relative') {
        throw new Error('mpv command failed: seek')
      }
    }

    try {
      const { findByText } = render(<App />)
      await findByText('Ouvrir une vidéo…')

      // Simulate mpv reporting a loaded file so hasMedia is true and the
      // arrow-key shortcut actually issues the seek.
      await act(async () => {
        propertyListener!({ name: 'filename', data: 'video.mkv' })
        propertyListener!({ name: 'duration', data: 100 })
        propertyListener!({ name: 'time-pos', data: 10 })
      })

      const before = unhandledRejections.length
      await act(async () => {
        fireEvent.keyDown(window, { key: 'ArrowRight' })
        // setTimeout(0) first: lets the rejection settle into the
        // unhandledRejection event before the longer drain.
        await new Promise((r) => setTimeout(r, 0))
        await new Promise((r) => setTimeout(r, 10))
      })

      expect(unhandledRejections.length).toBe(before)
    } finally {
      commandImpl = original
    }
  })

  // Meta-test: proves the unhandledRejection listener above actually fires
  // in this file's setup. Without it, a broken listener would make the
  // test above vacuously green.
  it('meta: the unhandledRejection listener fires in this file', async () => {
    const rejecting = async (): Promise<void> => {
      throw new Error('meta-probe')
    }
    const before = unhandledRejections.length
    void rejecting()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(unhandledRejections.length).toBe(before + 1)
  })
})
