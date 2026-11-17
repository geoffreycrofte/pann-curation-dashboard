import { describe, expect, it } from 'vitest'
import { accessRequestEmail } from './notify'

const request = {
  id: 'r1',
  name: 'Alex <script>',
  email: 'alex@example.org',
  motivation: 'Je publie une veille sur l’accessibilité.\n\nDeux thèmes au moins.',
  lang: 'fr',
  created_at: '2026-11-17T10:00:00Z',
}

describe('access request email', () => {
  const email = accessRequestEmail(
    request,
    'Pann <noreply@example.org>',
    ['admin@example.org'],
    'https://pann.example/admin',
  )

  it('answers the person directly and is sent once per request', () => {
    expect(email.replyTo).toBe('alex@example.org')
    expect(email.idempotencyKey).toBe('pann-access-request-r1')
    expect(email.to).toEqual(['admin@example.org'])
  })

  it('escapes what the person typed in the HTML version', () => {
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('Alex &lt;script&gt;')
    expect(email.html).toContain('<p style="margin:0 0 12px;">Deux thèmes au moins.</p>')
    expect(email.text).toContain('Je publie une veille')
  })
})
