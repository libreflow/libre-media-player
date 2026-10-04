import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const openMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock }))

const onDragDropEventMock = vi.hoisted(() => vi.fn(async () => () => {}))
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: onDragDropEventMock }),
}))

import { useFilePicker } from './useFilePicker'

function setup(overrides: Partial<Parameters<typeof useFilePicker>[0]> = {}) {
  const loadFile = vi.fn(async () => {})
  const onFilesDropped = vi.fn()
  const onFilePicked = vi.fn()
  const onError = vi.fn()
  const readyRef = { current: true }
  const { result } = renderHook(() =>
    useFilePicker({
      readyRef,
      loadFile,
      onFilesDropped,
      onFilePicked,
      onError,
      ...overrides,
    }),
  )
  return { result, loadFile, onFilesDropped, onFilePicked, onError }
}

// Regression test: the native open dialog was called with `multiple: false`
// and the handler explicitly bailed out (`Array.isArray(path)) return`) on
// an array result -- the user could only ever pick one file at a time, with
// no way to multi-select from the file picker like drag-drop already
// supports via onFilesDropped.
describe('useFilePicker.openFile -- multiple selection', () => {
  it('requests multiple selection from the native dialog', async () => {
    openMock.mockResolvedValueOnce(['/videos/a.mkv'])
    const { result } = setup()
    await act(async () => {
      await result.current.openFile()
    })
    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: true }),
    )
  })

  it('routes every picked file through onFilesDropped when several are selected', async () => {
    openMock.mockResolvedValueOnce(['/videos/a.mkv', '/videos/b.mkv', '/videos/c.mkv'])
    const { result, onFilesDropped, onFilePicked, loadFile } = setup()
    await act(async () => {
      await result.current.openFile()
    })
    expect(onFilesDropped).toHaveBeenCalledWith(['/videos/a.mkv', '/videos/b.mkv', '/videos/c.mkv'])
    expect(onFilePicked).not.toHaveBeenCalled()
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('still works for a single picked file (dialog returns a bare string)', async () => {
    openMock.mockResolvedValueOnce('/videos/a.mkv')
    const { result, onFilePicked, onFilesDropped } = setup()
    await act(async () => {
      await result.current.openFile()
    })
    expect(onFilePicked).toHaveBeenCalledWith('/videos/a.mkv')
    expect(onFilesDropped).not.toHaveBeenCalled()
  })

  it('does nothing when the dialog is cancelled (null)', async () => {
    openMock.mockResolvedValueOnce(null)
    const { result, onFilePicked, onFilesDropped, loadFile } = setup()
    await act(async () => {
      await result.current.openFile()
    })
    expect(onFilePicked).not.toHaveBeenCalled()
    expect(onFilesDropped).not.toHaveBeenCalled()
    expect(loadFile).not.toHaveBeenCalled()
  })

  it('falls back to loadFile for a single pick when onFilePicked is not provided', async () => {
    openMock.mockResolvedValueOnce('/videos/a.mkv')
    const { result, loadFile } = setup({ onFilePicked: undefined })
    await act(async () => {
      await result.current.openFile()
    })
    expect(loadFile).toHaveBeenCalledWith('/videos/a.mkv')
  })

  it('falls back to loadFile with the first file for a multi-pick when onFilesDropped is not provided', async () => {
    openMock.mockResolvedValueOnce(['/videos/a.mkv', '/videos/b.mkv'])
    const { result, loadFile } = setup({ onFilesDropped: undefined })
    await act(async () => {
      await result.current.openFile()
    })
    expect(loadFile).toHaveBeenCalledWith('/videos/a.mkv')
  })
})
