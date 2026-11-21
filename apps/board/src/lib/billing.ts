import type { BillingInterval, Plan } from '@pann/shared'
import { api, ApiError } from './api'

/**
 * Opens a Stripe page (subscribe, or manage the subscription). The API records the request,
 * a job prepares the page with Pann's key; this waits for its address, then goes there.
 * Resolves with an error code when it could not.
 */
export async function goToBilling(
  workspaceId: string,
  input:
    | { kind: 'checkout'; plan: Plan; interval: BillingInterval; return_path: string }
    | { kind: 'portal'; return_path: string },
): Promise<string | null> {
  try {
    const { id } = await api.requestBilling(workspaceId, input)
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, attempt < 5 ? 600 : 1500))
      const request = await api.billingRequest(workspaceId, id)
      if (request.status === 'ready' && request.url) {
        window.location.assign(request.url)
        return null
      }
      if (request.status === 'failed') return request.error ?? 'provider_error'
    }
    return 'timeout'
  } catch (err) {
    return err instanceof ApiError ? err.message : 'unexpected'
  }
}
