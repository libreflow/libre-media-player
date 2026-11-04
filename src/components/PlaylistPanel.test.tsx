import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'

import { PlaylistPanel } from './PlaylistPanel'

afterEach(() => {
  cleanup()
})

const base = {
  open: true,
  queue: [
    { path: '/videos/a.mkv', name: 'a.mkv' },
    { path: '/videos/b.mkv', name: 'b.mkv' },
  ],
  currentIndex: 0,
  shuffle: false,
  repeat: false,
  onToggleShuffle: vi.fn(),
  onToggleRepeat: vi.fn(),
  onPlay: vi.fn(),
  onRemove: vi.fn(),
  onClear: vi.fn(),
  onClose: vi.fn(),
}

// UI-audit follow-up: every queue item is a real BUTTON now (keyboard
// focus + Enter/Space activation, roadmap #56), where the old bare clickable
// <li> could not even be focused.
describe('PlaylistPanel items are keyboard-activated buttons', () => {
  it('renders each item name as a focused-button-able element', () => {
    const { getByRole } = render(<PlaylistPanel {...base} />)
    expect(getByRole('button', { name: 'b.mkv' })).toBeTruthy()
    expect(getByRole('button', { name: 'Retirer b.mkv' })).toBeTruthy()
  })

  it('plays an item when its name button receives Enter (keyboard)', () => {
    const onPlay = vi.fn()
    const { getByRole } = render(<PlaylistPanel {...base} onPlay={onPlay} />)
    const second = getByRole('button', { name: 'b.mkv' })
    second.focus()
    fireEvent.keyDown(second, { key: 'Enter' })
    // The native button activation runs a click.
    fireEvent.click(second)
    expect(onPlay).toHaveBeenCalledWith(1)
  })

  it('remove is reachable and does not double-trigger a play', () => {
    const onPlay = vi.fn()
    const onRemove = vi.fn()
    const { getByRole } = render(
      <PlaylistPanel {...base} onPlay={onPlay} onRemove={onRemove} />,
    )
    fireEvent.click(getByRole('button', { name: 'Retirer b.mkv' }))
    expect(onRemove).toHaveBeenCalledWith(1)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('shows nothing when closed', () => {
    const { container } = render(<PlaylistPanel {...base} open={false} />)
    expect(container.firstChild).toBeNull()
  })
})
