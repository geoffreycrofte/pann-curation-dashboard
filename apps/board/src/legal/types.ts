/**
 * Legal pages (legal notice, terms, privacy). Long documents, not interface labels: they
 * live here, one module per language, instead of the i18n messages (whose syntax treats
 * "@", "{" and "|" as markup). French is the reference and the binding version.
 *
 * Inline links in a paragraph or a list item: [label](/path) or [label](https://…).
 * {email}: the contact address, behind a button that reveals it (never in clear in the
 * page or in the code, against harvesting robots).
 */
export type LegalBlock =
  | { p: string }
  | { list: string[] }
  | { table: { caption: string; head: string[]; rows: string[][] } }

export interface LegalSection {
  /** Anchor of the section, stable across languages. */
  id: string
  title: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  title: string
  lead: string
  /** Date of the last change in substance, already written for the reader. */
  updated: string
  /** Paragraphs before the first section (no table of contents entry). */
  intro?: LegalBlock[]
  sections: LegalSection[]
  /** Closing note, after a rule (source of a model, licence). */
  outro?: LegalBlock[]
}

export const LEGAL_DOCS = ['legal', 'terms', 'privacy', 'accessibility'] as const
export type LegalDocKey = (typeof LEGAL_DOCS)[number]
export type LegalDocs = Record<LegalDocKey, LegalDoc>

/** The operator, as registered. Shown in the footer and in the legal notice. */
export const OPERATOR = {
  name: 'Crofte Studio S.à r.l.-S',
  rcs: 'B310079',
  vat: 'LU37891138',
  address: '43, rue d’Anvers, L-1130 Luxembourg',
} as const

/** The contact address, encoded (XOR): decoded only when someone asks to see it. */
const EMAIL_CODE = [52, 25, 25, 29, 29, 53, 24, 41, 10, 30, 46, 1, 27, 67, 17, 36]
const EMAIL_KEY = [71, 108, 105, 109, 114]
export function contactEmail(): string {
  return String.fromCharCode(...EMAIL_CODE.map((c, i) => c ^ EMAIL_KEY[i % EMAIL_KEY.length]!))
}
