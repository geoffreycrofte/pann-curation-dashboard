#!/usr/bin/env node
// Interactive setup: asks for the 3 Supabase values once and writes the local
// configuration files of the API (apps/api/.dev.vars) and the board
// (apps/board/.env.local). Every other key (Anthropic, Exa, GitHub…) is set
// later in the app, page "Connexions".
//
// Usage: pnpm configure

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline'

const API_VARS = new URL('../apps/api/.dev.vars', import.meta.url)
const BOARD_ENV = new URL('../apps/board/.env.local', import.meta.url)
const BOARD_DIST = new URL('../apps/board/dist/', import.meta.url)

function readEnvFile(url) {
  if (!existsSync(url)) return {}
  return Object.fromEntries(
    readFileSync(url, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
      }),
  )
}

const current = { ...readEnvFile(API_VARS), ...readEnvFile(BOARD_ENV) }
const rl = createInterface({ input: stdin, output: stdout, terminal: false })
// Reading lines through the iterator works both interactively and with piped answers.
const lines = rl[Symbol.asyncIterator]()

async function ask(question, { current: value, secret = false, validate }) {
  for (;;) {
    const shown = value ? (secret ? `…${value.slice(-4)}` : value) : ''
    stdout.write(`${question}${shown ? ` [${shown}]` : ''}\n> `)
    const next = await lines.next()
    if (next.done) {
      console.error('\nConfiguration interrompue.')
      process.exit(1)
    }
    const answer = next.value.trim() || value || ''
    const problem = validate(answer)
    if (!problem) return answer
    console.log(`  ✗ ${problem}\n`)
  }
}

console.log(`
Configuration de Pann (une seule fois)
======================================

Il faut 3 informations, toutes dans le tableau de bord Supabase de votre projet
(https://supabase.com/dashboard, puis votre projet). Appuyez sur Entrée pour
garder la valeur entre crochets.
`)

console.log(`1. L'adresse du projet.
   Elle a la forme https://xxxxxxxx.supabase.co. Le « xxxxxxxx » est la référence
   du projet, visible dans l'adresse du tableau de bord : supabase.com/dashboard/project/xxxxxxxx.
   Vous pouvez coller l'adresse complète ou seulement la référence.`)
let url = await ask('Adresse ou référence du projet', {
  current: current.SUPABASE_URL ?? current.VITE_SUPABASE_URL,
  validate: (v) => (v ? null : 'Valeur obligatoire.'),
})
if (!url.includes('.') && !url.includes(':')) url = `https://${url}.supabase.co`
url = url.replace(/\/+$/, '')

console.log(`
2. La clé publishable (elle commence par sb_publishable_).
   Tableau de bord Supabase : Project Settings, puis API Keys.
   Elle peut être publique : elle ne donne accès qu'à ce que la sécurité de la base autorise.`)
const publishable = await ask('Clé publishable', {
  current: current.SUPABASE_PUBLISHABLE_KEY ?? current.VITE_SUPABASE_PUBLISHABLE_KEY,
  validate: (v) => (v.length > 20 ? null : 'Cette clé semble incomplète.'),
})

console.log(`
3. La clé secrète (elle commence par sb_secret_).
   Même page (Project Settings, API Keys), section « Secret keys » : cliquez pour l'afficher.
   Elle reste sur votre ordinateur, dans apps/api/.dev.vars, et ne doit jamais être partagée.`)
const secret = await ask('Clé secrète', {
  current: current.SUPABASE_SECRET_KEY,
  secret: true,
  validate: (v) => (v.length > 20 ? null : 'Cette clé semble incomplète.'),
})
rl.close()

process.stdout.write('\nVérification de la connexion à Supabase… ')
try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } })
  console.log(
    res.ok
      ? 'OK.'
      : `réponse inattendue (HTTP ${res.status}). Vérifiez l'adresse et la clé publishable.`,
  )
} catch {
  console.log(`impossible de joindre ${url}. Vérifiez l'adresse (et votre connexion).`)
}

writeFileSync(
  API_VARS,
  `# Written by "pnpm configure". Local only, never commit this file.
SUPABASE_URL=${url}
SUPABASE_PUBLISHABLE_KEY=${publishable}
SUPABASE_SECRET_KEY=${secret}
`,
)
writeFileSync(
  BOARD_ENV,
  `# Written by "pnpm configure".
VITE_SUPABASE_URL=${url}
VITE_SUPABASE_PUBLISHABLE_KEY=${publishable}
`,
)
// The API Worker serves the built board in production; in development Vite serves it,
// but Wrangler still expects the assets directory to exist.
if (!existsSync(BOARD_DIST)) mkdirSync(BOARD_DIST, { recursive: true })

console.log(`
C'est prêt. Lancez maintenant :

  pnpm dev

puis ouvrez http://127.0.0.1:5173 et connectez-vous avec votre adresse e-mail.
Les clés des services (Anthropic, Exa, GitHub) se règlent ensuite dans l'app,
page « Connexions ».

Rappel côté Supabase (Authentication, URL Configuration) : l'URL du site et les
URL de redirection doivent contenir http://127.0.0.1:5173.
`)
