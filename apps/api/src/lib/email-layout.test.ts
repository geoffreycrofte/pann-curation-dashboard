import { describe, expect, it } from 'vitest'
import { emailLangs, renderEmail } from './email-layout'

const fr = {
  subject: 'Sujet',
  heading: 'Titre <b>',
  paragraphs: ['Un', 'Deux'],
  button: { label: 'Ouvrir', url: 'https://glimr.example/x' },
}
const en = {
  ...fr,
  subject: 'Subject',
  heading: 'Title',
  button: { label: 'Open', url: 'https://glimr.example/x' },
}

describe('email layout', () => {
  it('writes in the account language, in both when it is unknown', () => {
    expect(emailLangs('en')).toEqual(['en'])
    expect(emailLangs('fr')).toEqual(['fr'])
    expect(emailLangs(null)).toEqual(['fr', 'en'])
    expect(emailLangs('de')).toEqual(['fr', 'en'])
  })

  it('has the logo, the escaped text and the footer, in one language', () => {
    const email = renderEmail('https://glimr.example', { en })
    expect(email.subject).toBe('Subject')
    expect(email.html).toContain('src="https://glimr.example/email/glimr-logo.png"')
    expect(email.html).toContain('<html lang="en">')
    expect(email.html).not.toContain('lang="fr"')
    expect(email.html).toContain('make your subject known')
    expect(email.text).toContain('Open: https://glimr.example/x')
  })

  it('puts French first when both are written', () => {
    const email = renderEmail('https://glimr.example', { en, fr })
    expect(email.subject).toBe('Sujet / Subject')
    expect(email.html.indexOf('lang="fr"')).toBeLessThan(email.html.indexOf('lang="en"'))
    expect(email.html).not.toContain('<b>')
    expect(email.text).toContain('Ouvrir : https://glimr.example/x')
  })
})
