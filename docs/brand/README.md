# Identité de Pann

## Logo

`pann-mark.svg` : une **batée** (la poêle de l'orpailleur) vue de trois quarts, inclinée comme dans le geste du lavage, avec une **pépite** posée dans le sable mouillé. Le remous de l'eau et les grains qui s'échappent par le bord disent ce que fait Pann : beaucoup de collecte, peu de sélection.

- Tuile noir d'encre, batée et pépite en or. Lisible jusqu'à 16 px (favicon).
- Dans l'app : composant `apps/board/src/components/PannMark.vue` (décoratif, `aria-hidden`), toujours accompagné du nom « Pann » en texte.
- Nom : Bricolage Grotesque, graisse 800, interlettrage serré.

## Couleurs

| Rôle                                | Clair                 | Sombre                |
| ----------------------------------- | --------------------- | --------------------- |
| Fond                                | `#f6f3ea` crème       | `#0e0e0f`             |
| Cartes                              | `#ffffff`             | `#19191b`             |
| Encre (barre latérale, texte)       | `#141414` / `#18160f` | `#050505` / `#f4f1e8` |
| Or vif (aplats, boutons principaux) | `#ffc72c`             | `#ffc72c`             |
| Or foncé (liens, texte doré)        | `#7a5800`             | `#ffc72c`             |
| Or pâle (bandeaux, scores moyens)   | `#fff1c2`             | `#2e2610`             |

Règles : l'or vif est un **aplat** avec du texte encre dessus, jamais une couleur de texte sur fond clair. Tous les couples texte/fond sont vérifiés par `apps/board/scripts/check-contrast.mjs` (`pnpm test`).

## Typographies

Hébergées avec l'app (paquets `@fontsource-variable`), aucun appel à un service tiers :

- **Bricolage Grotesque** : titres, nom de la marque, chiffres mis en avant.
- **Plus Jakarta Sans** : texte courant, formulaires.

## Formes

Cartes à grand rayon (20 px), boutons et pastilles en pilule, ombres très douces. La page courante et l'onglet actif ne reposent jamais sur la seule couleur : remplissage, graisse et `aria-current` / `aria-selected`.
