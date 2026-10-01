import type fr from './fr'

export default {
  app: { name: 'Pann', tagline: 'Content curation tool' },
  a11y: { skipToContent: 'Skip to content' },
  lang: { label: 'Language', fr: 'Français', en: 'English' },
  auth: {
    title: 'Sign in',
    email: 'Email address',
    submit: 'Send me a sign-in link',
    sending: 'Sending…',
    sent: 'Link sent to {email}. Open it to sign in.',
    error: 'The link could not be sent: {message}',
    signOut: 'Sign out',
  },
  board: {
    topics: 'Topics',
    noTopic: 'No topic yet.',
    statusFilter: 'Filter by status',
    empty: 'Nothing in this list.',
    loading: 'Loading…',
    loadError: 'Loading error: {message}',
    relevance: 'Relevance: {score} out of 100',
    noScore: 'Relevance not scored',
    discovered: 'Found on {date}',
    openSource: 'Open source {title}',
    actions: 'Actions for {title}',
    statusChanged: '“{title}”: {status}',
  },
  status: {
    new: 'To sort',
    validated: 'Validated',
    rejected: 'Rejected',
    published: 'Published',
    archived: 'Archived',
  },
  action: {
    validate: 'Validate',
    reject: 'Reject',
    restore: 'Back to sorting',
  },
  kind: { news: 'News', legal: 'Legal', tool: 'Tool', resource: 'Resource' },
} satisfies typeof fr
