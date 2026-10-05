import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { VolumeControl } from './VolumeControl'

// The volume icon has three states like VLC: crossed (muted), one arc
// (low level), two arcs (high level). Mute-clicking restores the last
// non-zero level.

describe('VolumeControl icon states', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the crossed speaker at volume 0', () => {
    const { getByRole, container } = render(<VolumeControl volume={0} setVolume={() => {}} />)
    expect(getByRole('button', { name: 'Réactiver le son' })).toBeTruthy()
    expect(container.querySelectorAll('path').length).toBe(2)
  })

  it('shows a single arc for a low level', () => {
    const { container } = render(<VolumeControl volume={30} setVolume={() => {}} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('path').length).toBe(2)
  })

  it('shows two arcs for a high level', () => {
    const { container } = render(<VolumeControl volume={90} setVolume={() => {}} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.querySelectorAll('path').length).toBe(3)
  })

  it('restores the last non-zero level when unmuting', () => {
    const setVolume = vi.fn()
    const { getByRole } = render(<VolumeControl volume={0} setVolume={setVolume} />)
    getByRole('button').click()
    expect(setVolume).toHaveBeenCalledWith(40)
  })
})
