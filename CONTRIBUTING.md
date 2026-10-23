# Contribuer à Libre Media Player

Merci de vouloir contribuer ! Le projet est volontairement **minimaliste** :
lire des vidéos, simplement, sans télémétrie ni réglages exotiques.
Avant de proposer une fonctionnalité, vérifiez qu'elle respecte cette
philosophie (voir le README).

## Démarrage

```bash
npm install
npx tauri-plugin-libmpv-api setup-lib   # télécharge libmpv + le wrapper (requis)
npm run tauri dev
```

## Cycle de développement

1. Créez une branche depuis `main` (`fix/...` ou `feat/...`).
2. Faites vos changements avec des tests quand c'est pertinent
   (les corrections de bugs doivent idéalement venir avec un test
   de régression).
3. Vérifiez localement, **tout doit passer** :

```bash
npm run lint               # oxlint : 0 erreur, 0 warning
npm run check:consistency  # cohérence extensions/ProgIds/version
npm run build              # tsc + vite build
npm test                   # vitest
```

Si vous touchez `src-tauri` :

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

4. Ouvrez une PR. La CI rejoue ces vérifications sur Linux **et**
   Windows (le vrai objectif du produit).

## Conventions de commit

Les commits suivent [Conventional Commits](https://www.conventionalcommits.org/fr/)
(`fix:`, `feat:`, `ci:`, `docs:`...) — la versioning et le CHANGELOG sont
automatisés par release-please à partir de ces préfixes.

## Signaler un bug

Ouvrez une issue via le template « Signaler un bug » : version de
l'application, OS, format du fichier si pertinent, étapes de reproduction.
