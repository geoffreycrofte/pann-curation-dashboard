/**
 * Compiles every interface message with vue-i18n's own compiler, so that a message the
 * board cannot show (a bare "@", which starts a linked message, an unbalanced brace…)
 * fails the tests instead of breaking a page at run time.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const fromVueI18n = createRequire(require.resolve('vue-i18n'))
const { baseCompile } = fromVueI18n('@intlify/message-compiler')

const errors = []
for (const lang of ['fr', 'en']) {
  const file = fileURLToPath(new URL(`../src/i18n/${lang}.ts`, import.meta.url))
  const messages = (await import(file)).default
  const walk = (node, path) => {
    if (typeof node === 'string') {
      baseCompile(node, {
        onError: (error) => errors.push(`${lang}: ${path}: ${error.message} (${node})`),
      })
      return
    }
    for (const [key, value] of Object.entries(node ?? {}))
      walk(value, path ? `${path}.${key}` : key)
  }
  walk(messages, '')
}

if (errors.length) {
  console.error(`Messages that vue-i18n cannot compile:\n${errors.join('\n')}`)
  process.exit(1)
}
console.log('i18n: every message compiles.')
