// Maps mpv/load failures to user-facing French messages (roadmap #57).
// mpv error strings are stable command-line diagnostics ("Failed to open",
// "error running command", numeric mpv_error codes...); matching on known
// substrings keeps the mapping testable without a running mpv. Anything
// unrecognized falls back to a generic message that still includes the
// original error for diagnostics.

export function describeLoadError(err: unknown): string {
  const raw = String(err)
  if (raw.includes('not found') || raw.includes('No such file')) {
    return 'Fichier introuvable ou inaccessible.'
  }
  if (raw.includes('Permission denied') || raw.includes('denied')) {
    return "Accès au fichier refusé — vérifiez les permissions de lecture."
  }
  if (raw.includes('Failed to open') || raw.includes('failed to open')) {
    return "Format non reconnu ou fichier corrompu — impossible d'ouvrir ce fichier."
  }
  if (raw.includes('error running command') || raw.includes('error running property')) {
    return 'Le lecteur vidéo n’a pas pu démarrer la lecture de ce fichier.'
  }
  return `Impossible de lire ce fichier : ${raw}`
}

// Describes an mpv end-file failure (reason === 'error') in terms the user
// can act on, rather than surfacing mpv's numeric error code.
export function describeEndFileError(): string {
  return 'La lecture s’est arrêtée sur une erreur — le fichier est peut-être corrompu ou incomplet.'
}
