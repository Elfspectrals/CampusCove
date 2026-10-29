import { SITE } from '../../seo/site'
import type { LegalDocs } from './types'

const P = SITE.publisher
const hosts = SITE.hosts.map((h) => `${h.role} : ${h.name}, ${h.address} — ${h.site}`)

export const legalFr: LegalDocs = {
  'legal-notice': {
    title: 'Mentions légales',
    description: `Éditeur, directeur de la publication et hébergeurs du site ${SITE.name} (loi pour la confiance dans l’économie numérique).`,
    sections: [
      {
        heading: 'Éditeur du site',
        paragraphs: [
          `${SITE.name} (${SITE.url}) est édité par ${P.name}, ${P.status}.`,
          `Contact : ${P.contactEmail}. Conformément à l’article 6-III-2 de la LCEN, l’éditeur non professionnel peut ne tenir à disposition du public que les coordonnées de son hébergeur, auquel il a communiqué ses éléments d’identification.`,
        ],
      },
      { heading: 'Directeur de la publication', paragraphs: [P.director] },
      { heading: 'Hébergement', items: hosts },
      {
        heading: 'Propriété intellectuelle',
        paragraphs: [
          `Le code, les modèles 3D, les textes, logos et éléments graphiques de ${SITE.name} sont protégés par le droit d’auteur. Toute reproduction sans autorisation est interdite, sauf mention contraire (voir la page Crédits pour les éléments sous licence libre).`,
        ],
      },
      {
        heading: 'Signaler un contenu illicite',
        paragraphs: [
          `Tout contenu manifestement illicite (pseudonyme, décoration, comportement) peut être signalé avec le bouton « Signaler » de la page Amis ou à ${P.contactEmail}, en précisant le pseudonyme concerné, la nature du contenu et les raisons du signalement. Les signalements sont traités sans délai injustifié ; l’auteur du signalement est informé de la suite donnée et le joueur sanctionné reçoit une décision motivée qu’il peut contester.`,
        ],
      },
    ],
  },

  privacy: {
    title: 'Politique de confidentialité',
    description: `Quelles données ${SITE.name} collecte, pourquoi, combien de temps elles sont conservées et comment exercer vos droits RGPD.`,
    sections: [
      {
        heading: 'Responsable du traitement',
        paragraphs: [
          `Le responsable du traitement est ${P.name} (${P.status}). Pour toute question ou demande relative à vos données : ${P.privacyEmail}.`,
          'Aucun délégué à la protection des données (DPO) n’est désigné : il n’est pas obligatoire pour ce traitement (art. 37 RGPD) ; l’adresse ci-dessus en tient lieu.',
        ],
      },
      {
        heading: 'Données collectées et finalités',
        items: [
          'Compte : adresse e-mail, pseudonyme, mot de passe (stocké uniquement sous forme hachée), date d’inscription et de dernière connexion — pour créer et sécuriser votre compte (exécution du contrat, art. 6.1.b RGPD).',
          'Consentements : date et version des CGU acceptées, déclaration d’âge — pour pouvoir prouver votre accord (intérêt légitime, art. 6.1.f, et art. 7.1 RGPD).',
          'E-mails de service : adresse e-mail — pour réinitialiser votre mot de passe, vous prévenir avant la suppression d’un compte inactif et vous informer de la suite donnée à un signalement (exécution du contrat ; obligation légale pour les décisions de modération, règlement européen sur les services numériques). Aucun e-mail publicitaire n’est envoyé.',
          'Données de jeu : inventaire, portefeuille de pièces et de monnaie premium, logements, meubles placés, apparence, statistiques de survie, amis et parrainages — pour faire fonctionner le jeu (exécution du contrat).',
          'Position et actions en temps réel : transmises aux autres joueurs de la même zone pendant la partie, non conservées après la session (exécution du contrat).',
          'Signalements et sanctions : contenu du signalement, joueurs concernés, décision de modération — pour la sécurité de la communauté (intérêt légitime, art. 6.1.f).',
          'Journaux techniques de l’hébergeur (adresse IP, date, page demandée) : sécurité et lutte contre les abus (intérêt légitime). Le parrainage n’utilise jamais l’adresse IP.',
          'Achats (si activés) : historique des transactions et factures — obligations comptables (obligation légale). Les données de carte bancaire sont traitées uniquement par le prestataire de paiement, jamais par nous.',
        ],
      },
      {
        heading: 'Ce que nous ne faisons pas',
        items: [
          'Aucune publicité, aucun profilage publicitaire, aucune revente de données.',
          'Aucun traceur de mesure d’audience ou de réseau social n’est déposé à ce jour.',
          'Aucune décision automatisée produisant des effets juridiques (art. 22 RGPD).',
        ],
      },
      {
        heading: 'Données obligatoires',
        paragraphs: [
          'L’adresse e-mail, le pseudonyme, le mot de passe, l’acceptation des CGU et la déclaration d’âge sont nécessaires à la création du compte : sans eux, l’inscription est impossible.',
        ],
      },
      {
        heading: 'Durées de conservation',
        items: [
          `Compte et données de jeu : tant que le compte est actif, puis anonymisation automatique après ${SITE.inactiveAccountMonths} mois sans connexion (un e-mail vous prévient 30 jours avant ; une connexion suffit à garder le compte), ou immédiatement si vous supprimez votre compte.`,
          'Preuves de consentement : durée du compte.',
          'Signalements : supprimés 1 an après la décision ; le texte d’un signalement est effacé dès la suppression du compte de son auteur. Sanctions : durée de la sanction.',
          'Pièces comptables : 10 ans (Code de commerce, art. L123-22).',
          'Journaux techniques : 12 mois maximum.',
        ],
      },
      {
        heading: 'Destinataires et sous-traitants',
        paragraphs: [
          'Vos données ne sont accessibles qu’à l’éditeur et à ses sous-traitants techniques, liés par contrat (art. 28 RGPD) :',
        ],
        items: [
          ...hosts,
          `Envoi des e-mails : ${SITE.mailProvider}.`,
          'Polices de caractères : hébergées sur nos propres serveurs, aucune requête n’est envoyée à Google.',
          'Les autres joueurs voient votre pseudonyme, votre apparence, votre position en jeu et votre logement si vous les y invitez.',
        ],
      },
      {
        heading: 'Transferts hors de l’Union européenne',
        paragraphs: [
          'Vercel Inc. est établi aux États-Unis et adhère au Data Privacy Framework UE–États-Unis (décision d’adéquation du 10 juillet 2023), complété par des clauses contractuelles types de la Commission européenne.',
          'Salesforce, Inc. (Heroku), qui héberge l’API, la base de données et le serveur temps réel, est établi aux États-Unis : il adhère au Data Privacy Framework UE–États-Unis et applique les règles d’entreprise contraignantes (BCR) de Salesforce pour les sous-traitants (art. 45 et 47 RGPD).',
          'Brevo, qui envoie les e-mails, est établi en France et héberge les données dans l’Union européenne : aucun transfert.',
        ],
      },
      {
        heading: 'Vos droits',
        paragraphs: [
          'Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition, de portabilité, ainsi que du droit de retirer votre consentement à tout moment et de définir des directives sur le sort de vos données après votre décès.',
          `Depuis votre profil, vous pouvez directement télécharger toutes vos données (format JSON) et supprimer votre compte. Pour les autres demandes : ${P.privacyEmail}. Nous répondons sous un mois maximum.`,
          'Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — www.cnil.fr.',
        ],
      },
      {
        heading: 'Mineurs',
        paragraphs: [
          `${SITE.name} est réservé aux personnes de ${SITE.minimumAge} ans et plus (article 45 de la loi Informatique et Libertés). L’âge est déclaré lors de l’inscription. Si nous apprenons qu’un compte appartient à une personne plus jeune, il est supprimé.`,
        ],
      },
      {
        heading: 'Sécurité et violation de données',
        paragraphs: [
          'Mots de passe hachés, connexions chiffrées (HTTPS), jetons d’accès révocables, limitation des tentatives de connexion. En cas de violation de données présentant un risque, la CNIL est notifiée sous 72 heures et les personnes concernées sont informées si le risque est élevé (art. 33 et 34 RGPD).',
        ],
      },
      {
        heading: 'Modifications',
        paragraphs: [`Version du ${SITE.legalVersion}. Toute modification importante vous sera présentée à votre prochaine connexion, avec une demande d’acceptation.`],
      },
    ],
  },

  cookies: {
    title: 'Cookies et traceurs',
    description: `Liste exhaustive des cookies et du stockage local utilisés par ${SITE.name}, et comment gérer vos choix.`,
    sections: [
      {
        heading: 'Notre approche',
        paragraphs: [
          `${SITE.name} n’utilise aucun cookie publicitaire, de mesure d’audience ou de réseau social. Nous utilisons uniquement le stockage local de votre navigateur (localStorage) pour des besoins strictement nécessaires au service que vous demandez ; ils sont exemptés de consentement (article 82 de la loi Informatique et Libertés, lignes directrices de la CNIL).`,
          'Si un traceur soumis à consentement est ajouté à l’avenir, un bandeau vous permettra de l’accepter ou de le refuser aussi simplement, avant tout dépôt, et vous pourrez changer d’avis à tout moment via le lien « Gérer les cookies » en bas de page.',
        ],
      },
      {
        heading: 'Stockage strictement nécessaire',
        items: [
          'campus_cove_auth — votre session (jeton de connexion et profil) — jusqu’à la déconnexion.',
          'campus_cove_wallet_balances — cache de vos soldes pour l’affichage — jusqu’à la déconnexion.',
          'cc_locale — langue choisie — jusqu’à suppression.',
          'cc_consent — vos choix en matière de traceurs — 6 mois.',
          'cc_graphics_quality, cc.reducedEffects, cc.comfort — réglages graphiques et d’accessibilité du jeu — jusqu’à suppression.',
          'cc_keybindings — tes touches personnalisées (Paramètres) — jusqu’à suppression ou remise par défaut.',
          'campus_cove_admin_mode, cc.admin.worldPlanner.v1 — outils d’administration (comptes administrateurs uniquement).',
        ],
      },
      {
        heading: 'Gérer ou supprimer ces données',
        paragraphs: [
          'Vous pouvez à tout moment effacer le stockage local depuis les paramètres de votre navigateur (Données de site). Vous serez alors déconnecté et vos réglages reviendront aux valeurs par défaut.',
        ],
      },
    ],
  },

  terms: {
    title: 'Conditions générales d’utilisation',
    description: `Règles d’accès et d’utilisation du jeu ${SITE.name} : compte, comportement, monnaies virtuelles, sanctions et responsabilité.`,
    sections: [
      {
        heading: '1. Objet et statut du projet',
        paragraphs: [
          `Les présentes CGU régissent l’accès au jeu en ligne ${SITE.name}, édité par ${P.name}. ${SITE.name} est actuellement un projet scolaire, édité par un particulier, sans but lucratif.`,
          'Aucune vente réelle n’est réalisée dans le cadre de ce projet scolaire. Si des ventes contre de l’argent réel étaient ouvertes un jour, elles nécessiteraient que l’éditeur adopte un statut professionnel (par exemple micro-entreprise) et seraient soumises aux Conditions générales de vente, qui prévaudraient alors pour tout achat.',
        ],
      },
      {
        heading: '2. Acceptation',
        paragraphs: ['La création d’un compte vaut acceptation des CGU, de la Politique de confidentialité et des Règles de la communauté. La version acceptée et sa date sont conservées.'],
      },
      {
        heading: '3. Âge minimum et compte',
        items: [
          `Vous devez avoir au moins ${SITE.minimumAge} ans.`,
          'Un seul compte par personne ; les informations fournies doivent être exactes.',
          'Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité sur votre compte.',
          'Le pseudonyme ne doit pas usurper l’identité d’autrui ni être injurieux, haineux ou à caractère sexuel.',
        ],
      },
      {
        heading: '4. Comportement',
        paragraphs: ['Vous vous engagez à respecter les Règles de la communauté. Sont notamment interdits : la triche, l’exploitation de bugs, l’automatisation (bots), le harcèlement, les contenus illicites, l’atteinte au fonctionnement des serveurs.'],
      },
      {
        heading: '5. Monnaies et objets virtuels',
        items: [
          'Les pièces, la monnaie premium, les skins, meubles et logements sont des licences d’utilisation personnelles, non transférables et sans valeur monétaire ; ils ne sont ni remboursables, ni échangeables contre de l’argent, sauf disposition légale contraire.',
          'Les locations de logement durent 7 jours. À l’expiration, le logement est libéré et les meubles qui y sont placés sont supprimés : pensez à les récupérer avant.',
          'L’éditeur peut ajuster l’équilibre du jeu (prix, gains, objets) pour garantir l’équité.',
        ],
      },
      {
        heading: '6. Sanctions',
        paragraphs: ['En cas de manquement, l’éditeur peut, de manière proportionnée : avertir, suspendre temporairement ou bannir le compte, et retirer les objets obtenus frauduleusement. La décision est motivée ; vous pouvez la contester à ' + P.contactEmail + '.'],
      },
      {
        heading: '7. Signalement',
        paragraphs: ['Tout joueur peut signaler un pseudonyme ou un comportement depuis la page Amis ou à ' + P.contactEmail + '. Les signalements abusifs peuvent eux-mêmes être sanctionnés.'],
      },
      {
        heading: '8. Disponibilité et responsabilité',
        paragraphs: ['Le service est fourni « en l’état », sans garantie de disponibilité continue. Il peut être interrompu pour maintenance ou définitivement arrêté ; dans ce dernier cas, les joueurs seront prévenus au moins 30 jours à l’avance lorsque cela est possible. La responsabilité de l’éditeur ne saurait être engagée pour les dommages indirects.'],
      },
      {
        heading: '9. Résiliation',
        paragraphs: ['Vous pouvez supprimer votre compte à tout moment depuis votre profil. Les objets virtuels sont alors définitivement perdus.'],
      },
      {
        heading: '10. Modification des CGU et droit applicable',
        paragraphs: [
          'Les CGU peuvent évoluer ; la nouvelle version vous sera présentée à la connexion. Les présentes CGU sont soumises au droit français. En cas de litige, une solution amiable sera recherchée avant toute action ; à défaut, les tribunaux compétents sont ceux prévus par la loi.',
          `Version du ${SITE.legalVersion}.`,
        ],
      },
    ],
  },

  sales: {
    title: 'Conditions générales de vente',
    description: `Conditions applicables à l’achat de monnaie premium et de contenus numériques sur ${SITE.name} : prix, paiement, droit de rétractation, remboursement.`,
    sections: [
      {
        heading: 'Statut actuel',
        paragraphs: [
          `Aucune vente contre de l’argent réel n’est ouverte à ce jour : ${SITE.name} est un projet scolaire non commercial. Les conditions ci-dessous s’appliqueront dès l’ouverture des achats, qui sera précédée de l’adoption d’un statut professionnel par l’éditeur et de la mise à jour des mentions légales (SIRET, adresse, médiateur).`,
        ],
      },
      {
        heading: '1. Produits',
        paragraphs: ['Monnaie premium et contenus numériques (skins, objets cosmétiques) fournis sans support matériel, utilisables uniquement dans le jeu, décrits sur leur fiche avant l’achat.'],
      },
      {
        heading: '2. Prix et paiement',
        paragraphs: ['Les prix sont indiqués en euros toutes taxes comprises. Le paiement est exigible à la commande et traité par un prestataire de paiement sécurisé ; l’éditeur n’a jamais accès à vos données bancaires. Le bouton de validation porte la mention « Commande avec obligation de paiement ».'],
      },
      {
        heading: '3. Livraison',
        paragraphs: ['Le contenu est crédité sur votre compte immédiatement après la confirmation du paiement. Une confirmation de commande vous est envoyée par e-mail.'],
      },
      {
        heading: '4. Droit de rétractation',
        paragraphs: [
          'Conformément à l’article L221-28 13° du Code de la consommation, le droit de rétractation de 14 jours ne peut être exercé pour un contenu numérique fourni immédiatement, dès lors que vous avez expressément demandé cette exécution immédiate et reconnu perdre votre droit de rétractation. Cet accord vous est demandé par une case à cocher distincte avant le paiement. À défaut d’accord, le contenu n’est livré qu’à l’issue du délai de 14 jours.',
        ],
      },
      {
        heading: '5. Garantie de conformité',
        paragraphs: ['Les contenus numériques bénéficient de la garantie légale de conformité (articles L224-25-12 et suivants du Code de la consommation). En cas de défaut, contactez ' + P.contactEmail + ' : le contenu sera mis en conformité ou remboursé.'],
      },
      {
        heading: '6. Remboursement et fermeture',
        paragraphs: ['En cas d’arrêt définitif du service, la monnaie premium achetée et non dépensée dans les 6 mois précédents sera remboursée. Un compte banni pour triche ne donne lieu à aucun remboursement, sauf décision contraire d’un tribunal.'],
      },
      {
        heading: '7. Mineurs',
        paragraphs: ['Les achats d’un joueur mineur doivent être effectués avec l’accord de son représentant légal.'],
      },
      {
        heading: '8. Médiation et litiges',
        paragraphs: [
          'Avant toute procédure, contactez ' + P.contactEmail + '. Vous pouvez ensuite recourir gratuitement à un médiateur de la consommation (articles L611-1 et suivants), dont les coordonnées seront indiquées ici à l’ouverture des ventes. Droit applicable : droit français.',
        ],
      },
    ],
  },

  community: {
    title: 'Règles de la communauté',
    description: `Les règles de vie de ${SITE.name} : respect, fair-play, pseudonymes, signalements et sanctions.`,
    sections: [
      {
        heading: 'Respect',
        items: [
          'Pas de harcèlement, d’insultes, de menaces ni de discrimination.',
          'Pas de contenu sexuel, violent ou haineux dans les pseudonymes ou les décorations.',
          'Pas d’usurpation d’identité ni de partage d’informations personnelles d’autrui.',
        ],
      },
      {
        heading: 'Fair-play',
        items: [
          'Pas de triche, de logiciel tiers, de bot ni d’exploitation de bugs — signalez-les plutôt.',
          'Pas de vente de comptes ni d’objets contre de l’argent réel en dehors du jeu.',
          'Pas d’arnaque entre joueurs (échanges, clés de logement).',
        ],
      },
      {
        heading: 'Signaler',
        paragraphs: ['Depuis la page Amis, utilisez « Signaler » sur un joueur, ou écrivez à ' + P.contactEmail + '. Vous pouvez aussi bloquer un joueur.'],
      },
      {
        heading: 'Sanctions graduées',
        items: ['Avertissement', 'Suspension temporaire', 'Bannissement définitif en cas de récidive ou de faute grave'],
      },
    ],
  },

  accessibility: {
    title: 'Déclaration d’accessibilité',
    description: `État de l’accessibilité de ${SITE.name} au regard du RGAA 4.1 et voies de recours.`,
    sections: [
      {
        heading: 'État de conformité',
        paragraphs: [
          `${SITE.name} est partiellement conforme au RGAA 4.1. Les pages du site (accueil, inscription, boutique, pages légales) ont été conçues pour être navigables au clavier, lisibles par les lecteurs d’écran et contrastées. Le jeu 3D en temps réel ne peut pas être rendu entièrement accessible par nature.`,
        ],
      },
      {
        heading: 'Mesures prises',
        items: [
          'Lien d’évitement vers le contenu principal.',
          'Langue déclarée sur chaque page, titres hiérarchisés, libellés de formulaires.',
          'Respect du réglage système « réduire les animations ».',
          'Option « effets réduits » dans le jeu (flous, tremblements de caméra).',
        ],
      },
      {
        heading: 'Non-conformités connues',
        items: [
          'Le jeu 3D nécessite une souris et un clavier et n’est pas exploitable au lecteur d’écran.',
          'Certaines interfaces internes au jeu ne sont disponibles qu’en anglais.',
        ],
      },
      {
        heading: 'Retour et contact',
        paragraphs: [
          'Si vous rencontrez un défaut d’accessibilité, écrivez à ' + P.contactEmail + '. Si vous n’obtenez pas de réponse satisfaisante, vous pouvez saisir le Défenseur des droits (www.defenseurdesdroits.fr).',
        ],
      },
    ],
  },

  credits: {
    title: 'Crédits et licences',
    description: `Technologies, polices et ressources utilisées par ${SITE.name}, avec leurs licences.`,
    sections: [
      {
        heading: 'Technologies',
        items: [
          'Vue.js, Vue Router, Vue I18n — licence MIT',
          'Three.js — licence MIT',
          'Rapier (physique) — licence Apache 2.0',
          'Colyseus (multijoueur) — licence MIT',
          'Laravel — licence MIT',
          'Tailwind CSS — licence MIT',
        ],
      },
      {
        heading: 'Polices',
        items: ['Lilita One, Nunito, JetBrains Mono — SIL Open Font License 1.1, auto-hébergées via Fontsource'],
      },
      {
        heading: 'Modèles 3D et images',
        paragraphs: ['Les modèles 3D, interfaces et visuels sont créés pour le projet, sauf mention contraire dans le dépôt du code source.'],
      },
    ],
  },
}
