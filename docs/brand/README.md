# Identité de Pann

## Logo

**La pépite seule**, choisie le 2026-11-13 (`docs/DECISIONS.md`) : la pépite d'or taillée en facettes, avec un éclat en haut à droite. Pas de fond, pas de coussin : l'or porte toute l'identité.

Sources et exports dans `logo/` :

| Fichier                                    | Usage                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `pann-mark.svg`, `pann-mark-512.png`       | Symbole seul, fond transparent, éclat encre : sur fond clair              |
| `pann-mark-dark.svg`, `-dark-512.png`      | Symbole seul, éclat crème : sur fond sombre                               |
| `pann-logo.svg`, `pann-logo.png`           | Logo complet (symbole + « Pann » vectorisé), encre : sur fond clair       |
| `pann-logo-dark.svg`, `pann-logo-dark.png` | Logo complet, texte crème : sur fond sombre                               |
| `pann-icon.svg`, `pann-icon-1024.png`      | Icône d'app, tuile encre (version par défaut)                             |
| `pann-icon-light.svg`, `-light-1024.png`   | Icône d'app, tuile sable                                                  |
| `pann-icon-square.svg`                     | Tuile pleine sans arrondi, pour iOS (le système arrondit)                 |
| `pann-icon-maskable.svg`                   | Tuile pleine, contenu réduit à la zone sûre (Android, `maskable`)         |
| `pann-favicon.svg`                         | Favicon : pépite agrandie, trois facettes, sans éclat (illisible à 16 px) |

Le mot « Pann » des logos complets est vectorisé depuis Bricolage Grotesque 800, interlettrage -0,035 em : aucun besoin de la police pour les afficher.

Dans l'app (`apps/board/public/`) : `favicon.svg` et `favicon.ico` (16, 32 et 48 px), `apple-touch-icon.png` (180 px, tuile pleine), `icon-192.png` et `icon-512.png` (tuile arrondie), `icon-maskable-512.png`, déclarées dans `index.html` et `manifest.webmanifest`. Les PNG sont rendus depuis les SVG avec Chromium.

- Composant `apps/board/src/components/PannMark.vue` (décoratif, `aria-hidden`), toujours accompagné du nom « Pann » en texte. L'éclat prend la couleur du texte (`currentColor`) : encre en clair, crème en sombre ou sur la barre latérale.
- Or réservé à la pépite.
- Nom : Bricolage Grotesque, graisse 800, interlettrage serré.

Historique : la batée vue de dessus (2026-10-02, `logo-explorations.png`, `pann-brand-sheet.png`) a été remplacée, trop détaillée et pas assez imagée. Pistes écartées en 2026-11 : la pépite dans un écrin, sur un présentoir, en trait d'encre, enfoncée dans un coussin.

## Couleurs

| Rôle                                | Clair                 | Sombre                |
| ----------------------------------- | --------------------- | --------------------- |
| Fond                                | `#f7f0e2` crème       | `#0e0e0f`             |
| Cartes                              | `#ffffff`             | `#19191b`             |
| Encre (barre latérale, texte)       | `#141414` / `#18160f` | `#050505` / `#f4f1e8` |
| Or vif (aplats, boutons principaux) | `#ffc72c`             | `#ffc72c`             |
| Or foncé (liens, texte doré)        | `#7a5800`             | `#ffc72c`             |
| Or pâle (bandeaux, scores moyens)   | `#fff1c2`             | `#2e2610`             |

Palette des illustrations (page d'accueil), tirée des scènes 3D. Chaque scène existe aussi détourée (`*-cut-*.webp`) pour le thème sombre et les sections colorées :

| Rôle                                  | Clair     | Sombre    |
| ------------------------------------- | --------- | --------- |
| Sable (fond des sections illustrées)  | `#f8ecd7` | `#1b1813` |
| Fond de la scène du héros             | `#fbecd3` | `#1b1813` |
| Fond de la scène du budget            | `#faedda` | `#1b1813` |
| Olive (aplat, texte `#f8ecd7` dessus) | `#48542a` | `#48542a` |
| Bois (décoratif : rail des étapes)    | `#8b4e2b` | `#8b4e2b` |

Règles : l'or vif est un **aplat** avec du texte encre dessus, jamais une couleur de texte sur fond clair. Tous les couples texte/fond sont vérifiés par `apps/board/scripts/check-contrast.mjs` (`pnpm test`).

## Typographies

Hébergées avec l'app (paquets `@fontsource-variable`), aucun appel à un service tiers :

- **Bricolage Grotesque** : titres, nom de la marque, chiffres mis en avant.
- **Plus Jakarta Sans** : texte courant, formulaires.

## Formes

Cartes à grand rayon (20 px), boutons et pastilles en pilule, ombres très douces. La page courante et l'onglet actif ne reposent jamais sur la seule couleur : remplissage, graisse et `aria-current` / `aria-selected`.
