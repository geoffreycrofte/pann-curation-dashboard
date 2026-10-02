import { app } from './app'
import { feeds } from './routes/feeds'
import type { Env } from './env'
import { consumeJobs, type JobMessage } from './jobs/queue'
import { runScheduled } from './jobs/scheduled'

export default {
  // Public feeds live outside /api: no sign-in.
  fetch: (request, env, ctx) =>
    new URL(request.url).pathname.startsWith('/feeds/')
      ? feeds.fetch(request, env, ctx)
      : app.fetch(request, env, ctx),
  scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(controller, env))
  },
  queue: consumeJobs,
} satisfies ExportedHandler<Env, JobMessage>
