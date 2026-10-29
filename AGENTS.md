# AGENTS.md — libre-media-player

Lecteur vidéo desktop libre basé sur **mpv**, construit avec **Tauri 2** (Rust) + **React 19 / TypeScript**. UI en français. Cible de distribution actuelle : **Windows uniquement** (hooks NSIS, DLL wrapper mpv, winreg pour les apps par défaut).

## Commandes

- Dev : `npm run tauri dev`
- Build prod : `npm run tauri build`
- Lint front : `npm run lint` (oxlint — 0 erreur, 0 warning exigé)
- Tests front : `npm test` (vitest)
- Cohérence : `npm run check:consistency`
- Rust (`src-tauri/`) : `cargo check`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`

Avant toute PR, tout doit passer exactement comme en CI (`.github/workflows/ci.yml`) : jobs `frontend`, `rust` et `rust-windows`.

## Architecture

- `src/` : front React (composants, hooks, styles)
- `src-tauri/src/` : backend Rust (commandes IPC, intégration mpv)
- `src-tauri/capabilities/` : capabilities Tauri 2
- `src-tauri/tauri.conf.json` : configuration fenêtre/bundle
- `scripts/check-consistency.mjs` : contrôles de cohérence projet

## Règles Tauri 2 strictes

- Toute commande IPC doit être une `async fn` **et** déclarée dans `generate_handler!` (`src-tauri/src/lib.rs`). Une commande synchrone fige l’UI ; une commande non déclarée provoque « command not found ».
- **Capabilities au moindre privilège** : ne jamais élargir `permissions` ni introduire de permission générique (wildcard) sans justification explicite dans la PR.
- Ne pas modifier `tauri.conf.json` sans accord explicite du propriétaire.
- Privilégier les plugins existants (dialog, fs, opener, log, single-instance, libmpv) plutôt que du code custom équivalent.

## Sécurité

- Jamais de secret ni de clé d’API dans le code committé (front ou Rust).
- Auditer chaque nouvelle dépendance (npm ou crate) avant de l’ajouter — justifier son utilité dans la PR.

## Workflow attendu des agents

- Une tâche = une issue = une PR petite et focalisée.
- Remplir toutes les sections de `.github/PULL_REQUEST_TEMPLATE.md`.
- Merger automatiquement uniquement les PR mineures (typos, doc, petites corrections) une fois la CI verte.
- Ne jamais merger de changements importants ni supprimer de fichiers sans accord explicite du propriétaire.
- Tester manuellement (`npm run tauri dev`) avant toute release.
