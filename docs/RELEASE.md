# Release / mise à jour automatique

Ce document décrit le pipeline de release de bout en bout et les étapes
restantes **avant la première release publique** (identifiées par l'audit
du projet).

## Pipeline actuel

1. **release-please** (`.github/workflows/release-please.yml`) : bump de
   version (`package.json`, `tauri.conf.json`, `Cargo.toml`) + CHANGELOG
   via une PR de release ; au merge, il crée le tag et la GitHub Release.
2. **build-release** (`.github/workflows/build-release.yml`) : déclenché
   par la publication de la release. Compile l'installateur NSIS Windows,
   le **signe pour l'updater** (minisign) et attache `latest.json`
   (manifest de mise à jour consommé par `tauri-plugin-updater`).
3. **CI** (`.github/workflows/ci.yml`) : jobs `frontend`, `rust`,
   `rust-windows`, `windows-installer` (NSIS à chaque push sur main) et
   `linux-bundles` (deb/AppImage, non bloquant sur PR).

## Étapes restantes avant la première release publique

### 1. Générer la clé minisign de l'updater

L'updater exige une paire de clés minisign ; la clé publique doit figurer
dans `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`, **vide
pour l'instant**) et la clé privée dans les secrets du dépôt.

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/lmp.key
```

Puis :

- Secrets GitHub à configurer (Settings > Secrets > Actions) :
  - `TAURI_SIGNING_PRIVATE_KEY` — contenu du fichier `.key`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — phrase secrète (peut être vide,
    mais le secret doit exister)
- Copier la **clé publique** (`.key.pub`) dans
  `plugins.updater.pubkey` de `src-tauri/tauri.conf.json`.

⚠️ La clé privée ne doit jamais être committée. Si la clé est perdue, les
installations existantes ne pourront plus se mettre à jour — gardez une
copie hors ligne.

### 2. Couper la première release

Le workflow `build-release` **échoue volontairement** si les secrets ne
sont pas configurés : mieux vaut une release rouge qu'un updater cassé.

Une fois les secrets en place, merger une PR de release-please suffit :

```bash
# optionnel : tout vérifier comme en CI avant
npm run lint && npm run check:consistency && npm test && npm run build
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

release-please taggue (`vX.Y.Z`), `build-release` signe et attache les
artefacts + `latest.json`, et l'updater des installations existantes
résout `releases/latest/download/latest.json`.

### 3. Valider le packaging Linux

Le job `linux-bundles` produit un deb + AppImage à chaque push sur main
(artefact `linux-bundles`). Avant d'annoncer le support Linux :

- installer le deb/AppImage sur Debian/Ubuntu cibles et vérifier
  l'association de fichiers (desktop entry + MIME types) ;
- vérifier la lecture réelle avec le `libmpv` système ;
- décider si ces artefacts sont publiés dans les releases (aujourd'hui
  seul l'installateur Windows l'est).

## Ce qui est déjà en place

- `tauri-plugin-updater` intégré (backend + `useAppPrefs` côté front),
  endpoint `latest.json` configuré, vérification au démarrage.
- Job CI `windows-installer` : l'installateur NSIS est compilé à chaque
  push sur main — le pipeline de build de release est donc validé en
  amont ; seule la signature/publication reste à activer.
