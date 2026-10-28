/** Public marketing copy (landing, skin shop, FAQ). Pure data: rendered by the views and prerendered at build. */
import type { Locale } from '../seo/site'

interface Feature {
  icon: 'map' | 'home' | 'shirt' | 'users' | 'sparkles' | 'globe'
  title: string
  body: string
}

interface Faq {
  q: string
  a: string
}

interface TitledText {
  title: string
  body: string
}

export interface MarketingCopy {
  heroBadge: string
  heroTitle: string
  heroLead: string
  features: Feature[]
  faqTitle: string
  faq: Faq[]
  /** Intro of the skin shop, shown above the catalog and prerendered for crawlers (the catalog itself loads from the API). */
  shop: { title: string; lead: string; aboutTitle: string; sections: TitledText[] }
}

export const marketing: Record<Locale, MarketingCopy> = {
  en: {
    heroBadge: 'Season 1 · New Nation is live',
    heroTitle: 'CampusCove — free multiplayer 3D campus game in your browser',
    heroLead: 'Your virtual campus. Hang out, build your space and meet people — all in one cozy 3D town.',
    features: [
      { icon: 'map', title: 'Explore the town', body: 'Roam a living campus town with friends in real time: plaza, café, pond, workplaces and more.' },
      { icon: 'home', title: 'Own your loft', body: 'Rent or buy an apartment and furnish it piece by piece from the Cove Home store.' },
      { icon: 'shirt', title: 'Dress to impress', body: 'Unlock skins and build a look nobody else has.' },
      { icon: 'users', title: 'Play with friends', body: 'Add friends, give them a key to your place and meet up anywhere in town.' },
      { icon: 'sparkles', title: 'Work, fish, cook', body: 'Earn coins with jobs, fishing and cooking, and keep your character fed and rested.' },
      { icon: 'globe', title: 'No download', body: 'Runs in any modern desktop browser. Create an account and you are in town in seconds.' },
    ],
    faqTitle: 'Frequently asked questions',
    faq: [
      { q: 'Is CampusCove free?', a: 'Yes. CampusCove is free to play. It is a non-commercial school project: no real-money purchase is open.' },
      { q: 'Do I need to download anything?', a: 'No. CampusCove runs in your browser (Chrome, Edge, Firefox or Safari on desktop) using WebGL.' },
      { q: 'What is the minimum age?', a: 'You must be at least 15 years old to create an account.' },
      { q: 'Can I play with my friends?', a: 'Yes, the town is multiplayer in real time. Add friends from the Friends page and meet them in game.' },
      { q: 'What happens to my data?', a: 'Only what the game needs is stored, with no advertising and no trackers. You can download or delete your data from your profile at any time.' },
    ],
    shop: {
      title: 'Skin shop',
      lead: 'Outfits and cosmetics to change your character’s look, with a 3D preview before you unlock them.',
      aboutTitle: 'About the skin shop',
      sections: [
        { title: 'Five rarities', body: 'Every skin has a rarity: common, uncommon, rare, epic or legendary. Legendary skins are the fully rigged premium outfits.' },
        { title: 'Coins and premium currency', body: 'Most skins are unlocked with coins earned in game from jobs, fishing and cooking. Some are priced in premium currency. No real-money purchase is open: CampusCove is a non-commercial school project.' },
        { title: 'Try before you unlock', body: 'Select a skin to see it on your character in 3D, then equip it from your locker once it is yours.' },
        { title: 'Looking for furniture?', body: 'Furniture is not sold here: walk into the Cove Home store, east of the business district, to furnish your loft.' },
      ],
    },
  },
  fr: {
    heroBadge: 'Saison 1 · New Nation est en ligne',
    heroTitle: 'CampusCove — jeu de campus 3D multijoueur gratuit dans le navigateur',
    heroLead: 'Ton campus virtuel. Retrouve tes amis, aménage ton chez-toi et rencontre du monde, dans une petite ville 3D chaleureuse.',
    features: [
      { icon: 'map', title: 'Explore la ville', body: 'Parcours un campus vivant avec tes amis en temps réel : place, café, étang, lieux de travail et plus encore.' },
      { icon: 'home', title: 'Ton propre loft', body: 'Loue ou achète un appartement et meuble-le pièce par pièce au magasin Cove Home.' },
      { icon: 'shirt', title: 'Ton style', body: 'Débloque des skins et crée un look unique.' },
      { icon: 'users', title: 'Joue entre amis', body: 'Ajoute des amis, donne-leur une clé de chez toi et retrouvez-vous partout en ville.' },
      { icon: 'sparkles', title: 'Travaille, pêche, cuisine', body: 'Gagne des pièces grâce aux jobs, à la pêche et à la cuisine, et garde ton personnage en forme.' },
      { icon: 'globe', title: 'Sans téléchargement', body: 'Fonctionne dans n’importe quel navigateur récent sur ordinateur. Crée un compte, tu es en ville en quelques secondes.' },
    ],
    faqTitle: 'Questions fréquentes',
    faq: [
      { q: 'CampusCove est-il gratuit ?', a: 'Oui. CampusCove est gratuit. C’est un projet scolaire non commercial : aucun achat en argent réel n’est ouvert.' },
      { q: 'Faut-il télécharger quelque chose ?', a: 'Non. CampusCove fonctionne dans le navigateur (Chrome, Edge, Firefox ou Safari sur ordinateur) grâce à WebGL.' },
      { q: 'Quel est l’âge minimum ?', a: 'Il faut avoir au moins 15 ans pour créer un compte.' },
      { q: 'Puis-je jouer avec mes amis ?', a: 'Oui, la ville est multijoueur en temps réel. Ajoute tes amis depuis la page Amis et retrouve-les en jeu.' },
      { q: 'Que deviennent mes données ?', a: 'Seules les données nécessaires au jeu sont conservées, sans publicité ni traceur. Tu peux les télécharger ou les supprimer depuis ton profil à tout moment.' },
    ],
    shop: {
      title: 'Boutique de skins',
      lead: 'Des tenues et cosmétiques pour changer le look de ton personnage, avec un aperçu 3D avant de les débloquer.',
      aboutTitle: 'À propos de la boutique',
      sections: [
        { title: 'Cinq raretés', body: 'Chaque skin a une rareté : commun, peu commun, rare, épique ou légendaire. Les skins légendaires sont les tenues premium entièrement animées.' },
        { title: 'Pièces et monnaie premium', body: 'La plupart des skins se débloquent avec les pièces gagnées en jeu grâce aux jobs, à la pêche et à la cuisine. Certains sont proposés en monnaie premium. Aucun achat avec de l’argent réel n’est ouvert : CampusCove est un projet scolaire non commercial.' },
        { title: 'Essaie avant de débloquer', body: 'Sélectionne un skin pour le voir en 3D sur ton personnage, puis équipe-le depuis ton casier une fois qu’il est à toi.' },
        { title: 'Tu cherches des meubles ?', body: 'Les meubles ne sont pas vendus ici : entre dans le magasin Cove Home, à l’est du quartier des affaires, pour meubler ton loft.' },
      ],
    },
  },
}
