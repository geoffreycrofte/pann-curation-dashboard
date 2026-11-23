import { describe, expect, it } from 'vitest'
import { questionsSystemPrompt, questionsUserMessage, toQuestionIdeas } from './questions'

const conversations = [
  { title: 'How to test with a screen reader?', url: 'https://e.org/1' },
  { title: 'Screen reader testing for beginners', url: 'https://e.org/2' },
  { title: 'Is WCAG 2.2 required?', url: 'https://e.org/3' },
]

describe('recurring questions', () => {
  it('keeps the questions of at least two known conversations, with examples', () => {
    const ideas = toQuestionIdeas(
      {
        ideas: [
          {
            question: ' How do I test with a screen reader? ',
            angle: 'Steps.',
            conversations: [1, 2, 2],
          },
          { question: 'Is WCAG 2.2 required?', angle: 'Law.', conversations: [3] },
          { question: 'Ghost', angle: 'x', conversations: [9, 10] },
        ],
      },
      conversations,
    )
    expect(ideas).toEqual([
      {
        question: 'How do I test with a screen reader?',
        angle: 'Steps.',
        count: 2,
        examples: conversations.slice(0, 2),
      },
    ])
  })

  it('numbers the conversations and writes in the interface language', () => {
    const message = questionsUserMessage('Accessibility', [
      { title: 'A', excerpt: 'first' },
      { title: 'B', excerpt: '' },
    ])
    expect(message).toContain('[1] A\nfirst')
    expect(message).toContain('[2] B')
    expect(questionsSystemPrompt('fr')).toContain('French')
    expect(questionsSystemPrompt('fr')).not.toMatch(/RGAA|accessibilit/i)
  })
})
