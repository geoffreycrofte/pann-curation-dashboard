/**
 * Legal pages (legal notice, terms, privacy). Long documents, not interface labels: they
 * live here, one module per language, instead of the i18n messages (whose syntax treats
 * "@", "{" and "|" as markup). French is the reference and the binding version.
 *
 * Inline links in a paragraph or a list item: [label](/path) or [label](mailto:…).
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
  sections: LegalSection[]
}

export const LEGAL_DOCS = ['legal', 'terms', 'privacy'] as const
export type LegalDocKey = (typeof LEGAL_DOCS)[number]
export type LegalDocs = Record<LegalDocKey, LegalDoc>

/** The operator, as registered. Shown in the footer and in the legal notice. */
export const OPERATOR = {
  name: 'Crofte Studio S.à r.l.-S',
  rcs: 'B310079',
  vat: 'LU37891138',
  email: 'support@glimr.cc',
} as const
