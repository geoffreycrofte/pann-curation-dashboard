---
name: ui-review
description: Revue d'ergonomie et de style du board, page par page (cohérence graphique, hiérarchie de l'information, accessibilité), avec captures avant/après. À utiliser pour auditer une ou plusieurs vues du board ou vérifier visuellement un changement d'interface.
---

# Revue d'ergonomie et de style du board

Complète les règles du `CLAUDE.md` (tokens, i18n, typographie, WCAG 2.2 AA).

## 1. Captures

1. Lancer le board sans API réelle :
   ```sh
   cd apps/board && VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_PUBLISHABLE_KEY=dummy npx vite --port 5199 --strictPort
   ```
   (en arrière-plan).
2. Capturer toutes les pages, sur ordinateur (1280 px) et sur mobile (iPhone 13), avec une API simulée et des données réalistes :
   ```sh
   node .claude/skills/ui-review/shots.cjs .claude/skills/ui-review http://localhost:5199 <dossier> [page,page]
   ```
   Les captures vont dans `<dossier>` (le scratchpad, jamais le dépôt), nommées `<page>-desk.png` et `<page>-mob.png`. Ajouter une page ou une donnée dans `shots.cjs` quand une vue manque.
3. Pour un avant/après, capturer `before/` sur `main`, puis `after/` sur la branche, avec les mêmes données.

Un champ vide ou une liste vide peut venir des données simulées : vérifier dans `shots.cjs` avant d'en faire un constat.

## 2. Grille de lecture, par page

- **Premier regard** : qu'est-ce qui attire l'œil ? Est-ce l'action ou l'information principale de la page ?
- **Hiérarchie** : ordre de lecture, une seule action principale (bouton `primary`) par vue ou par formulaire, le secondaire en retrait (`.hint`, couleur `--color-text-muted`, `data-size="small"`).
- **Cohérence** : mêmes motifs d'un écran à l'autre :
  - en-tête de page `.page-head` (titre et action de la page) ;
  - cartes avec le liseré de leur type de contenu (`--color-kind-*`) ;
  - badges `.badge[data-tone][data-dot]` pour les états ;
  - `.notice` pour les avertissements ;
  - boutons pilule, `danger` pour supprimer.
- **Espacement et rythme vertical** :
  - espaces pris dans l'échelle `--space-*` ;
  - plus d'espace entre deux groupes qu'à l'intérieur d'un groupe ;
  - pas de grand vide dans une carte ;
  - icône et texte alignés sur la même ligne ;
  - une aide collée à ce qu'elle explique ;
  - padding de carte constant (`.block`), resserré pour une carte d'état.
- **Ergonomie** : nombre d'étapes et de défilement pour l'action principale. Les aides sont placées sous leur champ et reliées par `aria-describedby`. Pas de bouton désactivé sans explication.
- **Accessibilité** :
  - contraste des tokens (`scripts/check-contrast.mjs`) ;
  - cibles de 24 px au moins (36 à 44 px dans le board) ;
  - liens soulignés ;
  - état jamais porté par la couleur seule ;
  - focus visible ;
  - ordre de lecture identique à l'ordre visuel.

Pour chaque constat : la page, l'élément, le problème, pourquoi, et la correction en termes de classes et de tokens du board. Dire aussi ce qui marche.

## 3. Restitution

- Un tableau des constats transverses (sévérité haute, moyenne ou basse), puis 2 à 5 constats par page.
- Les pages à reprendre en priorité, avec un plan avant/après.
- Après correction, captures avant/après recadrées sur la zone changée, envoyées à Geoffrey.

## 4. Mise en œuvre

- Nouvelles couleurs : tokens dans `tokens.css`, ajoutés au contrôle de contraste.
- Un motif réutilisable va dans `styles/base.css` (ex. `.page-head`), pas dans un composant.
- Attention aux styles `scoped` : une règle de `.block` placée plus bas écrase une bordure posée avant. Préférer `.block.ma-classe`.
- Vérifier au clavier et en lecteur d'écran (libellés cachés, `aria-*`) ce qui change d'ordre ou de forme.
