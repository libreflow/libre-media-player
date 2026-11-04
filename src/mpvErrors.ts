// Maps mpv/load failures to user-facing messages (roadmap #57), localized
// through i18n (previously hardcoded French, so the EN locale kept French
// banners). mpv error strings are stable command-line diagnostics
// ("Failed to open", "error running command"...); matching on known
// substrings keeps the mapping testable without a running mpv. Anything
// unrecognized falls back to a generic localized message that still
// includes the original error for diagnostics.

import { t } from './i18n'

export function describeLoadError(err: unknown): string {
  const raw = String(err)
  if (raw.includes('not found') || raw.includes('No such file')) {
    return t('errFileNotFound')
  }
  if (raw.includes('Permission denied') || raw.includes('denied')) {
    return t('errPermission')
  }
  if (raw.includes('Failed to open') || raw.includes('failed to open')) {
    return t('errFormat')
  }
  if (raw.includes('error running command') || raw.includes('error running property')) {
    return t('errCommand')
  }
  return t('errLoad', { err: raw })
}

// Describes an mpv end-file failure (reason === 'error') in terms the user
// can act on, rather than surfacing mpv's numeric error code.
export function describeEndFileError(): string {
  return t('errCorrupt')
}
