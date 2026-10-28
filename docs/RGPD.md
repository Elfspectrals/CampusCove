# RGPD & conformité — documents internes

Documents exigés en cas de contrôle (non publiés). Les textes publics sont dans `front/src/content/legal/` et les valeurs partagées (éditeur, hébergeurs, âge, durée de conservation) dans `front/src/seo/site.ts`.

## 1. Registre des activités de traitement (art. 30)

Responsable : l'éditeur (voir `SITE.publisher`). Pas de DPO obligatoire (pas de traitement à grande échelle de données sensibles ni de suivi systématique, art. 37) ; contact : `SITE.publisher.privacyEmail`.

Personnes concernées : joueurs inscrits (15 ans et plus) ; visiteurs du site pour les seuls journaux techniques.

| Traitement | Données | Base légale | Durée | Destinataires |
|---|---|---|---|---|
| Gestion des comptes | e-mail, pseudo, mot de passe haché, dates d'inscription et de dernière connexion | Contrat (6.1.b) | Vie du compte ; e-mail de préavis à 35 mois d'inactivité, anonymisation à 36 mois | Hébergeur backend |
| Preuve des consentements | `terms_version`, `terms_accepted_at`, `age_confirmed_at` | Intérêt légitime à prouver l'acceptation (6.1.f, art. 7.1) | Vie du compte | — |
| Actualités par e-mail | e-mail, `marketing_opt_in` | Consentement (6.1.a), retirable depuis le profil (`PATCH /api/account/preferences`) | Jusqu'au retrait ou à la suppression du compte | Brevo |
| E-mails de service | e-mail, `inactivity_warned_at`, jeton de réinitialisation (haché, 60 min) | Contrat (6.1.b) ; obligation légale DSA pour les décisions de modération (6.1.c) | Le temps de l'envoi ; jeton supprimé à l'usage ou à expiration | Brevo |
| Fonctionnement du jeu | inventaire, portefeuilles, logements, meubles, survie, amis, parrainages (sans IP) | Contrat | Vie du compte | Hébergeur backend, serveur temps réel |
| Temps réel | position, actions | Contrat | Session uniquement (mémoire) | Joueurs de la même zone |
| Modération | `player_reports` (dont `details`, `decision_note`), sanctions (`banned_at`, `suspended_until`) | Intérêt légitime (6.1.f) ; DSA art. 16-17 | Signalement supprimé 1 an après décision, `details` effacé à la suppression du compte de l'auteur ; sanction : sa durée | Administrateurs |
| Sécurité / anti-abus | IP (limitation de débit `throttle`, cache quelques minutes), journaux de l'hébergeur (IP, URL, date) | Intérêt légitime | Minutes pour le cache, 12 mois max pour les journaux | Hébergeurs |
| Ventes (non ouvertes) | transactions, factures | Obligation légale | 10 ans | Prestataire de paiement |

Mesures de sécurité (art. 32) : HTTPS + HSTS, mots de passe hachés (bcrypt), jetons Sanctum révocables (tous révoqués à la connexion et à la suppression), limitation des tentatives (`throttle:10,1` sur l'authentification), mot de passe exigé pour supprimer le compte, en-têtes de sécurité (`front/vercel.json`), accès admin restreint (middleware `admin`).

Transferts hors UE : Vercel (DPF + CCT), Salesforce/Heroku (DPF + BCR sous-traitant). Brevo : UE, pas de transfert.

## 2. Droits des personnes

- Accès / portabilité : `GET /api/account/export` (bouton « Télécharger mes données » sur le profil). Toute table ayant une colonne `account_id` / `*_account_id` est incluse automatiquement ; mots de passe et jetons exclus. `player_reports` est exporté à part (art. 15.4) : signalements déposés en entier, signalements reçus sans l'identité du signaleur ni son texte.
- Effacement : `DELETE /api/account` (mot de passe requis) → `AccountPrivacyService::anonymize` : e-mail, pseudo, mot de passe, rôles, amitiés, OAuth, jetons, logement supprimés ou anonymisés, texte des signalements déposés effacé ; le grand livre reste cohérent mais n'identifie plus personne.
- Retrait du consentement aux actualités : case sur le profil (`PATCH /api/account/preferences`).
- Changement des CGU / de la politique : monter `SITE.legalVersion` (front) **et** `AuthController::TERMS_VERSION` (backend) ; `GET /api/user` renvoie alors `terms_current: false` et le front affiche `TermsUpdateDialog` (acceptation via `POST /api/account/terms`).
- Autres demandes (rectification, opposition, limitation) : par e-mail `SITE.publisher.privacyEmail`, réponse sous 1 mois.

## 3. Limitation de conservation

`php artisan accounts:purge-inactive` (planifié chaque jour à 04:00, `bootstrap/app.php`) :
1. envoie un e-mail de préavis aux comptes non administrateurs qui atteindront 36 mois sans connexion dans les 30 jours (`inactivity_warned_at`) ; une connexion annule le préavis ;
2. anonymise ceux toujours inactifs 30 jours après le préavis ;
3. supprime les signalements résolus depuis plus d'un an.

Les comptes administrateurs sont ceux de l'éditeur et ne sont pas purgés. Garder 36 mois alignés avec `SITE.inactiveAccountMonths` et la politique de confidentialité.

## 4. Procédure en cas de violation de données (art. 33–34)

1. Contenir : révoquer les jetons (`personal_access_tokens`), changer les secrets (`APP_KEY`, mots de passe BDD, `REALTIME_SHARED_SECRET`), couper l'accès compromis.
2. Évaluer : données touchées, nombre de personnes, risque (e-mails ? mots de passe hachés ?).
3. Notifier la CNIL sous **72 h** (notifications.cnil.fr) si risque pour les personnes.
4. Informer les joueurs sans délai si risque élevé (e-mail + bannière).
5. Consigner l'incident ci-dessous même sans notification.

| Date | Nature | Personnes | Mesures | Notifié CNIL |
|---|---|---|---|---|
| — | — | — | — | — |

## 5. Sous-traitants (art. 28)

- Vercel Inc. (front, USA, Data Privacy Framework + CCT) — DPA : vercel.com/legal/dpa
- Salesforce, Inc. — Heroku (API, PostgreSQL, serveur Colyseus ; USA, Data Privacy Framework + BCR sous-traitant Salesforce) — DPA : salesforce.com/company/legal/agreements (Data Processing Addendum).
- Brevo / Sendinblue SAS (e-mails ; France, données en UE, pas de transfert) — DPA : brevo.com/legal/termsofuse (annexe traitement des données). Configuration : variables `MAIL_*` sur Heroku (relais SMTP `smtp-relay.brevo.com:587`). Tant que `MAIL_MAILER=log`, aucun e-mail ne part et la purge refuse de tourner en production.

## 6. Traceurs

Aucun traceur soumis à consentement. Le stockage local utilisé est listé dans la page Cookies. Pour en ajouter un : passer `inUse: true` dans `front/src/privacy/consent.ts`, le charger uniquement via `whenConsented(...)`, mettre à jour la page Cookies (FR + EN).

## 7. Avant ouverture des ventes

- Statut professionnel (micro-entreprise), SIRET dans les mentions légales.
- Médiateur de la consommation dans les CGV.
- Case de renonciation au droit de rétractation (L221-28 13°) + bouton « Commande avec obligation de paiement ».
- Facturation et conservation 10 ans.

## 8. À compléter par l'éditeur

Placeholders dans `front/src/seo/site.ts` et `front/public/.well-known/security.txt` : nom de l'éditeur et e-mails de contact. Domaine de production : `https://campus-cove.vercel.app` (`SITE.url`, surchargeable par `VITE_SITE_URL`).
