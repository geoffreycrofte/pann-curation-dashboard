# CLAUDE.md

Pann : outil de marketing par thème. Un thème est un produit ou un sujet à faire connaître, avec deux outils activables (`topics.config.modules`) : curation de veille et engagement (conversations où aider). Contexte produit : `docs/CONTEXT.md`. Choix techniques : `docs/DECISIONS.md` (ajouter une entrée pour toute décision structurante).

## Commandes

- `pnpm typecheck`, `pnpm test`, `pnpm format:check` : à faire passer avant tout commit.
- `pnpm db:reset` : rejoue migrations + seed sur la stack locale.
- `pnpm configure` (une fois), puis `pnpm dev` : API et board ensemble.

## Règles

- Aucun thème codé en dur : tout ce qui est propre à un sujet va dans `topics.config` (schéma : `packages/shared/src/topic-config.ts`).
- Les prompts IA ne contiennent que le fonctionnement de l'outil (ancrage dans la source, format de sortie, limites techniques). Style, ton, typographie, vocabulaire, règles propres à un thème : réglages de l'utilisateur (`ai.relevance_criteria`, `ai.editorial_rules`, `ai.style_rules`, `ai.post_rules`), jamais en dur. Penser SaaS : ce qui varie d'un utilisateur à l'autre se règle dans l'app.
- Les règles de typographie française ci-dessous valent pour les textes de l'interface, pas pour les contenus générés.
- Code, tables, statuts et API en vocabulaire technique neutre (`items`, `validated`). La métaphore de l'orpaillage ne vit que dans les traductions du board.
- Tout libellé d'interface passe par `apps/board/src/i18n/fr.ts` et `en.ts` (FR est la référence de typage).
- Multi-tenant : toute nouvelle table exposée aux utilisateurs a la RLS activée et une politique basée sur `private.is_member` / `private.can_access_topic`.
- Les jobs utilisent la clé secrète ; les requêtes utilisateur, jamais directement. Une requête utilisateur peut déclencher un job (`waitUntil`) après avoir prouvé, via la RLS, que l'utilisateur a accès à la ressource.
- Les clés des services externes sont par workspace, réglées dans l'app (page Connexions, Supabase Vault). Jamais de clé de service dans les variables d'environnement : seules les clés Supabase y figurent (`pnpm configure`).
- Les erreurs renvoyées par l'API et stockées en base sont des codes (`packages/shared/src/providers.ts`), traduits par le board (`errors.*`).
- Toute modification des transitions de statut se fait à la fois dans `packages/shared/src/status.ts` et dans le trigger SQL `private.check_item_topic_transition`.
- Migrations : nouveau fichier horodaté dans `supabase/migrations/`, ne jamais modifier une migration déjà appliquée en production.
- Accessibilité : le board doit être exemplaire (WCAG 2.2 AA). Nouvelles couleurs = nouveaux tokens dans `tokens.css`, ajoutés au contrôle de `scripts/check-contrast.mjs`.
- Français : pas de tiret cadratin, espace insécable avant `! ? : ;`, pas de point médian.
- Ne jamais deviner une URL de flux RSS ni un identifiant de modèle : vérifier.
