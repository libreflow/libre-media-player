// Maps raw technical exceptions (mpv/Tauri IPC, plugin errors) to clear
// French messages for the error banner. The underlying detail is preserved
// through the Error's cause so a future diagnostic surface (logs, a details
// expander) can still reach it -- the user only ever sees the summary.

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
// non-technical message. Anything unrecognized keeps a generic message so a
// new/unknown mpv error never leaks its raw English text to the user.
export function userFacingMessage(
  fallback: string,
  e: unknown,
): UserFacingError {
  const detail = technicalDetail(e)
  const known: Array<[RegExp, string]> = [
    [/init|initialize|mpv/i, 'Le moteur de lecture (mpv) n\u2019a pas pu d\u00e9marrer. Red\u00e9marrez l\u2019application\u00a0; si le probl\u00e8me persiste, r\u00e9installez-la.'],
    [/error running command|command (failed|not found)|no such file|doesn'?t exist|not found|access is denied|permission/i, 'Le fichier est introuvable, illisible, ou son format n\u2019est pas pris en charge.'],
    [/fullscreen/i, 'Le plein \u00e9cran n\u2019est pas disponible pour cette fen\u00eatre.'],
    [/dialog/i, 'Le s\u00e9lecteur de fichier n\u2019a pas pu \u00eatre ouvert. R\u00e9essayez.'],
    [/sub-?title|sid/i, 'Les sous-titres sont indisponibles pour ce fichier.'],
    [/track/i, 'Cette piste n\u2019est pas disponible.'],
  ]
  for (const [pattern, message] of known) {
    if (pattern.test(detail)) return new UserFacingError(message, e)
  }
  return new UserFacingError(fallback, e)
}
