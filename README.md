<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/logo/glimr-logo-dark.svg">
    <img src="docs/brand/logo/glimr-logo.svg" alt="Glimr" width="220">
  </picture>
</p>

<p align="center">
  <strong>Make your product or your expertise known, without spending your days on it.</strong><br>
  Open source news watch, conversation finder and social publishing, driven by AI and validated by you.
</p>

<p align="center">
  <a href="https://glimr.cc">Glimr Cloud</a> ·
  <a href="https://glimr.cc/how-it-works">How it works</a> ·
  <a href="https://glimr.cc/pricing">Pricing</a> ·
  <a href="#self-hosting">Self-hosting</a> ·
  <a href="ACCESSIBILITY.md">Accessibility</a>
</p>

---

Glimr follows the news of your subject, spots the conversations where you can help, and prepares your posts and newsletter, in your languages. AI does the reading, the sorting and the first drafts; nothing goes out without your approval.

## What it does

- **News watch.** RSS feeds, web search (Exa) and GitHub, per topic. Each item gets a relevance score out of 100 against the criteria you wrote, with the reason. Below your threshold it is archived, so you only read what matters.
- **Drafts in your voice.** When you validate an item, Glimr writes its summaries and one post per network and language, following your own style rules. Rewrite shorter, longer or in another tone in one click.
- **Publishing on your slots.** LinkedIn, Facebook, Bluesky, W, Mastodon, Discord and Telegram, one post per language, on the time slots you chose, with a calendar of what is scheduled.
- **Conversations.** Glimr finds discussions about your subject (Hacker News, Bluesky) where your help is welcome, and drafts a reply you post yourself.
- **Create.** Start from an article, a conversation or a blank page: Glimr researches sources and writes a post, or a whole series, for all your networks.
- **Newsletter and feeds.** A weekly newsletter per language (Brevo or SendFox), and public RSS and JSON feeds of what you shared.
- **Claude integration.** An MCP server lets you sort and draft from a conversation with Claude, with your account and permissions.
- **You stay in control.** A spending cap per topic, usage tracked call by call, competitors' sites excluded in one click, and every post approved or scheduled by you.

## Glimr Cloud or self-hosted

Glimr is the same software in both cases. The code is open under the [AGPL-3.0](LICENSE.md): you can read it, run it and change it.

|                           | **[Glimr Cloud](https://glimr.cc)**                                                                    | **Self-hosted**                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Setup                     | [Request access](https://glimr.cc/request-access), then create your first topic                        | Your own Supabase project and Cloudflare account |
| AI and web search         | Included in the Essential and Pro offers, within a monthly quota; or bring your own keys (Perso offer) | Your own keys (Anthropic, Exa)                   |
| LinkedIn and Facebook     | Included in the paid offers: Glimr's publishing partner, no app review on your side                    | Your own Zernio key                              |
| Updates, backups, e-mails | Done for you                                                                                           | Up to you                                        |
| Hosting                   | In the EU (Supabase in Paris, Cloudflare)                                                              | Wherever you choose                              |
| Team                      | Up to two people on the Pro offer                                                                      | As you like                                      |
| Price                     | 14-day free trial, then [see the offers](https://glimr.cc/pricing)                                     | Free; you pay the services you connect           |

Glimr Cloud funds the development of Glimr. If you can host it yourself and prefer to, you are welcome to: the self-hosted version is not a demo.

## Self-hosting

You need [Node.js 22](https://nodejs.org) or later, a [Supabase](https://supabase.com) project (cloud or self-hosted) and, to put it online, a [Cloudflare](https://cloudflare.com) account (Workers and Queues).

### Run it locally

```sh
corepack enable     # once: turns on pnpm, shipped with Node.js
pnpm install
pnpm configure      # once: three questions about your Supabase project
pnpm dev            # starts the API and the board
```

Open http://127.0.0.1:5173 and sign in with your e-mail address (magic link). In Supabase (Authentication, URL Configuration), the site URL and the redirect URLs must include `http://127.0.0.1:5173`. `pnpm configure` explains where to find each value.

For a fully local Supabase (Docker): `pnpm db:start`, then `pnpm configure` with `http://127.0.0.1:54321` and the keys shown by `pnpm exec supabase status`. The test user is `dev@glimr.local`; its sign-in link arrives in Mailpit.

### Everything else is set in the app

- **Connections**: the keys of the services you use (Anthropic, Exa, GitHub, the networks, the newsletter), each with where to create it. Keys are encrypted in Supabase Vault and never shown again.
- **Topics**: sources, relevance criteria, style rules, networks, slots and budget, per topic.

No service key ever goes in an environment variable: only the Supabase ones do.

### Make your instance yours

Glimr Cloud's billing is built in. On your own instance, once you have signed in for the first time, run this in the SQL editor of Supabase to give your workspace lasting access and the admin space:

```sql
update public.workspaces set billing_status = 'legacy', plan = 'own_keys';
insert into private.platform_admins (user_id)
  select id from auth.users where email = 'you@example.org';
```

### Deploy

The `Deploy` workflow (GitHub Actions) runs the migrations, builds the board and deploys the Cloudflare Worker after each green CI on `main`. It needs a `production` environment with these secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SECRET_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; and these variables: `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`. Set your own domain in `apps/api/wrangler.jsonc`.

## How it is built

```
apps/
  api/        Cloudflare Worker (Hono): the API under /api/*, scheduled jobs and queues.
              Also serves the board as static assets (a single origin).
  board/      The interface (Vue 3, Vite, Reka UI, Pinia Colada, vue-i18n in English and French).
packages/
  shared/     Domain types, topic settings schema, URL normalization, status rules.
supabase/
  migrations/ Multi-tenant Postgres schema with row level security.
```

- **Multi-tenant by design**: every table people reach has row level security; background jobs alone use the secret key.
- **Accessible**: the interface aims at WCAG 2.2 AA, with colour contrast checked on every change, in light and dark mode. See [ACCESSIBILITY.md](ACCESSIBILITY.md).
- **AI with guardrails**: prompts only carry how the tool works; tone, style and topic rules are your own settings.

### Checks

```sh
pnpm typecheck
pnpm test          # unit tests, plus the contrast of the colour tokens
pnpm format:check
pnpm db:reset      # replays every migration and the seed (local Supabase)
```

## Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an issue first so we can agree on the approach. Accessibility problems are treated as bugs.

## License

Glimr is free software, released under the [GNU Affero General Public License v3.0 or later](LICENSE.md). If you run a modified version for other people over a network, the AGPL asks you to offer them its source code.

The Glimr name and logo are not covered by the license: please use another name for your own service built on this code.

Glimr is made by [Crofte Studio](https://glimr.cc/legal), in Luxembourg.
