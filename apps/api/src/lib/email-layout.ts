import { escapeHtml } from '@glimr/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Layout of the e-mails Glimr sends: the logo on the left, the text, a dark footer. Written
 * in the person's language when the account knows it (user_metadata.lang, kept by the
 * board), in French then English otherwise. Tables and inline styles: what e-mail clients
 * read. The same layout as the Supabase templates (docs/emails/supabase).
 */
export type EmailLang = 'fr' | 'en'

/** The text of an e-mail in one language. Plain strings: escaped here. */
export interface EmailContent {
  subject: string
  heading: string
  paragraphs: string[]
  button?: { label: string; url: string }
  /** Small text under the button (a link to copy, a reason). */
  note?: string
}

/** The languages to write an e-mail in, from the account's (unknown: both). */
export function emailLangs(lang: string | null | undefined): EmailLang[] {
  return lang === 'fr' || lang === 'en' ? [lang] : ['fr', 'en']
}

/** The languages of the accounts behind these addresses (secret key), by address. */
export async function langsOf(
  db: SupabaseClient,
  emails: string[],
): Promise<Map<string, string | null>> {
  if (!emails.length) return new Map()
  const { data, error } = await db.rpc('user_langs_for_jobs', {
    p_emails: emails.map((e) => e.toLowerCase()),
  })
  if (error) throw error
  return new Map(
    ((data ?? []) as { email: string; lang: string | null }[]).map((r) => [r.email, r.lang]),
  )
}

const COLORS = {
  page: '#f5efe4',
  card: '#ffffff',
  text: '#141414',
  muted: '#5c574c',
  link: '#5c4300',
  button: '#ffc72c',
  footer: '#141414',
  footerText: '#e8e1d2',
  rule: '#e6dfd0',
}
const FONT = 'font-family:Arial,Helvetica,sans-serif;'

const FOOTER: Record<EmailLang, { tagline: string; sent: string }> = {
  fr: {
    tagline: 'Glimr, faites connaître votre sujet.',
    sent: 'Cet e-mail vous est envoyé par Glimr, au sujet de votre compte.',
  },
  en: {
    tagline: 'Glimr, make your subject known.',
    sent: 'Glimr sends you this e-mail about your account.',
  },
}

const OPERATOR = 'Crofte Studio S.à r.l.-S, 43, rue d’Anvers, L-1130 Luxembourg'

/** The text of one language: heading, paragraphs, button, note. */
export function contentBlock(lang: EmailLang, c: EmailContent): string {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;${FONT}font-size:16px;line-height:1.55;color:${COLORS.text};">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;"><tr><td style="border-radius:999px;background:${COLORS.button};"><a href="${escapeHtml(c.button.url)}" style="display:inline-block;padding:13px 26px;${FONT}font-size:16px;font-weight:bold;color:${COLORS.text};text-decoration:none;border-radius:999px;">${escapeHtml(c.button.label)}</a></td></tr></table>`
    : ''
  const note = c.note
    ? `<p style="margin:0 0 8px;${FONT}font-size:13px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(c.note)}</p>`
    : ''
  return `<div lang="${lang}"><h1 style="margin:0 0 16px;${FONT}font-size:22px;line-height:1.3;font-weight:bold;color:${COLORS.text};">${escapeHtml(c.heading)}</h1>${c.paragraphs.map(p).join('')}${button}${note}</div>`
}

/** Line between the two languages. */
export const LANG_RULE = `<hr style="border:0;border-top:1px solid ${COLORS.rule};margin:28px 0;">`

/** The footer's sentence in one language. */
export function footerBlock(lang: EmailLang): string {
  return `<p lang="${lang}" style="margin:0 0 6px;${FONT}font-size:13px;line-height:1.5;color:${COLORS.footerText};">${escapeHtml(FOOTER[lang].tagline)} ${escapeHtml(FOOTER[lang].sent)}</p>`
}

/**
 * The frame: logo on the left, the body, the dark footer. Its arguments are HTML already
 * (the Supabase templates pass Go placeholders and conditions).
 */
export function emailShell(f: {
  htmlLang: string
  title: string
  siteUrl: string
  siteLabel: string
  body: string
  footer: string
}): string {
  return `<!doctype html>
<html lang="${f.htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${f.title}</title></head>
<body style="margin:0;padding:0;background:${COLORS.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.page};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="background:${COLORS.card};border-radius:16px 16px 0 0;padding:28px 32px 8px;" align="left"><a href="${f.siteUrl}"><img src="${f.siteUrl}/email/glimr-logo.png" width="100" height="34" alt="Glimr" style="display:block;border:0;"></a></td></tr>
<tr><td style="background:${COLORS.card};padding:20px 32px 28px;">${f.body}</td></tr>
<tr><td style="background:${COLORS.footer};border-radius:0 0 16px 16px;padding:24px 32px;">${f.footer}<p style="margin:12px 0 0;${FONT}font-size:12px;line-height:1.5;color:${COLORS.footerText};"><a href="${f.siteUrl}" style="color:${COLORS.button};text-decoration:underline;">${f.siteLabel}</a><br>${escapeHtml(OPERATOR)}</p></td></tr>
</table></td></tr></table>
</body></html>`
}

/** The e-mail, in the given languages (French first when both). */
export function renderEmail(
  siteUrl: string,
  contents: Partial<Record<EmailLang, EmailContent>>,
): { subject: string; html: string; text: string } {
  const langs = (['fr', 'en'] as const).filter((l) => contents[l])
  const parts = langs.map((l) => [l, contents[l]!] as const)
  const subject = parts.map(([, c]) => c.subject).join(' / ')
  const html = emailShell({
    htmlLang: langs[0] ?? 'fr',
    title: escapeHtml(subject),
    siteUrl: escapeHtml(siteUrl),
    siteLabel: escapeHtml(siteUrl.replace(/^https?:\/\//, '')),
    body: parts.map(([l, c]) => contentBlock(l, c)).join(LANG_RULE),
    footer: langs.map(footerBlock).join(''),
  })
  const text = [
    ...parts.map(([l, c]) =>
      [
        c.heading,
        ...c.paragraphs,
        c.button ? `${c.button.label}${l === 'fr' ? '\u00a0:' : ':'} ${c.button.url}` : '',
        c.note ?? '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    ),
  ].join('\n\n---\n\n')
  return { subject, html, text: `${text}\n\n--\nGlimr, ${siteUrl}\n${OPERATOR}` }
}
