// Maps raw technical exceptions (mpv/Tauri IPC, plugin errors) to clear
// localized messages for the error banner (the summaries live in i18n so
// the EN locale shows English too). The underlying detail is preserved
// through the Error's cause so a future diagnostic surface (logs, a details
// expander) can still reach it -- the user only ever sees the summary.

import { t, type MessageKey } from './i18n'

export class UserFacingError extends Error {
  /** Raw technical detail, kept for diagnostics. */
  detail?: unknown
  constructor(message: string, detail?: unknown) {
    super(message)
    this.name = 'UserFacingError'
    this.detail = detail
  }
}

// Turns a caught value into the shortest readable string (Tauri rejects with
// plain strings; JS throws with Error objects; some paths throw anything).
function technicalDetail(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

// The actual mapping: each known failure mode of the app gets one fixed,
// non-technical message. Anything unrecognized keeps the caller's fallback
// message so a new/unknown mpv error never leaks its raw text to the user.
export function userFacingMessage(
  fallback: MessageKey | string,
  e: unknown,
): UserFacingError {
  const detail = technicalDetail(e)
  // Specific patterns FIRST: the generic file/command pattern below also
  // catches e.g. "error running command", which used to swallow every track
  // or subtitle failure emitted by the mpv wrapper and claim the FILE was
  // unreadable instead.
  const known: Array<[RegExp, MessageKey]> = [
    [/init|initialize|mpv/i, 'errInitEngine'],
    [/sub-?title|sid/i, 'errSubtitlesBad'],
    [/track/i, 'errTrackBad'],
    [/fullscreen/i, 'errFullscreenBad'],
    [/dialog/i, 'errDialogBad'],
    [/error running command|command (failed|not found)|no such file|doesn'?t exist|not found|access is denied|permission/i, 'errUnreadable'],
  ]
  for (const [pattern, key] of known) {
    if (pattern.test(detail)) return new UserFacingError(t(key), e)
  }
  // Callers may pass a localized MessageKey instead of a raw string; t()
  // returns the key as-is when it is not in the catalog, so a plain string
  // fallback still flows through unchanged.
  return new UserFacingError(t(fallback as MessageKey), e)
}
