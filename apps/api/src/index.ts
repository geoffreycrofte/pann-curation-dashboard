import { app } from './app'
import type { Env } from './env'
import { consumeJobs, type JobMessage } from './jobs/queue'
import { runScheduled } from './jobs/scheduled'

export default {
  fetch: app.fetch,
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env))
  },
  queue: consumeJobs,
} satisfies ExportedHandler<Env, JobMessage>
