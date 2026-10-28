/**
 * Site-wide identity used by the SEO tags, the build-time prerender (vite.config.ts) and the legal pages.
 * Pure data, no Vue / Vite imports: vite.config.ts bundles this file too.
 *
 * TODO(publisher): replace the placeholders before going public (legal notice requires real values).
 */
export const SITE = {
  name: 'CampusCove',
  /** Production origin, no trailing slash. Overridden at build time by the VITE_SITE_URL env variable. */
  url: 'https://campus-cove.vercel.app',
  /**
   * Launch date of the current legal texts (ISO). Bump with every change of the CGU / CGV / privacy policy, together
   * with AuthController::TERMS_VERSION in the backend: logged-in players are then asked to accept them again.
   */
  legalVersion: '2026-10-28',
  /** Last change of the public marketing pages (home, how to play, skins), used as sitemap lastmod. Bump when editing them. */
  contentUpdated: '2026-10-28',
  publisher: {
    name: '[Prénom Nom de l’éditeur]',
    status: 'Particulier — projet scolaire non commercial',
    contactEmail: 'contact@campuscove.example',
    privacyEmail: 'privacy@campuscove.example',
    /** Directeur de la publication (LCEN art. 6-III). */
    director: '[Prénom Nom de l’éditeur]',
  },
  hosts: [
    {
      role: 'Front-end',
      name: 'Vercel Inc.',
      address: '440 N Barranca Ave #4133, Covina, CA 91723, USA',
      site: 'https://vercel.com',
    },
    {
      role: 'API, base de données et serveur temps réel',
      name: 'Salesforce, Inc. (Heroku)',
      address: 'Salesforce Tower, 415 Mission Street, 3rd Floor, San Francisco, CA 94105, USA',
      site: 'https://www.heroku.com',
    },
  ],
  /** Service sending the account e-mails (password reset, inactivity notice, moderation decisions): MAIL_MAILER in the backend. */
  mailProvider: 'Brevo (Sendinblue SAS), 106 boulevard Haussmann, 75008 Paris, France — données hébergées dans l’Union européenne',
  minimumAge: 15,
  /** Inactive accounts are anonymized after this many months (privacy policy + accounts:purge-inactive). */
  inactiveAccountMonths: 36,
  themeColor: '#0b0e2a',
  ogImage: '/og-image.png',
} as const

export type Locale = 'en' | 'fr'
export const LOCALES: readonly Locale[] = ['en', 'fr']
export const DEFAULT_LOCALE: Locale = 'en'

/** Path prefix of a locale: '' for English (x-default), '/fr' for French. */
export function localePrefix(locale: Locale): string {
  return locale === 'fr' ? '/fr' : ''
}
