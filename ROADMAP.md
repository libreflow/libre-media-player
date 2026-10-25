# Roadmap

La roadmap est pilotée par les [milestones](https://github.com/libreflow/libre-media-player/milestones)
et les issues du dépôt ; ce fichier en donne la vue d'ensemble.
Toute proposition doit respecter la philosophie du projet (voir
[README](README.md)) : libre, simple, capable, léger — pas de télémétrie,
pas de compte, pas de bibliothèque à indexer.

## 1. Qualité & robustesse

Consolidation : tests, accessibilité, performance, edge cases de
lecture. Fondations avant nouvelles fonctionnalités.

- #55 — Plein écran natif : indépendant de l'overlay HTML et toujours opérationnel
- #56 — Accessibilité : navigation clavier complète et lecteurs d'écran (ARIA)
- #57 — Robustesse : gestion des fichiers corrompus et formats exotiques

## 2. Confort de lecture

Améliorations centrées utilisateur : audio, sous-titres, capture
d'écran, ergonomie des contrôles.

- #58 — Audio : sélection de piste, délai et préférence de langue
- #59 — Sous-titres : décalage fin et détection automatique des fichiers .srt externes
- #60 — Capture d'écran (frame actuelle) vers PNG
- #61 — Ergonomie : chapitres et aperçu temporel sur la SeekBar

## 3. Portabilité & distribution

Au-delà de Windows : Linux/macOS, packaging, mise à jour
automatique, i18n.

- #62 — Portage Linux (AppImage/deb)
- #63 — Mise à jour automatique (tauri-plugin-updater)
- #64 — Internationalisation (i18n) : structure traduisible de l'UI

## Priorisation

1. **Qualité & robustesse** d'abord : un lecteur qui « juste marche »
   prime sur toute nouveauté.
2. **Confort de lecture** ensuite : les fonctionnalités mpv les plus
   demandées (sous-titres externes, capture, chapitres).
3. **Portabilité & distribution** enfin : élargir l'audience une fois
   la base solide.

Les contributions sont bienvenues (voir
[CONTRIBUTING](CONTRIBUTING.md)) ; ouvrez une issue avant une PR
de fonctionnalité pour valider l'alignement avec la philosophie du
projet.
