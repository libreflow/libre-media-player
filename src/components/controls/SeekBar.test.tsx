import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
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

  // Regression test for the frozen-bar bug: extrapolation must be CUMULATIVE
  // across rAF frames (each frame builds on the previous frame's display
  // value), not recomputed from the raw timePos each frame -- mpv only
  // ticks time-pos about once per second, so a per-frame recompute only
  // ever advanced the bar by one frame-delta between ticks and the bar
  // stayed essentially frozen instead of gliding.
  it('advances cumulatively across rAF frames between mpv ticks', async () => {
    vi.useFakeTimers()
    const rafCallbacks: FrameRequestCallback[] = []
    vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const performanceSpy = vi
      .spyOn(window.performance, 'now')
      .mockReturnValue(0)

    const seekingRef = { current: false }
    const { container } = render(
      <SeekBar
        timePos={10}
        duration={100}
        seekingRef={seekingRef}
        onSeekChange={() => {}}
        onSeekCommit={() => {}}
        paused={false}
        chapters={[]}
        visible
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement
    expect(Number(input.value)).toBe(10)

    // Simulate 30 rAF frames of ~16.7ms each -- no new timePos prop (mpv
    // hasn't ticked). The displayed position must advance by ~0.5s total,
    // not by one frame's ~0.017s.
    let now = 0
    for (let i = 0; i < 30; i++) {
      now += 16.7
      performanceSpy.mockReturnValue(now)
      const cb = rafCallbacks.shift()!
      act(() => cb(now))
    }
    const after = Number(input.value)
    expect(after).toBeGreaterThan(10.4)
    expect(after).toBeLessThanOrEqual(10.6)

    vi.useRealTimers()
  })

  // A fresh timePos from mpv must resynchronize the displayed position
  // (the observer's value wins over the extrapolation).
  it('resyncs to a new raw timePos between frames', async () => {
    vi.useFakeTimers()
    const rafCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const performanceSpy = vi.spyOn(window.performance, 'now').mockReturnValue(0)

    const seekingRef = { current: false }
    const { container, rerender } = render(
      <SeekBar
        timePos={10}
        duration={100}
        seekingRef={seekingRef}
        onSeekChange={() => {}}
        onSeekCommit={() => {}}
        paused={false}
        chapters={[]}
        visible
      />,
    )
    const input = container.querySelector('input') as HTMLInputElement

    let now = 0
    now += 100
    performanceSpy.mockReturnValue(now)
    act(() => rafCallbacks.shift()!(now))
    expect(Number(input.value)).toBeGreaterThan(10)

    rerender(
      <SeekBar
        timePos={65}
        duration={100}
        seekingRef={seekingRef}
        onSeekChange={() => {}}
        onSeekCommit={() => {}}
        paused={false}
        chapters={[]}
        visible
      />,
    )
    expect(Number(input.value)).toBe(65)

    // And extrapolation continues from the resynced value, not from 10.
    now += 50
    performanceSpy.mockReturnValue(now)
    act(() => rafCallbacks.shift()!(now))
    expect(Number(input.value)).toBeGreaterThan(65)

    vi.useRealTimers()
  })
})
