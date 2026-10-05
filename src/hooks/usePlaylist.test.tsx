import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// Captures the listenEvents callback so tests can simulate mpv events.
let mpvEventsCb: ((e: { event: string; reason?: string }) => void) | null = null
vi.mock('tauri-plugin-libmpv-api', () => ({
  command: vi.fn(async () => {}),
  listenEvents: vi.fn(async (cb: (e: { event: string; reason?: string }) => void) => {
    mpvEventsCb = cb
    return () => { mpvEventsCb = null }
  }),
}))

import { usePlaylist } from './usePlaylist'

function setup() {
  const loadFile = vi.fn(async () => {})
  const { result } = renderHook(() =>
    usePlaylist({ ready: true, loadFile, onError: vi.fn() }),
  )
  return { result, loadFile }
}

// Regression test: append() used to push every dropped/picked path onto the
// queue unconditionally. Dropping (or multi-selecting via the file dialog)
// a file that's already queued -- including the one currently playing --
// created a duplicate entry instead of being a no-op, as the user reported.
describe('usePlaylist.append -- no duplicate entries', () => {
  it('does not add a file whose path is already in the queue', async () => {
    const { result } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv'])
    })
    expect(result.current.queue.map((i) => i.path)).toEqual([
      '/videos/a.mkv', '/videos/b.mkv',
    ])

    await act(async () => {
      result.current.append(['/videos/b.mkv', '/videos/c.mkv'])
    })
    // b.mkv must not be duplicated; only c.mkv (genuinely new) is appended.
    expect(result.current.queue.map((i) => i.path)).toEqual([
      '/videos/a.mkv', '/videos/b.mkv', '/videos/c.mkv',
    ])
  })

  it('does not duplicate the file currently playing', async () => {
    const { result } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv'])
    })
    expect(result.current.currentIndex).toBe(0)

    // Re-dropping the file that's already playing must be a pure no-op.
    await act(async () => {
      result.current.append(['/videos/a.mkv'])
    })
    expect(result.current.queue.map((i) => i.path)).toEqual(['/videos/a.mkv'])
  })

  it('dedupes duplicate paths within a single batch too', async () => {
    const { result } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/a.mkv', '/videos/b.mkv'])
    })
    expect(result.current.queue.map((i) => i.path)).toEqual([
      '/videos/a.mkv', '/videos/b.mkv',
    ])
  })

  it('is a no-op (does not call loadFile again) when every path is already queued', async () => {
    const { result, loadFile } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv'])
    })
    expect(loadFile).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.append(['/videos/a.mkv'])
    })
    // No new item, so no second playIndex(0) -- loadFile must not be
    // called again for a batch that resolves to zero new files.
    expect(loadFile).toHaveBeenCalledTimes(1)
  })

  it('still plays the first item when the queue was empty and all-but-one are new', async () => {
    const { result, loadFile } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/a.mkv'])
    })
    expect(result.current.queue.map((i) => i.path)).toEqual(['/videos/a.mkv'])
    expect(loadFile).toHaveBeenCalledTimes(1)
    expect(loadFile).toHaveBeenCalledWith('/videos/a.mkv')
  })
})

// Regression tests for queue navigation edge cases.
describe('usePlaylist navigation edge cases', () => {
  it('playPrevious wraps to the last item when repeat is on', async () => {
    const { result } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv', '/videos/c.mkv'])
    })
    expect(result.current.currentIndex).toBe(0)
    await act(async () => {
      result.current.toggleRepeat()
    })
    await act(async () => {
      result.current.playPrevious()
    })
    expect(result.current.currentIndex).toBe(2)
  })

  it('playPrevious stays at the first item when repeat is off', async () => {
    const { result } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv'])
    })
    expect(result.current.currentIndex).toBe(0)
    await act(async () => {
      result.current.playPrevious()
    })
    expect(result.current.currentIndex).toBe(0)
  })

  it('removing the playing item advances to the item that shifted into its slot', async () => {
    const { result, loadFile } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv', '/videos/c.mkv'])
    })
    expect(result.current.currentIndex).toBe(0)
    await act(async () => {
      result.current.removeAt(0)
    })
    expect(result.current.queue.map((i) => i.path)).toEqual(['/videos/b.mkv', '/videos/c.mkv'])
    expect(result.current.currentIndex).toBe(0)
    expect(loadFile).toHaveBeenCalledWith('/videos/b.mkv')
  })

  it('removing the last playing item stops playback when nothing remains', async () => {
    const stopPlayback = vi.fn()
    const loadFile = vi.fn(async () => {})
    const { result } = renderHook(() =>
      usePlaylist({ ready: true, loadFile, stopPlayback, onError: vi.fn() }),
    )
    await act(async () => {
      result.current.append(['/videos/a.mkv'])
    })
    expect(result.current.currentIndex).toBe(0)
    await act(async () => {
      result.current.removeAt(0)
    })
    expect(result.current.queue).toEqual([])
    expect(result.current.currentIndex).toBe(-1)
    expect(stopPlayback).toHaveBeenCalledTimes(1)
  })

  it('removing an item before the current one shifts the index without reloading', async () => {
    const { result, loadFile } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv', '/videos/c.mkv'])
      await Promise.resolve()
    })
    await act(async () => {
      result.current.playIndex(2)
    })
    expect(result.current.currentIndex).toBe(2)
    loadFile.mockClear()
    await act(async () => {
      result.current.removeAt(0)
    })
    expect(result.current.currentIndex).toBe(1)
    expect(loadFile).not.toHaveBeenCalled()
  })
})

// Regression test: the auto-advance listener used to subscribe to a Tauri
// event literally named 'end-file', but tauri-plugin-libmpv emits every mpv
// event under 'mpv-event-{window}' with the event type in the payload
// (listenEvents handles that shape). The old listener never fired, so EOF
// auto-advance was silently dead.
describe('usePlaylist EOF auto-advance', () => {
  it('advances to the next item on an mpv end-file event with reason eof', async () => {
    const { result, loadFile } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv'])
    })
    expect(result.current.currentIndex).toBe(0)
    loadFile.mockClear()
    await act(async () => {
      mpvEventsCb!({ event: 'end-file', reason: 'eof' })
    })
    expect(result.current.currentIndex).toBe(1)
    expect(loadFile).toHaveBeenCalledWith('/videos/b.mkv')
  })

  it('does not advance on a non-eof end-file (manual loadfile switch)', async () => {
    const { result, loadFile } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv'])
    })
    loadFile.mockClear()
    await act(async () => {
      mpvEventsCb!({ event: 'end-file', reason: 'redirect' })
    })
    expect(result.current.currentIndex).toBe(0)
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('ignores mpv events that are not end-file', async () => {
    const { result, loadFile } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv'])
    })
    loadFile.mockClear()
    await act(async () => {
      mpvEventsCb!({ event: 'file-loaded' })
      mpvEventsCb!({ event: 'idle' })
    })
    expect(result.current.currentIndex).toBe(0)
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('does not wrap around at the end of the queue without repeat', async () => {
    const { result } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv'])
    })
    await act(async () => {
      result.current.playIndex(1)
    })
    expect(result.current.currentIndex).toBe(1)
    await act(async () => {
      mpvEventsCb!({ event: 'end-file', reason: 'eof' })
    })
    expect(result.current.currentIndex).toBe(1)
  })

  it('wraps to the first item at the end of the queue when repeat is on', async () => {
    const { result } = setup()
    await act(async () => {
      result.current.append(['/videos/a.mkv', '/videos/b.mkv'])
    })
    await act(async () => {
      result.current.playIndex(1)
      result.current.toggleRepeat()
    })
    await act(async () => {
      mpvEventsCb!({ event: 'end-file', reason: 'eof' })
    })
    expect(result.current.currentIndex).toBe(0)
  })
})
