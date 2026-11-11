import type { NewsletterProvider } from '@pann/shared'
import { sendBrevoCampaign } from './brevo'
import { sendSendfoxCampaign } from './sendfox'

export interface Campaign {
  /** Internal name, shown in the service only. */
  name: string
  subject: string
  /** Brevo sender id; SendFox sends from the account's default sender. */
  senderId: number | null
  listId: number
  html: string
}

export type CampaignResult =
  | { ok: true; campaignId: number }
  | { ok: false; error: string; invalidCredential?: boolean; campaignId?: number }

export type SendCampaign = (
  provider: NewsletterProvider,
  apiKey: string,
  campaign: Campaign,
) => Promise<CampaignResult>

/** Sends an issue with the service chosen in the newsletter settings of the topic. */
export const sendCampaign: SendCampaign = (provider, apiKey, campaign) =>
  provider === 'sendfox'
    ? sendSendfoxCampaign(apiKey, campaign)
    : sendBrevoCampaign(apiKey, campaign)
