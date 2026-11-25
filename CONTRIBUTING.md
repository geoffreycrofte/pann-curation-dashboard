# Contributing to Glimr

Thank you for wanting to help. Issues and pull requests are welcome.

## Before you start

- **A bug**: open an issue with what you did, what you expected and what happened. Accessibility problems are bugs too: say which assistive technology you use, if any.
- **A fix**: a pull request is enough.
- **Anything larger** (a feature, a new network, a change of behaviour): open an issue first, so we can agree on the approach before you spend time on it.

## Working on the code

The [README](README.md) explains how to run Glimr locally. Before a pull request, make these pass:

```sh
pnpm typecheck
pnpm test
pnpm format:check
```

A few rules hold everywhere in the code:

- Interface labels go through the translations (`apps/board/src/i18n`), French and English.
- The interface aims at WCAG 2.2 AA: keyboard, focus, names, contrast. New colours are tokens, checked by `pnpm test`.
- Database changes are new migrations in `supabase/migrations`; an applied migration is never edited.
- Nothing specific to a topic or a person is written in the code or in the AI prompts: it belongs in the settings.

## Licence of your contribution

Glimr is published under the [Business Source License](LICENSE.md), and Crofte Studio also sells commercial licences of it (see the README). To keep that possible, contributions come with a licence to Crofte Studio:

By submitting a contribution (code, documentation, translation or other material) to this repository, you agree that:

1. you wrote it, or have the right to submit it under these terms;
2. you grant Crofte Studio S.à r.l.-S, and the recipients of Glimr, a perpetual, worldwide, non-exclusive, royalty-free, irrevocable licence to use, reproduce, modify, distribute and sublicense your contribution, under the Business Source License, under the open source licence it changes into, and under commercial licences;
3. you keep the copyright of your contribution, and you may use it elsewhere as you wish.

Pull requests carry a checkbox to confirm it.
