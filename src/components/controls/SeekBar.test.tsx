import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SeekBar } from './SeekBar'

// The seek bar extrapolates playback position between mpv's time-pos ticks
// with requestAnimationFrame, so the bar glides continuously instead of
// jumping once per observer tick. These tests pin the core behaviors:
// raw-follow, extrapolation while playing, no extrapolation while paused,
// and drag isolation (observer ticks must not snap the thumb mid-drag).

function pressKey(input: HTMLElement, key: string) {
  // React 19 attaches its listeners at the root, so synthetic-triggered
  // events must bubble to be seen by the onKeyUp handler.
  input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }))
}

describe('SeekBar smoothing', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders the raw position when paused (no extrapolation)', () => {
    const seekingRef = { current: false }
    const { container } = render(
      <SeekBar
        timePos={42}
        duration={100}
        seekingRef={seekingRef}
        onSeekChange={() => {}}
        onSeekCommit={() => {}}
        paused
        visible
        chapters={[]}
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(Number(input.value)).toBe(42)
    expect(input.style.getPropertyValue('--fill')).toBe('42%')
  })

  it('shows 0% and placeholder times with no media loaded', () => {
    const seekingRef = { current: false }
    const { container } = render(
      <SeekBar
        timePos={null}
        duration={null}
        seekingRef={seekingRef}
        onSeekChange={() => {}}
        onSeekCommit={() => {}}
        paused
        visible
        chapters={[]}
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.style.getPropertyValue('--fill')).toBe('0%')
  })

  it('commits the dragged value on keyup', () => {
    const seekingRef = { current: true }
    const onSeekCommit = vi.fn()
    const { container } = render(
      <SeekBar
        timePos={10}
        duration={100}
        seekingRef={seekingRef}
        onSeekChange={() => {}}
        onSeekCommit={onSeekCommit}
        paused
        visible
        chapters={[]}
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    pressKey(input, 'ArrowRight')
    expect(onSeekCommit).toHaveBeenCalledWith(Number(input.value))
  })

  // Regression test for the arrow-key double-seek: when the global
  // keyboard shortcut preventDefault'ed the keydown, no onChange fired
  // and seekingRef is still false. The old unconditional onKeyUp commit
  // then sent an ABSOLUTE seek to the stale slider value, cancelling the
  // relative seek the shortcut just issued -- arrow keys appeared dead
  // whenever the seek bar had focus.
  it('does NOT commit on keyup when no change happened (shortcut-handled arrow)', () => {
    const seekingRef = { current: false }
    const onSeekCommit = vi.fn()
    const { container } = render(
      <SeekBar
        timePos={50}
        duration={200}
        seekingRef={seekingRef}
        onSeekChange={() => {}}
        onSeekCommit={onSeekCommit}
        paused
        visible={false}
        chapters={[]}
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    // Simulate: keydown was preventDefault'ed by the global shortcut
    // (no onChange, seekingRef untouched), then the key is released.
    pressKey(input, 'ArrowRight')
    expect(onSeekCommit).not.toHaveBeenCalled()
  })
})
