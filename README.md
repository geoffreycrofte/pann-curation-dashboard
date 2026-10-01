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

## Prérequis

- Node 22+, pnpm 10 (`corepack enable`)
- Docker (pour la stack Supabase locale)

## Démarrage local

```sh
pnpm install
pnpm db:start                     # stack Supabase locale (Docker), applique migrations + seed
pnpm exec supabase status         # affiche l'URL, la clé publishable et la clé secrète

cp apps/api/.dev.vars.example apps/api/.dev.vars       # renseigner les deux clés
cp apps/board/.env.example apps/board/.env.local       # renseigner la clé publishable

pnpm dev:api                      # http://127.0.0.1:8787/api/health
pnpm dev:board                    # http://127.0.0.1:5173
```

Connexion : saisir `dev@pann.local` sur l'écran de connexion, puis ouvrir le lien reçu dans Mailpit (URL donnée par `supabase status`).

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
- Secrets du Worker : `wrangler secret put SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_SECRET_KEY`.
- Supabase Auth (projet distant) : désactiver les inscriptions publiques, inviter son adresse, définir l'URL du site et les URLs de redirection.

## Avancement (plan de `docs/CONTEXT.md`, section 9)

- [x] 1. Socle : monorepo, schéma, topic accessibilité, Worker Hono, auth, board squelette, CI
- [x] Saisie manuelle : flux RSS (avec auto-découverte), articles et outils ; fréquence de collecte par type de contenu et par source
- [ ] 2. Collecte : adaptateurs RSS, Exa, GitHub ; déduplication ; Cron + Queues
- [ ] 3. Tri IA (Haiku)
- [ ] 4. Rédaction IA (Sonnet), `usage_log`, plafond de coût
- [ ] 5. Publication CheckFox
- [ ] 6. Diffusion sociale
- [ ] 7. Newsletter (Brevo)
- [ ] 8. Second topic
- [ ] 9. Serveur MCP de curation
