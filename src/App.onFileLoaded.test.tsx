import { describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

// Integration regression test (audit #3, N7): App's usePlayer wrapper used
// to forward ONLY the path to useSubtitles.onFileLoaded, silently dropping
// the loadGeneration argument usePlayer passes alongside it. useSubtitles'
// sidecar dedup guard compares that generation against loadedForRef, so in
// production the guard was dead code -- its unit tests stayed green only
// because they called useSubtitles.onFileLoaded directly WITH a generation.
//
// This test mounts the REAL App (real usePlayer wiring), mocks useSubtitles
// to CAPTURE the arguments its onFileLoaded receives, drives a real file
// load through the production cold-start path (invoke('get_initial_file')
// -> loadFile -> usePlayer -> onFileLoaded(path, generation)), and asserts
// the generation arrived -- undefined would mean the wrapper still drops it.

vi.mock('tauri-plugin-libmpv-api', () => ({
  init: vi.fn(async () => 'main'),
  destroy: vi.fn(async () => {}),
  observeProperties: vi.fn(async () => () => {}),
  command: vi.fn(async () => {}),
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
// The cold-start path: get_initial_file returns a video path, exactly as the
// Rust side does when the OS launches the app on a file.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === 'get_initial_file') return '/videos/movie.mkv'
    return undefined
  }),
}))
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async () => () => {}),
  }),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }))

// Capture harness: replaces useSubtitles with a spy that records every
// onFileLoaded invocation's arguments. The shape mirrors the real hook's
// return values closely enough for Controls to render.
const onFileLoadedCalls: Array<{ path: string; generation: number | undefined }> = []
vi.mock('./hooks/useSubtitles', () => ({
  useSubtitles: () => ({
    available: false,
    visible: false,
    subTracks: [],
    audioTracks: [],
    onFileLoaded: (path: string, generation?: number) => {
      onFileLoadedCalls.push({ path, generation })
    },
    toggle: vi.fn(async () => {}),
    selectSubtrack: vi.fn(async () => {}),
    disableSubtitles: vi.fn(async () => {}),
    selectAudioTrack: vi.fn(async () => {}),
  }),
}))

import App from './App'

describe('App forwards loadGeneration through usePlayer (audit #3, N7)', () => {
  it('useSubtitles.onFileLoaded receives the load generation, not undefined', async () => {
    const { findByText } = render(<App />)
    // Wait for the player to init (button enabled) and the initial-file load
    // (invoked right after readiness) to flow through to the wrapper.
    await findByText('Ouvrir une vidéo…')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    expect(onFileLoadedCalls.length).toBeGreaterThanOrEqual(1)
    const first = onFileLoadedCalls[0]
    expect(first.path).toBe('/videos/movie.mkv')
    // The regression: the wrapper used to pass only the path, leaving
    // generation undefined and silently disarming useSubtitles' dedup.
    expect(first.generation).toBeTypeOf('number')
    expect(Number.isInteger(first.generation)).toBe(true)
    expect(first.generation).toBeGreaterThan(0)
  })
})
