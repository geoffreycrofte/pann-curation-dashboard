# Identité de Pann

## Logo

Deux déclinaisons, choisies le 2026-10-02 parmi quatre pistes (`logo-explorations.png`) :

- **Logo et icône d'app** (`pann-mark.svg`, piste D) : la **batée vue de dessus**, sombre, avec le remous de l'eau, quelques grains de sable, et la **pépite** dorée qui reste au fond, avec son éclat. L'or est réservé à la pépite.
- **Favicon** (`pann-favicon.svg`, piste A) : la **pépite seule** avec son éclat et quelques grains, plus lisible à 16 px que la batée.

Icônes d'app générées depuis `pann-mark.svg` : `apps/board/public/apple-touch-icon.png` (180 px), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (fond plein, la plateforme arrondit), déclarées dans `manifest.webmanifest`.

Pistes écartées : la batée en perspective avec une pépite cubique (une poêle avec du beurre), le tamis (un panier), le monogramme P.

- Tuile noir d'encre, or réservé à la pépite.
- Dans l'app : composant `apps/board/src/components/PannMark.vue` (décoratif, `aria-hidden`), toujours accompagné du nom « Pann » en texte.
- Nom : Bricolage Grotesque, graisse 800, interlettrage serré.

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
