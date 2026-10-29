import { SITE } from '../../seo/site'
import type { LegalDocs } from './types'

const P = SITE.publisher
const hosts = SITE.hosts.map((h) => `${h.role}: ${h.name}, ${h.address} — ${h.site}`)

/** English translation. The French version is the reference text in case of discrepancy. */
export const legalEn: LegalDocs = {
  'legal-notice': {
    title: 'Legal notice',
    description: `Publisher, publication director and hosting providers of ${SITE.name} (French LCEN law).`,
    sections: [
      {
        heading: 'Publisher',
        paragraphs: [
          `${SITE.name} (${SITE.url}) is published by ${P.name}, private individual — non-commercial school project.`,
          `Contact: ${P.contactEmail}. As a non-professional publisher (LCEN art. 6-III-2), the publisher may only disclose its hosting provider’s details, which holds its identification data.`,
        ],
      },
      { heading: 'Publication director', paragraphs: [P.director] },
      { heading: 'Hosting', items: hosts },
      {
        heading: 'Intellectual property',
        paragraphs: [`The code, 3D models, texts, logos and graphics of ${SITE.name} are protected by copyright. Any reproduction without permission is forbidden, except where stated (see Credits for open-licensed assets).`],
      },
      {
        heading: 'Report illegal content',
        paragraphs: [`Any manifestly illegal content (username, decoration, behaviour) can be reported with the “Report” button on the Friends page or to ${P.contactEmail}, stating the username, the content and the reasons. Reports are handled without undue delay; the reporter is told the outcome and a sanctioned player receives a reasoned decision they can contest.`],
      },
      { heading: 'Reference text', paragraphs: ['The French version of the legal pages prevails in case of discrepancy.'] },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    description: `What data ${SITE.name} collects, why, how long it is kept and how to exercise your GDPR rights.`,
    sections: [
      {
        heading: 'Controller',
        paragraphs: [
          `The data controller is ${P.name} (private individual, school project). Any question or request about your data: ${P.privacyEmail}.`,
          'No data protection officer (DPO) is appointed, as none is required for this processing (GDPR art. 37); the address above serves that purpose.',
        ],
      },
      {
        heading: 'Data collected and purposes',
        items: [
          'Account: email address, username, password (stored hashed only), sign-up and last login dates — to create and secure your account (contract, GDPR art. 6.1.b).',
          'Consents: date and version of the accepted terms, age declaration — to be able to prove your agreement (legitimate interest, art. 6.1.f, and GDPR art. 7.1).',
          'Service e-mails: email address — to reset your password, warn you before an inactive account is deleted and tell you the outcome of a report (contract; legal obligation for moderation decisions under the EU Digital Services Act). No marketing e-mail is sent.',
          'Game data: inventory, coin and premium wallets, housing, placed furniture, appearance, survival stats, friends and referrals — to run the game (contract).',
          'Real-time position and actions: shared with players in the same zone during play, not kept after the session (contract).',
          'Reports and sanctions: report content, players involved, moderation decision — community safety (legitimate interest, art. 6.1.f).',
          'Hosting technical logs (IP address, date, requested page): security and abuse prevention (legitimate interest). Referrals never use IP addresses.',
          'Purchases (if enabled): transaction history and invoices — accounting obligations (legal obligation). Card data is handled only by the payment provider, never by us.',
        ],
      },
      {
        heading: 'What we do not do',
        items: [
          'No advertising, no ad profiling, no data selling.',
          'No analytics or social-media tracker is set at this time.',
          'No automated decision with legal effects (GDPR art. 22).',
        ],
      },
      {
        heading: 'Mandatory data',
        paragraphs: ['Email address, username, password, acceptance of the terms and the age declaration are needed to create an account: without them, sign-up is not possible.'],
      },
      {
        heading: 'Retention',
        items: [
          `Account and game data: while the account is active, then automatically anonymized after ${SITE.inactiveAccountMonths} months without login (an e-mail warns you 30 days before; logging in keeps the account), or immediately when you delete your account.`,
          'Proof of consent: account lifetime.',
          'Reports: deleted 1 year after the decision; a report’s text is erased as soon as its author deletes their account. Sanctions: their duration.',
          'Accounting records: 10 years.',
          'Technical logs: 12 months at most.',
        ],
      },
      {
        heading: 'Recipients and processors',
        paragraphs: ['Your data is only accessible to the publisher and its technical processors, bound by contract (GDPR art. 28):'],
        items: [...hosts, `E-mail delivery: ${SITE.mailProvider}.`, 'Fonts: self-hosted, no request is sent to Google.', 'Other players see your username, appearance, in-game position and your home if you invite them.'],
      },
      {
        heading: 'Transfers outside the EU',
        paragraphs: [
          'Vercel Inc. is based in the USA and certified under the EU–US Data Privacy Framework (adequacy decision of 10 July 2023), complemented by the European Commission’s standard contractual clauses.',
          'Salesforce, Inc. (Heroku), which hosts the API, the database and the real-time server, is based in the USA: it is certified under the EU–US Data Privacy Framework and applies Salesforce’s Binding Corporate Rules for processors (GDPR art. 45 and 47).',
          'Brevo, which sends the e-mails, is based in France and stores data in the EU: no transfer.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You have the rights of access, rectification, erasure, restriction, objection and portability, the right to withdraw consent at any time, and the right to give instructions about your data after your death.',
          `From your profile you can directly download all your data (JSON) and delete your account. For other requests: ${P.privacyEmail}. We answer within one month.`,
          'You may lodge a complaint with the French data protection authority, CNIL (www.cnil.fr), or your local supervisory authority.',
        ],
      },
      {
        heading: 'Minors',
        paragraphs: [`${SITE.name} is for people aged ${SITE.minimumAge} and over. Age is declared at sign-up. Accounts found to belong to younger people are deleted.`],
      },
      {
        heading: 'Security and data breaches',
        paragraphs: ['Hashed passwords, encrypted connections (HTTPS), revocable access tokens, login attempt limits. In case of a risky breach, the CNIL is notified within 72 hours and affected people are informed when the risk is high (GDPR art. 33–34).'],
      },
      { heading: 'Changes', paragraphs: [`Version of ${SITE.legalVersion}. Any significant change will be shown at your next login, with a request to accept it.`] },
    ],
  },

  cookies: {
    title: 'Cookies and trackers',
    description: `Exhaustive list of the cookies and local storage used by ${SITE.name}, and how to manage your choices.`,
    sections: [
      {
        heading: 'Our approach',
        paragraphs: [
          `${SITE.name} uses no advertising, analytics or social-media cookie. We only use your browser’s local storage for purposes strictly necessary to the service you request; these are exempt from consent (ePrivacy directive art. 5(3), CNIL guidelines).`,
          'If a tracker requiring consent is ever added, a banner will let you accept or refuse it just as easily, before anything is stored, and you can change your mind at any time with the “Manage cookies” link in the footer.',
        ],
      },
      {
        heading: 'Strictly necessary storage',
        items: [
          'campus_cove_auth — your session (login token and profile) — until logout.',
          'campus_cove_wallet_balances — cached balances for display — until logout.',
          'cc_locale — chosen language — until cleared.',
          'cc_consent — your tracker choices — 6 months.',
          'cc_graphics_quality, cc.reducedEffects, cc.comfort — game graphics and accessibility settings — until cleared.',
          'cc_keybindings — your custom keys (Settings) — until deleted or reset to default.',
          'campus_cove_admin_mode, cc.admin.worldPlanner.v1 — admin tools (admin accounts only).',
        ],
      },
      {
        heading: 'Manage or delete this data',
        paragraphs: ['You can clear local storage at any time from your browser settings (Site data). You will be logged out and your settings will reset to defaults.'],
      },
    ],
  },

  terms: {
    title: 'Terms of use',
    description: `Rules for accessing and using ${SITE.name}: account, behaviour, virtual currencies, sanctions and liability.`,
    sections: [
      {
        heading: '1. Purpose and project status',
        paragraphs: [
          `These terms govern access to the online game ${SITE.name}, published by ${P.name}. ${SITE.name} is currently a non-profit school project published by a private individual.`,
          'No real sale takes place within this school project. Should real-money sales ever open, the publisher would first need a professional status (e.g. French micro-entreprise) and those sales would be governed by the Terms of sale, which would then prevail for any purchase.',
        ],
      },
      { heading: '2. Acceptance', paragraphs: ['Creating an account means accepting these terms, the Privacy policy and the Community rules. The accepted version and date are recorded.'] },
      {
        heading: '3. Minimum age and account',
        items: [
          `You must be at least ${SITE.minimumAge} years old.`,
          'One account per person; the information you give must be accurate.',
          'You are responsible for keeping your password secret and for all activity on your account.',
          'Usernames must not impersonate anyone nor be insulting, hateful or sexual.',
        ],
      },
      { heading: '4. Behaviour', paragraphs: ['You agree to follow the Community rules. Cheating, bug exploits, bots, harassment, illegal content and attacks on the servers are forbidden.'] },
      {
        heading: '5. Virtual currencies and items',
        items: [
          'Coins, premium currency, skins, furniture and housing are personal, non-transferable licences with no monetary value; they cannot be refunded or exchanged for money, unless the law provides otherwise.',
          'Housing leases last 7 days. When a lease expires the home is released and the furniture placed in it is deleted: pick it up beforehand.',
          'The publisher may rebalance the game (prices, rewards, items) to keep it fair.',
        ],
      },
      { heading: '6. Sanctions', paragraphs: [`In case of breach, the publisher may proportionately warn, suspend or ban the account and remove fraudulently obtained items. Decisions are justified; you can contest them at ${P.contactEmail}.`] },
      { heading: '7. Reporting', paragraphs: [`Any player can report a username or behaviour from the Friends page or at ${P.contactEmail}. Abusive reports may be sanctioned.`] },
      { heading: '8. Availability and liability', paragraphs: ['The service is provided “as is”, with no guarantee of continuous availability. It may be interrupted for maintenance or shut down; players will be told at least 30 days ahead when possible. The publisher is not liable for indirect damages.'] },
      { heading: '9. Termination', paragraphs: ['You can delete your account at any time from your profile. Virtual items are then permanently lost.'] },
      { heading: '10. Changes and governing law', paragraphs: ['These terms may change; the new version will be shown at login. French law applies. An amicable solution will be sought before any legal action.', `Version of ${SITE.legalVersion}.`] },
    ],
  },

  sales: {
    title: 'Terms of sale',
    description: `Terms for buying premium currency and digital content on ${SITE.name}: prices, payment, withdrawal right, refunds.`,
    sections: [
      { heading: 'Current status', paragraphs: [`No real-money sale is open at this time: ${SITE.name} is a non-commercial school project. These terms will apply once purchases open, after the publisher has adopted a professional status and updated the legal notice (company number, address, mediator).`] },
      { heading: '1. Products', paragraphs: ['Premium currency and digital content (skins, cosmetic items) supplied without a physical medium, usable only in the game, described on their page before purchase.'] },
      { heading: '2. Prices and payment', paragraphs: ['Prices are shown in euros including all taxes. Payment is due when ordering and handled by a secure payment provider; the publisher never sees your card data. The confirmation button reads “Order with obligation to pay”.'] },
      { heading: '3. Delivery', paragraphs: ['Content is credited to your account right after payment is confirmed. An order confirmation is sent by email.'] },
      { heading: '4. Right of withdrawal', paragraphs: ['Under article L221-28 13° of the French Consumer Code (EU directive 2011/83 art. 16(m)), the 14-day withdrawal right does not apply to digital content supplied immediately once you have expressly requested immediate supply and acknowledged losing your withdrawal right. This is asked through a separate checkbox before payment. Without it, content is delivered after the 14-day period.'] },
      { heading: '5. Conformity guarantee', paragraphs: [`Digital content benefits from the legal conformity guarantee. In case of a defect, contact ${P.contactEmail}: the content will be fixed or refunded.`] },
      { heading: '6. Refunds and shutdown', paragraphs: ['If the service shuts down for good, premium currency bought and unspent in the previous 6 months will be refunded. Accounts banned for cheating get no refund, unless a court decides otherwise.'] },
      { heading: '7. Minors', paragraphs: ['Purchases by a minor must be made with their legal guardian’s consent.'] },
      { heading: '8. Mediation and disputes', paragraphs: [`Contact ${P.contactEmail} first. You may then use a consumer mediator free of charge, whose details will be given here when sales open. French law applies.`] },
    ],
  },

  community: {
    title: 'Community rules',
    description: `How we live together in ${SITE.name}: respect, fair play, usernames, reports and sanctions.`,
    sections: [
      { heading: 'Respect', items: ['No harassment, insults, threats or discrimination.', 'No sexual, violent or hateful content in usernames or decorations.', 'No impersonation and no sharing of other people’s personal information.'] },
      { heading: 'Fair play', items: ['No cheating, third-party software, bots or bug exploits — report them instead.', 'No selling accounts or items for real money outside the game.', 'No scams between players (trades, house keys).'] },
      { heading: 'Report', paragraphs: [`From the Friends page, use “Report” on a player, or write to ${P.contactEmail}. You can also block a player.`] },
      { heading: 'Graduated sanctions', items: ['Warning', 'Temporary suspension', 'Permanent ban for repeated or serious offences'] },
    ],
  },

  accessibility: {
    title: 'Accessibility statement',
    description: `Accessibility status of ${SITE.name} against WCAG 2.1 / RGAA 4.1 and how to give feedback.`,
    sections: [
      { heading: 'Compliance status', paragraphs: [`${SITE.name} is partially compliant with RGAA 4.1 (WCAG 2.1 AA). Website pages (home, sign-up, shop, legal pages) are designed to be keyboard-navigable, screen-reader friendly and well contrasted. The real-time 3D game cannot be made fully accessible by nature.`] },
      { heading: 'Measures taken', items: ['Skip link to the main content.', 'Language declared on every page, structured headings, form labels.', 'The system “reduce motion” setting is respected.', '“Reduced effects” option in the game (blur, camera shake).'] },
      { heading: 'Known issues', items: ['The 3D game requires a mouse and keyboard and is not usable with a screen reader.', 'Some in-game interfaces are only available in English.'] },
      { heading: 'Feedback', paragraphs: [`If you hit an accessibility issue, write to ${P.contactEmail}. Without a satisfactory answer, you can contact the French Défenseur des droits (www.defenseurdesdroits.fr).`] },
    ],
  },

  credits: {
    title: 'Credits and licences',
    description: `Technologies, fonts and assets used by ${SITE.name}, with their licences.`,
    sections: [
      { heading: 'Technologies', items: ['Vue.js, Vue Router, Vue I18n — MIT', 'Three.js — MIT', 'Rapier (physics) — Apache 2.0', 'Colyseus (multiplayer) — MIT', 'Laravel — MIT', 'Tailwind CSS — MIT'] },
      { heading: 'Fonts', items: ['Lilita One, Nunito, JetBrains Mono — SIL Open Font License 1.1, self-hosted via Fontsource'] },
      { heading: '3D models and images', paragraphs: ['3D models, interfaces and visuals are made for the project unless stated otherwise in the source repository.'] },
    ],
  },
}
