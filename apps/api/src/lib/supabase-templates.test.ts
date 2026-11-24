import { describe, expect, it } from 'vitest'
import { SUPABASE_TEMPLATES, supabaseTemplate } from './supabase-templates'

describe('Supabase templates', () => {
  // The files pasted in Supabase: regenerated with `vitest run -u` after a change.
  it.each(SUPABASE_TEMPLATES)('%s matches docs/emails/supabase', async (kind) => {
    await expect(supabaseTemplate(kind)).toMatchFileSnapshot(
      `../../../../docs/emails/supabase/${kind}.html`,
    )
  })

  it('switches on the account language, both when unknown', () => {
    const html = supabaseTemplate('magic-link')
    expect(html).toContain('{{ if and .Data.lang (eq .Data.lang "en") }}')
    expect(html).toContain('href="{{ .ConfirmationURL }}"')
    expect(html).toContain('{{ .SiteURL }}/email/glimr-logo.png')
  })
})
