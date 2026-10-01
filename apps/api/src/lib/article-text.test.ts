import { describe, expect, it } from 'vitest'
import { extractArticleText } from './article-text'

describe('extractArticleText', () => {
  it('keeps the article and drops navigation and scripts', () => {
    const html = `<html><body><nav>Menu Home</nav><header>Site</header>
      <article><h1>Title</h1><p>First &amp; second.</p><aside>Ad</aside></article>
      <footer>Legal</footer><script>track()</script></body></html>`
    expect(extractArticleText(html)).toBe('Title\nFirst & second.')
  })

  it('falls back on main, then body', () => {
    expect(extractArticleText('<body><nav>x</nav><main><p>Main text</p></main></body>')).toBe(
      'Main text',
    )
    expect(extractArticleText('<body><p>Body text</p></body>')).toBe('Body text')
  })
})
