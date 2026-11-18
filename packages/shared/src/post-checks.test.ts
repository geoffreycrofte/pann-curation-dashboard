import { describe, expect, it } from 'vitest'
import { checkPost } from './post-checks'

const codes = (text: string) => checkPost(text).map((i) => i.code)

describe('checkPost', () => {
  it('accepts a plain post', () => {
    expect(codes('La version 2 est sortie. #Accessibilité #WebPourTous 🎉')).toEqual([])
  })

  it('flags hashtags of several words in one case', () => {
    expect(checkPost('Lire #accessibiliténumérique')).toEqual([
      { code: 'hashtag_case', detail: '#accessibiliténumérique' },
    ])
    expect(codes('Vu au #WCAG et #RGAA')).toEqual([])
    expect(codes('#ACCESSIBILITE pour tous')).toEqual(['hashtag_case'])
    expect(codes('Un #a11y court, une #UX')).toEqual([])
    expect(codes('Pas un hashtag: page.html#section-deux-trois-quatre')).toEqual([])
  })

  it('flags emoji used as bullets, in excess or in a row', () => {
    expect(codes('Nouveautés :\n✅ plus rapide\n✅ plus simple')).toContain('emoji_line_start')
    expect(codes('🎉 🎉 x 🎉 y 🎉 z 🎉 w 🎉')).toContain('emoji_many')
    expect(codes('Bravo 👏👏👏')).toEqual(['emoji_run'])
    expect(codes('Bravo 👏🏽👏🏽')).toEqual([])
  })

  it('flags styled Unicode letters and capitals', () => {
    expect(checkPost('Le 𝗴𝗿𝗮𝘀 en Unicode')[0]).toMatchObject({ code: 'styled_text' })
    expect(codes('NE MANQUEZ PAS ÇA')).toEqual(['all_caps'])
    expect(codes('Le RGAA et les WCAG')).toEqual([])
  })
})
