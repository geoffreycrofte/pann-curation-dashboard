import {
  contentBlock,
  emailShell,
  footerBlock,
  LANG_RULE,
  type EmailContent,
  type EmailLang,
} from './email-layout'

/**
 * Templates of the e-mails Supabase sends (Authentication, Emails), in the layout of
 * Glimr's own. Written in the account's language (user_metadata.lang, kept by the board;
 * set from the inviter's for an invitation), in French then English when it is unknown.
 * Generated into docs/emails/supabase (`vitest run -u` in apps/api),
 * then pasted in the Supabase dashboard.
 */
export const SUPABASE_TEMPLATES = ['magic-link', 'invite', 'email-change'] as const
export type SupabaseTemplate = (typeof SUPABASE_TEMPLATES)[number]

/** Subjects: plain text in Supabase's subject field, so both languages. */
export const SUPABASE_SUBJECTS: Record<SupabaseTemplate, string> = {
  'magic-link': 'Votre lien de connexion à Glimr / Your Glimr sign-in link',
  invite: 'Invitation à rejoindre Glimr / Invitation to join Glimr',
  'email-change': 'Confirmez votre nouvelle adresse / Confirm your new address',
}

const LINK = '{{ .ConfirmationURL }}'

const CONTENTS: Record<SupabaseTemplate, Record<EmailLang, EmailContent>> = {
  'magic-link': {
    fr: {
      subject: '',
      heading: 'Votre lien de connexion',
      paragraphs: [
        'Cliquez sur le bouton pour vous connecter à Glimr. Le lien ne sert qu’une fois et expire rapidement.',
      ],
      button: { label: 'Me connecter', url: LINK },
      note: 'Vous n’avez rien demandé ? Ignorez cet e-mail : personne ne peut se connecter sans ce lien.',
    },
    en: {
      subject: '',
      heading: 'Your sign-in link',
      paragraphs: ['Click the button to sign in to Glimr. The link works once and expires soon.'],
      button: { label: 'Sign in', url: LINK },
      note: 'Did not ask for it? Ignore this e-mail: nobody can sign in without this link.',
    },
  },
  invite: {
    fr: {
      subject: '',
      heading: 'Vous êtes invité sur Glimr',
      paragraphs: [
        'Glimr aide à faire connaître un produit ou un sujet : veille triée, conversations où aider, posts rédigés et publiés.',
        'Acceptez l’invitation pour créer votre compte. Si une équipe vous a invité, vous arrivez directement dans son espace.',
      ],
      button: { label: 'Accepter l’invitation', url: LINK },
      note: 'Vous ne vous attendiez pas à cette invitation ? Ignorez cet e-mail : rien n’est créé sans que vous cliquiez.',
    },
    en: {
      subject: '',
      heading: 'You are invited to Glimr',
      paragraphs: [
        'Glimr helps make a product or a subject known: a sorted news watch, conversations where you can help, posts drafted and published.',
        'Accept the invitation to create your account. If a team invited you, you land straight in its workspace.',
      ],
      button: { label: 'Accept the invitation', url: LINK },
      note: 'Not expecting this invitation? Ignore this e-mail: nothing happens unless you click.',
    },
  },
  'email-change': {
    fr: {
      subject: '',
      heading: 'Confirmez votre nouvelle adresse',
      paragraphs: [
        'Vous avez demandé à utiliser {{ .NewEmail }} pour votre compte Glimr. Confirmez ce changement avec le bouton ci-dessous.',
      ],
      button: { label: 'Confirmer l’adresse', url: LINK },
      note: 'Vous n’avez rien demandé ? Ignorez cet e-mail : votre adresse ne change pas.',
    },
    en: {
      subject: '',
      heading: 'Confirm your new address',
      paragraphs: [
        'You asked to use {{ .NewEmail }} for your Glimr account. Confirm the change with the button below.',
      ],
      button: { label: 'Confirm the address', url: LINK },
      note: 'Did not ask for it? Ignore this e-mail: your address does not change.',
    },
  },
}

/** Go template condition on the account's language (missing: false). */
const is = (lang: EmailLang) => `and .Data.lang (eq .Data.lang "${lang}")`

function byLang(fr: string, en: string, both: string): string {
  return `{{ if ${is('en')} }}${en}{{ else if ${is('fr')} }}${fr}{{ else }}${both}{{ end }}`
}

/** The HTML to paste in Supabase for one template. */
export function supabaseTemplate(kind: SupabaseTemplate): string {
  const c = CONTENTS[kind]
  const html = emailShell({
    htmlLang: byLang('fr', 'en', 'fr'),
    title: 'Glimr',
    siteUrl: '{{ .SiteURL }}',
    siteLabel: 'glimr.cc',
    body: byLang(
      contentBlock('fr', c.fr),
      contentBlock('en', c.en),
      contentBlock('fr', c.fr) + LANG_RULE + contentBlock('en', c.en),
    ),
    footer: byLang(footerBlock('fr'), footerBlock('en'), footerBlock('fr') + footerBlock('en')),
  })
  return `${html}\n`
}
