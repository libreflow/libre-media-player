import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { act } from 'react'

const { setPropertyMock } = vi.hoisted(() => ({ setPropertyMock: vi.fn() }))

vi.mock('tauri-plugin-libmpv-api', () => ({
  setProperty: setPropertyMock,
}))

vi.mock('../settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ motionInterpolation: false }),
  updateSettings: vi.fn().mockResolvedValue(undefined),
}))

import { useMotionInterpolation } from './useMotionInterpolation'

// Regression test: the toggle used to send `video-sync=display-resync`, a
// value mpv rejects, so every activation failed and the UI reverted.
function Harness() {
  const { enabled, toggle } = useMotionInterpolation(true)
  return (
    <button type="button" data-enabled={String(enabled)} onClick={() => void toggle()}>
      toggle
    </button>
  )
}

describe('useMotionInterpolation', () => {
  beforeEach(() => {
    setPropertyMock.mockClear()
    setPropertyMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('applies valid mpv values when enabling', async () => {
    const { getByRole } = render(<Harness />)
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      getByRole('button').click()
    })
    expect(setPropertyMock).toHaveBeenCalledWith('video-sync', 'display-resample')
    expect(setPropertyMock).toHaveBeenCalledWith('interpolation', 'yes')
  })

  it('keeps the toggle enabled when mpv accepts the properties', async () => {
    const { getByRole } = render(<Harness />)
    await act(async () => {
      await Promise.resolve()
    })
    const btn = getByRole('button') as HTMLElement
    expect(btn.dataset.enabled).toBe('false')
    await act(async () => {
      btn.click()
    })
    expect(btn.dataset.enabled).toBe('true')
  })

  it('reverts the UI state when mpv rejects the properties', async () => {
    setPropertyMock.mockRejectedValue(new Error('mpv rejected'))
    const { getByRole } = render(<Harness />)
    await act(async () => {
      await Promise.resolve()
    })
    const btn = getByRole('button') as HTMLElement
    await act(async () => {
      btn.click()
    })
    expect(btn.dataset.enabled).toBe('false')
  })
})
