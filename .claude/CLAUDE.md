# Conventions Git

Complète le `CLAUDE.md` à la racine (produit, commandes, règles de code).

## Branches

- Nom de la forme `type/nom-court`, d'après le travail en cours, en anglais et en kebab-case : `feat/settings-subtabs`, `fix/exa-key-status`, `chore/auto-deploy`, `docs/deploy-guide`.
- Types : `feat` (fonctionnalité), `fix` (correction), `chore` (outillage, CI, dépendances), `docs` (documentation), `refactor` (sans changement de comportement).
- Jamais de nom généré ni de préfixe d'outil (`ccr-…`, `claude/…`).
- Une branche par sujet : un nouveau sujet part de `main` à jour, sur une nouvelle branche.

## Commits

- Auteur et committer : `Geoffrey Crofte <452767+geoffreycrofte@users.noreply.github.com>`. Le régler dans le dépôt avant le premier commit :

  ```sh
  git config user.name "Geoffrey Crofte"
  git config user.email "452767+geoffreycrofte@users.noreply.github.com"
  ```

- Pas de ligne `Co-Authored-By` dans les messages de commit.
- Messages en anglais : un titre court à l'impératif, puis le pourquoi dans le corps.

## Pull requests

- Pas de mention « Generated with Claude Code » ni de lien de session dans la description d'une PR ou dans un commentaire.
