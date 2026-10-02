# Pann

Outil de curation de veille multi-thèmes : collecter, trier, valider, diffuser.
Content curation tool: collect, triage, validate, publish.

Le contexte produit complet est dans [`docs/CONTEXT.md`](docs/CONTEXT.md), les choix techniques dans [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Structure

```
apps/
  api/        Worker Cloudflare (Hono) : API sous /api/*, crons et queues à venir.
              Sert aussi le board en assets statiques (une seule origine).
  board/      Board de tri (Vue 3, Vite, Reka UI, Pinia Colada, vue-i18n FR/EN).
packages/
  shared/     Types de domaine, schéma de config d'un topic, normalisation d'URL,
              règles de transition de statut. Utilisé par l'API et le board.
supabase/
  migrations/ Schéma Postgres multi-tenant + RLS + garde-fous de curation.
  seed.sql    Données locales : utilisateur dev@pann.local, topic « accessibilité ».
```

## Démarrer en local

Prérequis : [Node.js 22](https://nodejs.org) ou plus récent. Ensuite, dans un terminal, à la racine du projet :

```sh
corepack enable     # une seule fois : active pnpm, fourni avec Node.js
pnpm install        # installe les dépendances
pnpm configure      # une seule fois : 3 questions sur votre projet Supabase
pnpm dev            # démarre l'app
```

Ouvrez ensuite http://127.0.0.1:5173 et connectez-vous avec votre adresse e-mail (lien magique).

`pnpm configure` explique où trouver chaque information dans le tableau de bord Supabase. Côté Supabase (Authentication, URL Configuration), l'URL du site et les URL de redirection doivent contenir `http://127.0.0.1:5173`.

**Tout le reste se règle dans l'app :**

- **Connexions** : les clés Anthropic, Exa et GitHub, avec pour chacune l'explication de l'endroit où la créer. Les clés sont chiffrées dans Supabase (Vault) et ne sont jamais réaffichées.
- **Sources** (dans chaque thème) : ajout de flux RSS, et bouton « Collecter maintenant » pour voir le résultat tout de suite, sans attendre le passage automatique.
- **Réglages** (dans chaque thème) : fréquence de collecte par type de contenu.

### Pour aller plus loin

- Stack Supabase entièrement locale (Docker) : `pnpm db:start`, puis `pnpm configure` avec l'adresse `http://127.0.0.1:54321` et les clés affichées par `pnpm exec supabase status`. Utilisateur de test : `dev@pann.local` (lien de connexion dans Mailpit, adresse donnée par `supabase status`).
- Passage automatique de collecte (toutes les heures en production) déclenché à la main : `pnpm --filter @pann/api collect:local` pendant que `pnpm dev` tourne.

## Vérifications

```sh
pnpm typecheck
pnpm test          # tests unitaires + contrôle des contrastes des tokens de couleur
pnpm format:check
pnpm db:reset      # rejoue toutes les migrations et le seed
```

## MCP Supabase (poste local)

`.mcp.json` déclare le serveur MCP Supabase du projet. Dans un terminal : `claude /mcp`, choisir `supabase`, puis « Authenticate ».

## Déploiement

Workflow manuel `Deploy` (GitHub Actions) : `supabase db push`, build du board, `wrangler deploy`.
À configurer une fois :

- Secrets GitHub : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Variables GitHub : `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
- Secrets du Worker : `wrangler secret put` pour `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY`. Les clés des services se règlent dans l'app (Connexions).
- Files de tâches (une fois) : `wrangler queues create pann-jobs` et `wrangler queues create pann-jobs-dlq`.
- Supabase Auth (projet distant) : désactiver les inscriptions publiques, inviter son adresse, définir l'URL du site et les URLs de redirection.
- Serveur MCP (Claude) : dans Supabase, Authentication, puis OAuth Server : activer le serveur OAuth, activer l'enregistrement dynamique des clients, et régler l'Authorization Path sur `/oauth/consent`. L'URL du site (Authentication, URL Configuration) doit être celle de Pann en ligne : la page de consentement s'y trouve. Dans Claude : Paramètres, Connecteurs, connecteur personnalisé, adresse `https://<pann>/mcp`.

## Avancement (plan de `docs/CONTEXT.md`, section 9)

- [x] 1. Socle : monorepo, schéma, topic accessibilité, Worker Hono, auth, board squelette, CI
- [x] Saisie manuelle : flux RSS (avec auto-découverte), articles et outils ; fréquence de collecte par type de contenu et par source
- [x] 2. Collecte : adaptateurs RSS, Exa, GitHub ; déduplication ; cron horaire ; « Collecter maintenant »
- [x] Connexions : clés des services par workspace, réglées dans l'app (Supabase Vault)
- [x] 3. Tri IA (Haiku) : pertinence, type, contenu promotionnel, explication ; archivage sous le seuil
- [x] 4. Rédaction IA (Sonnet) : résumés FR/EN, extrait, brouillons de posts modifiables ; plafond de coût mensuel
- [ ] 5. Publication CheckFox
- [x] 6. Diffusion sociale : LinkedIn et Bluesky (Zernio), Mastodon ; créneaux, un post par langue
- [x] 7. Newsletter (Brevo) : une campagne par langue, envoi manuel ou hebdomadaire
- [x] Flux publics RSS et JSON Feed par thème et par langue
- [ ] 8. Second topic
- [x] 9. Serveur MCP de curation, pour Claude, connexion OAuth (Supabase Auth)
