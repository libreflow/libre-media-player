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
  // Fallback label for an unnamed track in the track menus.
  track: 'Piste {id}',
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
  errLoad: 'Impossible de lire ce fichier : {err}',
  dialogTitle: 'Ouvrir une vidéo',
  dialogFilterName: 'Vidéo',
  errInitEngine: 'Le moteur de lecture (mpv) n’a pas pu démarrer. Redémarrez l’application ; si le problème persiste, réinstallez-la.',
  errInitialFile: 'Impossible d’ouvrir le fichier initial.',
  errRecentOpen: 'Impossible d’ouvrir ce fichier.',
  errPlaylistBad: 'La file d’attente est indisponible.',
  errSettingsOpen: 'Impossible d’ouvrir les réglages Windows.',
  errFullscreenBad: 'Le plein écran n’est pas disponible pour cette fenêtre.',
  errDialogBad: 'Le sélecteur de fichier n’a pas pu être ouvert. Réessayez.',
  errSubtitlesBad: 'Les sous-titres sont indisponibles pour ce fichier.',
  errSelectSubBad: 'Impossible de sélectionner ce sous-titre.',
  errDisableSubBad: 'Impossible de désactiver les sous-titres.',
  errSelectAudioBad: 'Impossible de sélectionner cette piste audio.',
  errTrackBad: 'Cette piste n’est pas disponible.',
  errUnreadable: 'Le fichier est introuvable, illisible, ou son format n’est pas pris en charge.',
  errInitSlow: 'Initialisation du lecteur trop lente : impossible d’ouvrir le fichier.',
  // mpv error descriptions (#57)
  errFileNotFound: 'Fichier introuvable ou inaccessible.',
  errPermission: 'Accès au fichier refusé — vérifiez les permissions de lecture.',
  errFormat: 'Format non reconnu ou fichier corrompu — impossible d’ouvrir ce fichier.',
  errCommand: 'Le lecteur vidéo n’a pas pu démarrer la lecture de ce fichier.',
  errCorrupt: 'La lecture s’est arrêtée sur une erreur — le fichier est peut-être corrompu ou incomplet.',
  // Screenshot (#60)
  screenshotTaken: 'Capture enregistrée : {path}',
  screenshotFailed: 'Capture impossible : {err}',
  // Playback speed (follow-up to the roadmap)
  playbackSpeed: 'Vitesse : ×{value}',
  // Generic volume label used by the keyboard-adjust OSD (ArrowUp/Down).
  volumeLabel: 'Volume',
  kbdSpace: 'Espace',
  // Shortcuts help overlay (roadmap follow-up: discoverability -- most
  // shortcuts had no visible affordance anywhere in the UI).
  helpTitle: 'Raccourcis',
  helpHint: 'Appuyez sur Échap pour fermer',
  scPlayPause: 'Lecture / Pause',
  scSeek: 'Avancer / reculer de 10 s',
  scVolume: 'Volume +5 / −5',
  scFullscreen: 'Plein écran',
  scSubDelay: 'Sous-titres plus tôt / plus tard',
  scAudioDelay: 'Piste audio plus tôt / plus tard',
  scSpeed: 'Vitesse de lecture − / + 0,25×',
  scMute: 'Couper / réactiver le son',
  scScreenshot: 'Capture d’écran',
  resetSpeed: 'Revenir à la vitesse normale (×1)',
  // Updater (#63)
  updateAvailable: 'Version {version} disponible — cliquez pour installer',
  updateReady: 'Mise à jour installée. Redémarrer maintenant ?',
  updateRestart: 'Redémarrer',
  updateInstalling: 'Téléchargement de la mise à jour…',
  updateCheckFailed: 'Vérification de mise à jour impossible : {err}',
  errRestart: 'Impossible de redémarrer l’application.',
  // Language (#64)
  language: 'Langue',
  // Settings menu
  settingsTitle: 'Réglages',
  keepSpeed: 'Garder la vitesse de lecture entre les fichiers',
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
  track: 'Track {id}',
  queueTitle: 'Queue ({count})',
  shuffle: 'Shuffle',
  repeat: 'Repeat queue',
  emptyQueue: 'Queue empty — drop some videos',
  clearQueue: 'Clear queue',
  removeItem: 'Remove {name}',
  chapter: 'Chapter',
  errLoad: 'Cannot play this file: {err}',
  dialogTitle: 'Open a video',
  dialogFilterName: 'Video',
  errInitEngine: 'The playback engine (mpv) could not start. Restart the app; if it persists, reinstall it.',
  errInitialFile: 'Could not open the initial file.',
  errRecentOpen: 'Could not open this file.',
  errPlaylistBad: 'The playback queue is unavailable.',
  errSettingsOpen: 'Could not open the Windows settings.',
  errFullscreenBad: 'Fullscreen is not available for this window.',
  errDialogBad: 'The file picker could not be opened. Try again.',
  errSubtitlesBad: 'Subtitles are unavailable for this file.',
  errSelectSubBad: 'Could not select this subtitle.',
  errDisableSubBad: 'Could not disable subtitles.',
  errSelectAudioBad: 'Could not select this audio track.',
  errTrackBad: 'This track is not available.',
  errUnreadable: 'The file is missing, unreadable, or in an unsupported format.',
  errInitSlow: 'Player initialization is too slow: cannot open the file.',
  errFileNotFound: 'File not found or inaccessible.',
  errPermission: 'Access to the file denied — check read permissions.',
  errFormat: 'Unrecognized format or corrupt file — cannot open this file.',
  errCommand: 'The video player could not start playing this file.',
  errCorrupt: 'Playback stopped on an error — the file may be corrupt or incomplete.',
  screenshotTaken: 'Screenshot saved: {path}',
  screenshotFailed: 'Screenshot failed: {err}',
  playbackSpeed: 'Playback speed: ×{value}',
  volumeLabel: 'Volume',
  kbdSpace: 'Space',
  helpTitle: 'Shortcuts',
  helpHint: 'Press Escape to close',
  scPlayPause: 'Play / Pause',
  scSeek: 'Seek ±10 s',
  scVolume: 'Volume +5 / −5',
  scFullscreen: 'Fullscreen',
  scSubDelay: 'Subtitles earlier / later',
  scAudioDelay: 'Audio track earlier / later',
  scSpeed: 'Playback speed − / + 0.25×',
  scMute: 'Mute / unmute',
  scScreenshot: 'Screenshot',
  resetSpeed: 'Reset to normal speed (×1)',
  updateAvailable: 'Version {version} available — click to install',
  updateReady: 'Update installed. Restart now?',
  updateRestart: 'Restart',
  updateInstalling: 'Downloading the update…',
  updateCheckFailed: 'Update check failed: {err}',
  errRestart: 'Could not restart the application.',
  language: 'Language',
  // Settings menu
  settingsTitle: 'Settings',
  keepSpeed: 'Keep playback speed between files',
}

// Exported for the placeholder-parity test (the catalogs are plain data;
// there is nothing behaviorally private in them).
export const CATALOGS: Record<Locale, Record<MessageKey, string>> = { fr, en }

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
