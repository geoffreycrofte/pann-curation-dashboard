# CLAUDE.md

Pann : outil de curation de veille multi-thèmes. Contexte produit : `docs/CONTEXT.md`. Choix techniques : `docs/DECISIONS.md` (ajouter une entrée pour toute décision structurante).

## Commandes

- `pnpm typecheck`, `pnpm test`, `pnpm format:check` : à faire passer avant tout commit.
- `pnpm db:reset` : rejoue migrations + seed sur la stack locale.
- `pnpm dev:api` / `pnpm dev:board`.

## Règles

- Aucun thème codé en dur : tout ce qui est propre à un sujet va dans `topics.config` (schéma : `packages/shared/src/topic-config.ts`).
- Code, tables, statuts et API en vocabulaire technique neutre (`items`, `validated`). La métaphore de l'orpaillage ne vit que dans les traductions du board.
- Tout libellé d'interface passe par `apps/board/src/i18n/fr.ts` et `en.ts` (FR est la référence de typage).
- Multi-tenant : toute nouvelle table exposée aux utilisateurs a la RLS activée et une politique basée sur `private.is_member` / `private.can_access_topic`.
- Les jobs utilisent la clé secrète ; les requêtes utilisateur, jamais.
- Toute modification des transitions de statut se fait à la fois dans `packages/shared/src/status.ts` et dans le trigger SQL `private.check_item_topic_transition`.
- Migrations : nouveau fichier horodaté dans `supabase/migrations/`, ne jamais modifier une migration déjà appliquée en production.
- Accessibilité : le board doit être exemplaire (WCAG 2.2 AA). Nouvelles couleurs = nouveaux tokens dans `tokens.css`, ajoutés au contrôle de `scripts/check-contrast.mjs`.
- Français : pas de tiret cadratin, espace insécable avant `! ? : ;`, pas de point médian.
- Ne jamais deviner une URL de flux RSS ni un identifiant de modèle : vérifier.
