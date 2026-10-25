import { describe, expect, it, vi, beforeEach } from 'vitest'

// useLocale / useUpdateCheck wrap external plugins; the meaningful
// unit-testable surface is the behavior contract: a failed check stays
// silent, a found update becomes installable. The plugins are mocked.
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => null),
}))
vi.mock('../settings', () => ({
  loadSettings: vi.fn(async () => ({ locale: 'en' })),
  updateSettings: vi.fn(async () => {}),
}))
vi.mock('../i18n', () => ({
  setLocale: vi.fn(),
  t: (k: string) => k,
}))

import { useUpdateCheck, useLocale } from './useAppPrefs'
import { renderHook } from '@testing-library/react'

describe('useLocale', () => {
  it('applies la langue persistée au montage', async () => {
    const { setLocale } = await import('../i18n')
    const { result } = renderHook(() => useLocale())
    expect(result.current.switchLocale).toBeTypeOf('function')
    await vi.waitFor(() => expect(setLocale).toHaveBeenCalledWith('en'))
  })
})

describe('useUpdateCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reste silencieux sans mise à jour', async () => {
    const onNotice = vi.fn()
    const onError = vi.fn()
    const { result } = renderHook(() => useUpdateCheck(onNotice, onError))
    await vi.waitFor(() => {
      expect(result.current.update).toBeNull()
    })
    expect(onError).not.toHaveBeenCalled()
  })
})
