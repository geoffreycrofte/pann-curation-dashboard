import type { Env } from '../env'

/**
 * Cron entry point. Each cron expression in wrangler.jsonc maps to one job.
 * Jobs use the secret key (service role) and must be idempotent.
 */
export async function runScheduled(controller: ScheduledController, _env: Env): Promise<void> {
  switch (controller.cron) {
    // Step 2: case '0 */6 * * *': return collect(env)
    default:
      console.warn(`No job bound to cron "${controller.cron}"`)
  }
}
