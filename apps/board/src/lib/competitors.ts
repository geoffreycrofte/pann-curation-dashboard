/**
 * What each Glimr tool replaces, with an example of a separate tool and its price: for one
 * person, yearly price per month, in US dollars as the vendors show them. Read on their
 * pages in November 2026, given as examples only (docs/studies/tarifs-concurrence.md).
 */
export const COMPETITORS = [
  { need: 'publish', tool: 'Publer Business', usd: 24, icon: 'send' },
  { need: 'watch', tool: 'Feedly Pro+', usd: 12, icon: 'news' },
  { need: 'listen', tool: 'Syften Standard', usd: 49.95, icon: 'messages' },
] as const

export type CompetitorNeed = (typeof COMPETITORS)[number]['need']
export const competitorFor = (need: CompetitorNeed) => COMPETITORS.find((c) => c.need === need)!
