# Libre Media Player

Lecteur vidéo de bureau libre et gratuit. Le moteur de lecture est
[mpv](https://mpv.io/), embarqué via
[`tauri-plugin-libmpv`](https://github.com/nini22P/tauri-plugin-libmpv) :
à peu près tout ce que mpv lit est lu nativement (HEVC/x265, HDR, MKV,
AV1, ...), contrairement à un simple `<video>` HTML limité aux codecs
de la WebView.

## Philosophie

- **Libre** : code ouvert (MIT), sans télémétrie, sans compte, sans
  publicité, sans obligation — vos vidéos restent chez vous.
- **Simple** : on ouvre, on regarde, c'est tout. Pas d'écran d'accueil,
  pas de bibliothèque à indexer, pas de modes « premium ».
- **Capable** : quand mpv sait lire le format, il est lu — point.
  Le lecteur s'efforce de « juste marcher » plutôt que d'exposer
  chaque réglage.
- **Léger** : pas de dépendances exotiques, pas de service en
  arrière-plan ; l'application se ferme quand on la ferme.

## Linux (roadmap — issue #62)

La stack Tauri étant portable, le code compile sur Linux avec le `libmpv`
système :

```bash
# Debian/Ubuntu : dépendances natives
sudo apt-get install -y libglib2.0-dev libgtk-3-dev \
  libwebkit2gtk-4.1-dev libmpv-dev libmpv2
npm install
npm run tauri build -- --debug    # produit AppImage/deb (bundle.targets: all)
```

L'association de fichiers est déclarée via `bundle.fileAssociations[].mimeType`
(desktop entry + MIME types installés par Tauri). Le packaging AppImage/deb
est encore en cours de validation sur les distributions cibles (le job
CI `linux-bundles` compile deb + AppImage à chaque push sur main, voir
`docs/RELEASE.md`).

## Mise à jour automatique (roadmap — issue #63)

`tauri-plugin-updater` est intégré : l'application vérifie à chaque
démarrage la présence d'un `latest.json` dans la dernière release GitHub
et propose l'installation en un clic. **Attention** : la clé publique
(`plugins.updater.pubkey` dans `src-tauri/tauri.conf.json`) est vide
pour l'instant — la vérification des signatures sera activée dès que
les artifacts seront signés (minisign) par le workflow de release
(`docs/RELEASE.md` détaille le pipeline et les étapes restantes).

## Installation depuis les sources

```bash
npm install
npx tauri-plugin-libmpv-api setup-lib   # télécharge libmpv-2.dll + le wrapper dans src-tauri/lib/
npm run tauri build -- --debug          # ou : npm run tauri dev
```

Les DLL natives (`src-tauri/lib/`) ne sont pas versionnées (trop
lourdes, ~100 Mo) — `setup-lib` les retélécharge à chaque nouveau clone.

## Stack

- Frontend : React 19 + TypeScript, Vite 8
- Backend : Tauri 2, `tauri-plugin-libmpv` (lecture vidéo),
  `tauri-plugin-dialog` (sélection de fichier)
- La fenêtre est transparente ; mpv compose sa surface vidéo
  nativement derrière la WebView, les contrôles HTML flottent
  par-dessus en overlay.

## Association de fichiers Windows

Libre Media Player s'enregistre comme candidat valide pour
.mp4/.mkv/.avi/.mov/.webm/.m4v/.flv/.wmv/.ts/.mpg/.mpeg, via deux
mécanismes complémentaires (détail et raisons dans
`src-tauri/windows/hooks.nsh`) :

- `bundle.fileAssociations` (tauri.conf.json) — déclare les extensions ;
  Tauri écrit l'association « legacy » par extension
  (`HKCU\...\Classes\<ext>`).
- Un hook NSIS custom (`installerHooks`) ajoute l'enregistrement
  « Default Programs » de Windows (`RegisteredApplications` +
  `Software\Clients\Media\Libre Media Player\Capabilities`) — sans lui,
  l'application n'apparaît pas comme choix proposé dans
  Paramètres > Applications par défaut (vérifié : Tauri seul ne couvre
  pas cette couche sur NSIS).

**Limitation Windows (pas un bug de l'application)** : depuis Windows 10,
aucune application ne peut définir par programmation l'application par
défaut d'un type de fichier (protégé par un hash anti-malware côté OS ;
voir Microsoft Learn, « Default apps platform »). L'installateur rend
donc Libre Media Player *sélectionnable*, mais le choix final se confirme
via Paramètres Windows > Applications > Applications par défaut (ou le
menu « Ouvrir avec » de l'Explorateur) — aucun installateur, VLC compris,
ne peut faire autrement.

## Développement

Template de base : React + TypeScript + Vite (voir
[vite.dev](https://vite.dev) pour les options HMR/lint génériques).
