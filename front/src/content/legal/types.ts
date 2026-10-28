/** Shape of a legal page. Pure data: rendered by LegalView and prerendered by vite.config.ts. */
export type LegalSlug =
  | 'legal-notice'
  | 'privacy'
  | 'cookies'
  | 'terms'
  | 'sales'
  | 'community'
  | 'accessibility'
  | 'credits'

export const LEGAL_SLUGS: readonly LegalSlug[] = [
  'legal-notice',
  'privacy',
  'cookies',
  'terms',
  'sales',
  'community',
  'accessibility',
  'credits',
]

interface LegalSection {
  heading: string
  paragraphs?: string[]
  items?: string[]
}

interface LegalDoc {
  title: string
  /** Meta description and lead paragraph. */
  description: string
  sections: LegalSection[]
}

export type LegalDocs = Record<LegalSlug, LegalDoc>
