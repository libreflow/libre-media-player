import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

vi.mock('tauri-plugin-libmpv-api', () => ({
  command: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
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
