// Minimal i18n layer (roadmap #64). The UI is French-first; this module
// extracts every user-facing string so a second locale (English) can be
// added without touching components, and switches at runtime via a
// settings-persisted preference. No dependency: the message sets are
// plain objects and `t()` is a lookup with {placeholder} interpolation.

export type Locale = 'fr' | 'en'

const fr = {
  // Generic / error banner
  retry: 'Réessayer',
  close: 'Fermer',
  closeErrorMessage: 'Fermer le message d’erreur',
  // Drop zone
  appName: 'Libre Media Player',
  openVideo: 'Ouvrir une vidéo…',
  initializing: 'Initialisation du lecteur…',
  dropHint: '…ou glissez-déposez vos fichiers ici',
  dropOverlay: 'Déposer un fichier vidéo pour le lire',
  recentsTitle: 'Récemment ouverts',
  recentsClear: 'Effacer',
  // Controls
  play: 'Lecture',
  pause: 'Pause',
  previousTrack: 'Piste précédente',
  nextTrack: 'Piste suivante',
  audioTracks: 'Pistes audio',
  queue: 'File d’attente',
  fullscreen: 'Plein écran',
  exitFullscreen: 'Quitter le plein écran',
  openOtherFile: 'Ouvrir un autre fichier',
  setDefaultPlayer: 'Définir comme lecteur par défaut',
  setDefaultPlayerTitle: 'Ouvre les réglages Windows pour définir Libre Media Player comme lecteur vidéo par défaut',
  unmute: 'Réactiver le son',
  mute: 'Couper le son',
  // Subtitles
  subtitles: 'Sous-titres',
  showSubtitles: 'Afficher les sous-titres',
  hideSubtitles: 'Masquer les sous-titres',
  chooseSubtrack: 'Choisir la piste de sous-titres',
  noSubtitles: 'Aucun sous-titre trouvé',
  disabled: 'Désactivées',
  // Playlist panel
  queueTitle: 'File d’attente ({count})',
  shuffle: 'Lecture aléatoire',
  repeat: 'Répéter la file',
  emptyQueue: 'File vide — déposez des vidéos',
  clearQueue: 'Vider la file',
  removeItem: 'Retirer {name}',
  // Seek bar / OSD
  chapter: 'Chapitre',
  // Errors
  errFullscreen: 'Plein écran indisponible : {err}',
  errLoad: 'Impossible de lire ce fichier : {err}',
  errInit: 'Échec d’initialisation du lecteur : {err}',
  errSettings: 'Impossible d’ouvrir les réglages : {err}',
  errSubtitles: 'Sous-titres indisponibles : {err}',
  errSelectSub: 'Sélection du sous-titre impossible : {err}',
  errDisableSub: 'Désactivation des sous-titres impossible : {err}',
  errSelectAudio: 'Sélection de la piste audio impossible : {err}',
  errQueue: 'File d’attente indisponible : {err}',
  errPicker: 'Impossible d’ouvrir le sélecteur de fichier : {err}',
  // mpv error descriptions (#57)
  errFileNotFound: 'Fichier introuvable ou inaccessible.',
  errPermission: 'Accès au fichier refusé — vérifiez les permissions de lecture.',
  errFormat: 'Format non reconnu ou fichier corrompu — impossible d’ouvrir ce fichier.',
  errCommand: 'Le lecteur vidéo n’a pas pu démarrer la lecture de ce fichier.',
  errCorrupt: 'La lecture s’est arrêtée sur une erreur — le fichier est peut-être corrompu ou incomplet.',
  // Screenshot (#60)
  screenshotTaken: 'Capture enregistrée : {path}',
  screenshotFailed: 'Capture impossible : {err}',
  // Updater (#63)
  updateAvailable: 'Version {version} disponible — cliquez pour installer',
  updateReady: 'Mise à jour prête. Redémarrer pour appliquer ?',
  updateCheckFailed: 'Vérification de mise à jour impossible : {err}',
  // Language (#64)
  language: 'Langue',
} as const

export type MessageKey = keyof typeof fr

const en: Record<MessageKey, string> = {
  retry: 'Retry',
  close: 'Close',
  closeErrorMessage: 'Close the error message',
  appName: 'Libre Media Player',
  openVideo: 'Open a video…',
  initializing: 'Initializing player…',
  dropHint: '…or drag & drop your files here',
  dropOverlay: 'Drop a video file to play it',
  recentsTitle: 'Recently opened',
  recentsClear: 'Clear',
  play: 'Play',
  pause: 'Pause',
  previousTrack: 'Previous track',
  nextTrack: 'Next track',
  audioTracks: 'Audio tracks',
  queue: 'Queue',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  openOtherFile: 'Open another file',
  setDefaultPlayer: 'Set as default player',
  setDefaultPlayerTitle: 'Opens Windows settings to set Libre Media Player as the default video player',
  unmute: 'Unmute',
  mute: 'Mute',
  subtitles: 'Subtitles',
  showSubtitles: 'Show subtitles',
  hideSubtitles: 'Hide subtitles',
  chooseSubtrack: 'Choose subtitle track',
  noSubtitles: 'No subtitles found',
  disabled: 'Disabled',
  queueTitle: 'Queue ({count})',
  shuffle: 'Shuffle',
  repeat: 'Repeat queue',
  emptyQueue: 'Queue empty — drop some videos',
  clearQueue: 'Clear queue',
  removeItem: 'Remove {name}',
  chapter: 'Chapter',
  errFullscreen: 'Fullscreen unavailable: {err}',
  errLoad: 'Cannot play this file: {err}',
  errInit: 'Player initialization failed: {err}',
  errSettings: 'Cannot open settings: {err}',
  errSubtitles: 'Subtitles unavailable: {err}',
  errSelectSub: 'Cannot select subtitle: {err}',
  errDisableSub: 'Cannot disable subtitles: {err}',
  errSelectAudio: 'Cannot select audio track: {err}',
  errQueue: 'Queue unavailable: {err}',
  errPicker: 'Cannot open the file picker: {err}',
  errFileNotFound: 'File not found or inaccessible.',
  errPermission: 'Access to the file denied — check read permissions.',
  errFormat: 'Unrecognized format or corrupt file — cannot open this file.',
  errCommand: 'The video player could not start playing this file.',
  errCorrupt: 'Playback stopped on an error — the file may be corrupt or incomplete.',
  screenshotTaken: 'Screenshot saved: {path}',
  screenshotFailed: 'Screenshot failed: {err}',
  updateAvailable: 'Version {version} available — click to install',
  updateReady: 'Update ready. Restart to apply?',
  updateCheckFailed: 'Update check failed: {err}',
  language: 'Language',
}

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { fr, en }

export const LOCALES: Locale[] = ['fr', 'en']

let currentLocale: Locale = 'fr'

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

export function getLocale(): Locale {
  return currentLocale
}

// Translates a key with {placeholder} interpolation. Unknown placeholders
// are left as-is so a missing value is visible instead of silent.
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const catalog = CATALOGS[currentLocale] ?? CATALOGS.fr
  let text: string = catalog[key] ?? CATALOGS.fr[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}
