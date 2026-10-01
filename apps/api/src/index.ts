import { app } from './app'
import type { Env } from './env'
import { runScheduled } from './jobs/scheduled'

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env))
  },
} satisfies ExportedHandler<Env>
