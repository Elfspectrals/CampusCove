# Boutique de gems — démonstration Stripe (mode test uniquement)

CampusCove est un projet scolaire : **aucune vente réelle n'est ouverte**. La boutique de gems est une démonstration technique de paiement. Elle passe par **Stripe Checkout en mode test uniquement** : on paie avec les cartes de test officielles de Stripe et **aucun argent n'est débité**. Les gems arrivent pourtant bien dans le portefeuille premium du jeu, et les remboursements simulés les retirent.

L'interface affiche partout « **Paiement de démonstration — aucun argent débité** » : page `/gems`, modale de confirmation, page de retour, et page Stripe (`custom_text`). Les e-mails le précisent aussi.

**Hors périmètre** : ouverture commerciale (statut, SIRET, médiateur), facturation légale, configuration fiscale (Stripe Tax), clés de production. Les textes légaux indiquant qu'aucune vente réelle n'est ouverte sont conservés. Les CGV restent celles d'une éventuelle ouverture future et précisent qu'elles ne s'appliquent pas à la démo.

## 1. Garde-fous « test uniquement »

| Où | Garde-fou |
|---|---|
| `App\Support\GemCheckoutConfig` | La démo n'est ouverte qu'avec `GEMS_CHECKOUT_MODE=test` **et** une clé `sk_test_` / `rk_test_` **et** un secret `whsec_`. Une clé seule n'ouvre rien. Toute autre valeur de mode vaut `off`. |
| Clé `sk_live_` / `rk_live_` | Refusée partout : `GET /api/gems/packs` renvoie `available: false`, la commande renvoie 503 `gems_unavailable`, le webhook renvoie 503 `live_key_refused` (log d'erreur), `gems:reconcile` échoue. |
| `StripeSdkGateway` | Refuse d'appeler l'API Stripe sans clé de test, avant toute requête HTTP. |
| Webhook | Tout événement `livemode: true` est ignoré. |
| Base de données | `ck_gem_orders_test_only CHECK (livemode = false)` : une commande de production ne peut pas exister. |
| Vérification avant crédit | Session et PaymentIntent doivent être `livemode: false`, sinon `livemode_mismatch`. |
| Stripe CLI Docker | `docker/stripe-cli/listen.sh` refuse de démarrer (code 64) avec une clé `sk_live_` / `rk_live_`, vide ou qui n'est pas une clé de test, avant tout appel à Stripe. |
| Serveur partagé | Avec `APP_ENV=production` et `GEMS_CHECKOUT_MODE=test`, seuls les administrateurs peuvent commander (§3). |

## 2. Fonctionnement

```
/gems  ──POST /api/gems/orders {pack, locale}──▶  GemCheckoutService
                                                   1. ligne gem_orders (status creating) + bail de création — transaction courte, verrou du compte
                                                   2. hors transaction : Checkout Session (clé d'idempotence gem-order-<uuid>)
        ◀── checkout_url ──                        3. status open, bail rendu
        ◀── 202 checkout_preparing ──              (requête arrivée pendant l'étape 2 : le navigateur interroge GET /gems/orders/{id})
navigateur ──▶ checkout.stripe.com (mode test, carte de test)
Stripe ──POST /api/stripe/webhook (signé)──▶  StripeWebhookService
                                                   signature vérifiée sur le corps brut, puis état relu via l'API Stripe
                                                   GemOrderFulfillmentService : verrou gem_orders → verrou wallet
                                                   → transaction premium_purchase + wallet_ledger +gems, livraison atomique
/gems/return?order=… ──GET /api/gems/orders/{id}──▶ état réel (+ consultation Stripe si webhook en retard)
                                                   + wallet_summary → cache du portefeuille (api/session.ts)
```

- **Catalogue** : `backend/app/Support/GemPackCatalog.php` est la seule source. Le front n'affiche que ce que renvoie `GET /api/gems/packs`. Packs (prix simulés, en centimes, EUR) : `gems_100` 199, `gems_300` 499, `gems_650` 999, `gems_1400` 1 999. Les quantités incluent un éventuel bonus. Chaque commande copie gems, montant et devise, donc modifier un pack ne réécrit pas l'historique.
- **Client** : il n'envoie que `pack` et `locale`. Le compte, le montant, la devise, les gems et les URLs de retour sont fixés par le serveur. Les champs ajoutés par le navigateur sont ignorés (testé).
- **Rien n'est envoyé à Stripe sur le joueur** (ni e-mail, ni nom). Seuls la référence de commande (`client_reference_id`, `metadata.gem_order`) et `metadata.demo=true` sont transmis.
- **Moyens de paiement** : `allowed_payment_method_types: ['card']` filtre les moyens activés dans le Dashboard Stripe pour ne proposer que les cartes. La [référence API actuelle](https://docs.stripe.com/api/checkout/sessions/create) ne liste plus `payment_method_types` parmi les paramètres de création ; une vraie session de test a été créée avec `allowed_payment_method_types` le 2026-11-02 (API `2026-10-28.endive`). Apple Pay / Google Pay sont des portefeuilles de carte, affichés par Checkout s'ils sont activés dans le Dashboard (mode test) et si l'appareil le permet. Pas d'abonnement, de paiement fractionné ni de virement. Activer les cartes dans le même environnement de test que la clé API.
- **Doubles clics / reprises** : sous verrou du compte, une commande `creating`/`open` du même pack de moins de 20 min est rendue telle quelle. Même commande, même clé d'idempotence, mêmes paramètres, donc même session.
  - Si Stripe est injoignable, la commande reste `creating` et le clic suivant réessaie avec la même clé.
  - Si Stripe refuse (réponse 4xx/5xx mémorisée par son idempotence), la commande passe `canceled` et le clic suivant en crée une nouvelle.
  - Au plus 5 commandes en attente par joueur, et `throttle:10,1` sur la création.
- **Créations simultanées** (deux onglets, double clic pendant l'appel Stripe) : le verrou du compte est rendu **avant** l'appel réseau, donc une seconde requête pouvait reprendre la commande `creating` et appeler Stripe en même temps avec la même clé. Stripe répond alors 409 (« patientez et réessayez avec la même clé », [erreurs](https://docs.stripe.com/error-low-level)), autrefois affiché en 502. Désormais :
  - **bail de création** `gem_orders.checkout_lease_until` (30 s), pris sous le verrou du compte par la requête qui crée la commande ou la reprend. Seule elle appelle Stripe ; aucune transaction SQL n'est ouverte pendant l'appel ;
  - une requête qui trouve le bail actif reçoit **HTTP 202** `{code: "checkout_preparing", order, checkout_url: null, retry_after_ms: 1000}` (+ `Retry-After: 1`), sans appel à Stripe ni nouvelle commande. Le front (`startGemCheckout`, `front/src/api/gems.ts`) interroge `GET /api/gems/orders/{id}` (qui renvoie `checkout_url` tant que la commande est `open`) pendant ~12 s, refait au plus **un** POST, puis affiche un avertissement temporaire « page de paiement encore en préparation », jamais une panne ;
  - un 409 ou un 429 de Stripe (rien n'est mémorisé pour la clé) donne aussi `checkout_preparing`, rend le bail, garde la commande `creating` (`last_error = stripe_conflict`) ; la tentative suivante réutilise la même clé ;
  - **reprise** : si la requête qui tenait le bail meurt (processus tué, timeout), le bail expire seul et la requête suivante reprend la création avec la même clé d'idempotence, donc Stripe rend la même session. Jamais de nouvelle commande pour contourner un conflit. Une commande `creating` abandonnée est fermée par `gems:reconcile` après 30 min ;
  - le crédit unique (§ « Une seule fois ») n'est pas modifié.

  `GemCheckoutConcurrencyTest` provoque une vraie course : deux processus PHP (`tests/Scripts/start-gem-checkout.php`) bloqués sur le verrou du compte, relâchés ensemble, avec un Stripe factice lent (1,5 s) partagé via un fichier d'appels (`tests/Fakes/SlowStripeGateway.php`). Résultat attendu et vérifié : une commande, un seul appel de création, un clic `created`, l'autre `preparing`. Sans le contrôle du bail, le test échoue (deux appels).
- **Statuts** :
  - `creating` : ligne locale, pas encore de session.
  - `open` : en attente du paiement.
  - `processing` : paiement différé (non utilisé avec la carte seule, mais géré).
  - `paid` : paiement confirmé **et** gems livrés, dans la même transaction (`ck_gem_orders_paid_delivered`).
  - `failed`, `expired`, `canceled`.
  - Un paiement confirmé l'emporte sur tout autre statut. Un `paid` n'est jamais rétrogradé. Le retour « annuler » ne modifie rien.
- **Vérifications avant crédit** :
  - référence de commande et identifiant de session ;
  - `mode=payment` et `payment_status=paid` ;
  - PaymentIntent `succeeded` ;
  - `amount_total` et `amount_received` égaux au montant de la commande, en EUR ;
  - environnement test.

  En cas d'écart, rien n'est crédité et la cause est notée dans `gem_orders.last_error` (`amount_mismatch`, `payment_not_succeeded`…).
- **Une seule fois** :
  - verrou `FOR UPDATE` sur la commande, puis vérification de `delivered_at` ;
  - `delivery_tx_id UNIQUE` ;
  - index unique `ux_transactions_gem_order_delivery` sur `transactions(meta_json->>'gem_order') WHERE type='premium_purchase'`.

  Les événements répétés, plusieurs événements du même paiement, la page de retour et la réconciliation convergent tous vers un seul crédit.

  `GemDeliveryConcurrencyTest` le vérifie avec une vraie course : trois processus PHP, chacun avec sa connexion PostgreSQL, livrent le même paiement en même temps (`tests/Scripts/apply-checkout-session.php`). Le test garde le verrou de la commande jusqu'à ce que les trois l'attendent (`pg_locks`), puis le relâche. Un seul crédit. Sans le `FOR UPDATE`, le test échoue. Limite : il ne couvre que la course sur la livraison (`applyCheckoutSession`), pas celle de deux remboursements. Les deux tests de course (`Tests\Concerns\RacesProcesses`) reconstruisent la base **de test** (`migrate:fresh`, refusé si la base ne finit pas par `_test`), ce qui les rend plus lents (~4-6 s).
- **Webhook rejouable** : seuls l'id, le type, le nombre d'essais et la dernière erreur de chaque événement sont gardés (`stripe_webhook_events`), jamais le payload. L'événement n'est marqué traité qu'**après** l'enregistrement de ses effets. En cas d'erreur, le webhook répond 500 et Stripe réessaie pendant 3 jours. Les événements sans rapport sont acquittés sans effet.
- **Pas de queue** : le traitement est synchrone dans le webhook, avec deux filets :
  - la page de retour interroge Stripe (au plus toutes les 3 s) ;
  - `gems:reconcile` tourne toutes les 10 min dans le conteneur `scheduler`, déjà présent en production.
- **Wallet** : le solde reste `SUM(wallet_ledger.delta)`. Le crédit passe par `PremiumGemLedgerService`, distinct de `CoinRewardService` qui reste réservé aux pièces. Nouvelles valeurs de l'enum `tx_type` : `premium_purchase`, `premium_refund`.

## 3. Configuration

Variables backend (`backend/.env`, `docker-compose.yml`, `docker-compose.prod.yml`, `.env.prod.example`) :

| Variable | Valeur |
|---|---|
| `GEMS_CHECKOUT_MODE` | `off` (défaut) ou `test` |
| `STRIPE_SECRET_KEY` | `sk_test_…` (ou clé restreinte `rk_test_…`) — jamais de clé live |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` donné par `make stripe-secret` (local) ou par le point de terminaison de test du Dashboard (serveur) |
| `FRONTEND_URL` | origine des URLs de retour (`http://localhost:5173` en dev, `https://$DOMAIN` en prod) |

`off` est la valeur par défaut partout : `config/services.php`, `backend/.env.example`, `.env.prod.example`, `docker-compose.yml` et `docker-compose.prod.yml` (`${GEMS_CHECKOUT_MODE:-off}`). Les fichiers d'exemple ne contiennent que des valeurs vides ; les vrais secrets vont dans le `.env` racine ou `.env.prod`, ignorés par Git (`.gitignore` : `.env`, `.env.*` sauf les exemples). Les tests forcent des valeurs vides (`phpunit.xml`) et n'utilisent jamais les clés du développeur.

Les secrets restent côté backend. Le front ne connaît aucune clé : il redirige seulement vers l'URL Checkout renvoyée par l'API. Sans configuration, tout le projet démarre normalement et `/gems` affiche « La démo de la boutique de gems est désactivée ».

**Local** : voir le parcours court du README et le §4. Le `.env` racine est lu par Docker Compose, qui transmet les variables au backend (puis à `artisan serve`, voir `AppServiceProvider`). Après un changement : `make up` (ou `docker compose up -d backend`), qui recrée le conteneur ; `docker compose restart` ne relit pas le `.env`.

**Serveur partagé (`APP_ENV=production`)** : les cartes de test créditent de vrais gems du jeu. Si `GEMS_CHECKOUT_MODE=test` y est activé explicitement, **seuls les administrateurs** (`accounts.is_admin`, le même contrôle que le middleware `admin`, `make set-admin EMAIL=…`) peuvent créer une commande :
- `GET /api/gems/packs` renvoie `available` calculé pour le joueur connecté, et `unavailable_reason` : `null`, `disabled` (démo coupée) ou `admin_only` ; `/gems` explique alors aux joueurs pourquoi la démo leur est fermée ;
- `POST /api/gems/orders` refuse côté serveur avec **403 `gems_admin_only`**, avant tout appel à Stripe, quoi qu'affiche le navigateur ;
- webhooks, remboursements, litiges, page de retour et `gems:reconcile` ne sont **pas** restreints : les commandes déjà passées restent traitées (testé).

En local (`APP_ENV=local`) et dans les tests (`testing`), la démo reste ouverte à tous les joueurs.

**Production (Caddy)** : renseigner les mêmes variables dans `.env.prod` (clés **de test**). Dans le Dashboard Stripe **en mode test**, créer un point de terminaison `https://$DOMAIN/api/stripe/webhook` avec les événements de `backend/resources/stripe-webhook-events.txt` et copier son secret. `make prod-up`.

**Routes front** : `/gems` et `/gems/return` sont privées et sont déclarées dans `deploy/Caddyfile` (`@app`, `@noindex`) et `front/vercel.json` (réécriture vers `/app`, `X-Robots-Tag: noindex`). Le chargement direct et l'actualisation fonctionnent. Elles sont aussi bloquées dans `robots.txt` (`ROBOTS_BLOCKED_PATHS`) et absentes du prérendu SEO.

**En-têtes de sécurité** : aucun changement nécessaire. La redirection vers Checkout est une navigation de premier niveau (`window.location.assign`), donc ni `form-action 'self'`, ni `frame-ancestors`, ni COOP ne s'y opposent. `Permissions-Policy: payment=()` ne concerne que nos pages, la Payment Request API étant utilisée sur le domaine de Stripe. Aucun script Stripe n'est chargé chez nous.

## 4. Webhooks en local : Stripe CLI dans Docker

Service optionnel `stripe-cli` de `docker-compose.yml`, **profil `stripe`** : `make up` / `docker compose up -d` ne le démarrent jamais, et le projet tourne sans clé Stripe. Aucune installation de la Stripe CLI ni `stripe login` sur la machine.

- **Image** : `stripe/stripe-cli:v1.55.6`, l'image officielle, épinglée (jamais `latest`). Tag vérifié sur Docker Hub le 2026-11-02 ; même version que la CLI npm de la machine de développement. Dans cette version, `stripe listen --help` liste `--events`, `--forward-to`, `--print-secret`, `--skip-update`, `--all-snapshot`, et l'option globale `--api-key` « Overridden by the STRIPE_API_KEY environment variable ». D'autres versions n'ont pas forcément les mêmes options (`--all-snapshot` notamment) : on utilise `--events` explicitement. Pour monter de version, vérifier `docker run --rm stripe/stripe-cli:<tag> listen --help` avant de changer le tag.
- **Authentification** : `STRIPE_API_KEY` reçoit `STRIPE_SECRET_KEY` du `.env` racine. `docker/stripe-cli/listen.sh` (point d'entrée) refuse de démarrer avec une clé live, vide ou qui n'est pas `sk_test_` / `rk_test_` (code 64, testé).
- **Destination** : `http://backend:8000/api/stripe/webhook`, le service `backend` sur le réseau Compose. Dans le conteneur, `localhost` désigne le conteneur lui-même, pas le backend.
- **Événements** : liste explicite `--events`, lue dans `backend/resources/stripe-webhook-events.txt`, la **seule** liste du projet. Elle sert aussi au point de terminaison du Dashboard, et `StripeWebhookApiTest` vérifie qu'elle est identique aux événements traités par `StripeWebhookService` :
  - **paiement et expiration** : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` ;
  - **remboursements** : `charge.refunded`, `charge.refund.updated`, `refund.created`, `refund.updated`, `refund.failed` ;
  - **litiges** : `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`.

| Make | Équivalent Docker Compose (PowerShell, Git Bash…) | Effet |
|---|---|---|
| `make stripe-secret` | `docker compose --profile stripe run --rm --no-deps stripe-cli --print-secret` | affiche le `whsec_…` et sort |
| `make stripe-listen` | `docker compose --profile stripe up -d stripe-cli` | démarre le relais en arrière-plan (rend la main ; démarre aussi le backend s'il ne tourne pas) |
| `make stripe-logs` | `docker compose --profile stripe logs -f stripe-cli` | suit les logs (Ctrl+C quitte les logs, pas le relais) |
| `make stripe-stop` | `docker compose --profile stripe stop stripe-cli` | arrête le relais seul |
| `make down` | `docker compose --profile stripe down` | arrête toute la pile, relais compris (un `docker compose down` sans le profil laisse tourner `stripe-cli`) |

Commandes vérifiées le 2026-11-02 sous Git Bash et PowerShell 5.1, avec Docker Compose v2.40 (`make` n'est pas installé par défaut sous Windows : utiliser la colonne de droite).

**Configuration initiale** (une fois par machine, ou après un changement de clé) :
1. `STRIPE_SECRET_KEY=sk_test_…` et `GEMS_CHECKOUT_MODE=test` dans le `.env` racine.
2. `make stripe-secret`, puis coller le `whsec_…` dans `STRIPE_WEBHOOK_SECRET`. Étape manuelle volontaire : rien ne modifie le `.env` automatiquement. Ne pas supposer que ce secret est celui d'une ancienne CLI installée sur la machine : toujours reprendre celui que donne cette commande. Vérifier aussi qu'il n'est **pas** le secret exposé (§10).
3. `make up` : recrée le backend avec les nouvelles variables.
4. `make stripe-listen`, puis `make stripe-logs` : `Ready! … Your webhook signing secret is whsec_…` (ne pas copier ces logs dans un ticket, ils contiennent le secret).

**Lancements suivants** : `make up`, puis `make stripe-listen`. Le secret ne change pas d'un lancement à l'autre (« The webhook signing secret provided will not change between restarts », [stripe listen](https://docs.stripe.com/cli/listen)).

Chaque événement relayé apparaît dans `make stripe-logs` (`--> checkout.session.completed [evt_…]` puis `<-- [200] POST http://backend:8000/api/stripe/webhook`).

## 5. Scénarios de test (cartes officielles Stripe)

Date d'expiration future quelconque, CVC quelconque. Référence : [docs.stripe.com/testing](https://docs.stripe.com/testing).

| Scénario | Carte / action | Attendu |
|---|---|---|
| Paiement réussi | `4242 4242 4242 4242` | page de retour « N gems ajoutés ! », solde premium +N, pièces inchangées, e-mail (dans `storage/logs` avec `MAIL_MAILER=log`) |
| 3D Secure | `4000 0025 0000 3155` | authentification simulée, puis comme ci-dessus |
| Paiement refusé | `4000 0000 0000 0002` (ou `…9995` fonds insuffisants) | Stripe refuse sur sa page, commande `open`, rien crédité |
| Annulation | bouton retour de la page Stripe | « Paiement annulé », commande `open` jusqu'à expiration (60 min) |
| Fermer l'onglet après paiement | payer puis fermer | crédit par le webhook seul ; historique sur `/gems` |
| Webhook en retard | `make stripe-stop`, payer | la page de retour interroge Stripe et crédite ; sinon `make gems-reconcile` |
| Rejeu | `docker compose --profile stripe run --rm --no-deps --entrypoint stripe stripe-cli events resend evt_…` | `outcome: duplicate`, aucun second crédit |
| Expiration (sans payer) | `docker compose --profile stripe run --rm --no-deps --entrypoint stripe stripe-cli checkout sessions expire cs_test_…` | relais `<-- [200]`, commande `expired` |
| Deux onglets / double clic | cliquer « Payer » dans deux onglets en même temps | une seule commande, une seule session, le second onglet attend puis ouvre la même page |
| Serveur partagé | `APP_ENV=production`, compte non admin | `/gems` explique que la démo est réservée aux administrateurs, `POST` 403 `gems_admin_only` |
| Signature invalide | `curl -X POST localhost:8000/api/stripe/webhook -d '{}'` | 400 `invalid_signature` |
| Clé de production | `STRIPE_SECRET_KEY=sk_live_x` | boutique désactivée, webhook 503 `live_key_refused` |
| Litige | `4000 0000 0000 0259` | litige `needs_response` enregistré, aucun retrait ; perdu → retrait (§6) |
| Remboursement qui échoue | `4000 0000 0000 5126` puis remboursement | retrait à la réussite, puis écriture compensatrice `gem_refund_reversal` à l'échec |

Les tests automatisés couvrent les mêmes cas sans clé ni réseau (`tests/Fakes/FakeStripeGateway.php`, signatures HMAC réelles) : `tests/Feature/GemShopApiTest.php`, `tests/Feature/StripeWebhookApiTest.php`, `tests/Feature/GemDeliveryConcurrencyTest.php`, `tests/Feature/GemCheckoutConcurrencyTest.php`, `front/src/utils/gemCheckout.test.ts`, `front/src/api/gems.test.ts` (réponse arrivée après une déconnexion ou un changement de compte : ignorée ; attente bornée d'une page « en préparation »).

Les commandes `--entrypoint stripe` ci-dessus contournent `listen.sh` et donc son refus des clés live : ne les lancer qu'avec la clé `sk_test_` du `.env` racine.

## 6. Remboursements simulés (Dashboard Stripe, mode test)

Décidés par l'exploitant, sans interface dans CampusCove : Dashboard (mode test) → Paiements → le paiement (métadonnée `gem_order`) → **Rembourser** (total ou partiel).

- Seuls les remboursements `succeeded` comptent. Un remboursement en attente ne retire rien. Un remboursement compté qui échoue ensuite (`refund.failed`) rend les gems avec une écriture `gem_refund_reversal`.
- Le retrait est recalculé depuis le **cumul** remboursé, relu via l'API Stripe : `floor(gems × remboursé / montant)`, et le pack entier si tout est remboursé. Seule la **différence** avec `gem_orders.gems_reversed` est écrite (`gem_refund`). C'est insensible aux répétitions et à l'ordre des événements, et un instantané plus ancien n'écrase jamais un plus récent (`stripe_state_version`).
- Rien n'est supprimé : les écritures d'achat restent, les corrections sont de nouvelles lignes.
- La page de retour (`returnPhase`, `front/src/utils/gemCheckout.ts`) distingue trois cas sur une commande `paid` : achat confirmé, remboursement partiel (montant remboursé, gems retirés et gems conservés) et remboursement complet (« les gems du pack ont été retirés », jamais « ajoutés »). Un litige perdu qui retire des gems s'affiche de la même façon, selon `refund.gems_reversed`.
- Si les gems ont été dépensés, le solde premium devient négatif. `ShopPurchaseService` refuse alors toute dépense premium (`premium_debt`, message affiché avec un lien « Obtenir des gems »). Acheter un nouveau pack reste possible. Les skins achetés sont conservés.

**Litiges** : l'état est conservé sur la commande (`dispute_id`, `dispute_status`, `dispute_reason`, `disputed_at`), avec un log `warning` à chaque changement, pour un traitement manuel. Seul un litige **perdu** retire des gems, et `remboursé + perdu` est plafonné au montant payé : un litige et un remboursement ne retirent jamais deux fois la même perte. Pas de moteur de litiges.

## 7. Reprise d'une commande payée non créditée

```bash
make gems-reconcile ORDER=<public_id>    # relit paiement, remboursements et litiges, affiche l'état
make gems-reconcile                       # toutes les commandes en attente (aussi lancé toutes les 10 min)
```

La commande crédite si Stripe confirme le paiement, et n'en fait jamais plus qu'une fois. Elle ferme aussi en `canceled` les commandes `creating` de plus de 30 min sans session. Si `last_error` indique un écart (`amount_mismatch`…), rien n'est crédité automatiquement : il faut vérifier dans le Dashboard. Les événements en échec sont listés dans `stripe_webhook_events` (`processed_at IS NULL`, `attempts`, `last_error`).

## 8. E-mails

`GemOrderNotifier` (via `AccountMailer`, `MAIL_*`) envoie deux e-mails bilingues, une fois la livraison validée en base :
- la confirmation de crédit ;
- l'avis de retrait après un remboursement simulé.

Les deux disent « Paiement de démonstration — aucun argent débité » et précisent que ce n'est ni un reçu ni une facture. Un échec d'envoi est seulement journalisé et n'annule jamais le crédit. `confirmation_email_sent_at` empêche un double envoi. Stripe n'envoie aucun reçu, puisqu'aucun e-mail ne lui est transmis.

## 9. Données personnelles

`gem_orders` contient la référence, le pack, le montant simulé, les statuts et dates, les identifiants Stripe de test et la version des CGU acceptée. Il ne contient ni données bancaires, ni IP, ni payload Stripe. La table est incluse dans l'export RGPD (colonne `account_id`) et conservée à l'anonymisation du compte, car le grand livre doit rester cohérent. Les textes légaux mentionnent Stripe comme hébergeur de la page de paiement de démonstration, ainsi que ses cookies sur `checkout.stripe.com` (`SITE.legalVersion` et `AuthController::TERMS_VERSION` passés à `2026-11-01`).

## 10. Secret webhook exposé : remplacement obligatoire

**Constat** : le commit `cf3377c` a ajouté une valeur réelle de `STRIPE_WEBHOOK_SECRET` dans `backend/.env.example`. Le commit `bc10e31` l'a retirée du fichier, mais elle reste dans l'historique Git, y compris sur `origin/feat/stripe-gems` (branche poussée). Aucune clé API (`sk_`/`rk_`) n'a été commitée (recherche dans tout l'historique). Ne jamais recopier cette valeur dans un fichier, un ticket, un message de commit ou une sortie de commande.

Vérifié le 2026-11-02, par comparaison booléenne uniquement :
- c'est le secret de `stripe listen` du compte de test : `make stripe-secret` (CLI Docker) rend **la même** valeur ;
- le `.env` racine local l'utilise encore.

**Pourquoi le changer** : quiconque connaît ce secret peut signer de faux événements acceptés par un backend configuré avec lui. L'impact reste limité (mode test, et le backend relit toujours l'état réel auprès de l'API Stripe avec la clé secrète avant tout crédit : un faux événement ne crédite rien), mais une valeur publiée ne doit plus servir.

**Ce qui ne suffit pas** :
- redémarrer `stripe listen` ou passer à la CLI Docker : le secret ne change pas d'un lancement à l'autre ([stripe listen](https://docs.stripe.com/cli/listen)), et la CLI Docker donne la même valeur (vérifié) ;
- supprimer la valeur du fichier (déjà fait par `bc10e31`) ;
- **squasher la PR** : recommandé pour garder `main` propre (un seul commit, sans la valeur). Mais cela ne révoque rien, et la valeur reste dans `cf3377c` sur `origin/feat/stripe-gems`, dans les clones et forks existants, et dans les références de la PR conservées par GitHub (`refs/pull/<n>/head`), même après suppression de la branche. Seul le remplacement neutralise la fuite.

**Action manuelle restante sur le compte Stripe** (non faite : elle demande l'accès au Dashboard). La documentation Stripe ne prévoit aucune commande pour renouveler le secret de `stripe listen` ; la rotation documentée (« roll secret », expiration immédiate ou différée jusqu'à 24 h) concerne les points de terminaison du Dashboard ([webhooks](https://docs.stripe.com/webhooks)). Comme le secret de la CLI dépend du compte et de l'environnement de test, pas de la machine :
1. Dans le Dashboard, environnement de test : faire une **rotation de la clé secrète** `sk_test_` (Développeurs → Clés API → ⋯ → Rotation de la clé, [clés API](https://docs.stripe.com/keys)), mettre la nouvelle clé dans `STRIPE_SECRET_KEY` du `.env` racine, puis `make stripe-secret`.
2. Comparer avec la vérification ci-dessous. Stripe ne documente pas si la rotation de la clé API change le secret de `stripe listen` : **si la valeur est toujours identique**, utiliser un **nouvel environnement de test (bac à sable)** du même compte, qui a ses propres clés et donc son propre secret de CLI : y prendre la clé `sk_test_`, puis refaire `make stripe-secret` et la comparaison.
3. Quand la comparaison donne `false` : mettre le nouveau `whsec_…` dans `STRIPE_WEBHOOK_SECRET`, `make up`, `make stripe-listen`, puis vérifier un événement (`checkout sessions expire`, §5).
4. Si un point de terminaison du Dashboard (serveur Caddy) avait reçu cette valeur, faire « roll secret » dessus et mettre à jour `.env.prod`.

Vérification sans afficher aucune valeur (Git Bash, à la racine du dépôt) :

```bash
old=$(git show cf3377c:backend/.env.example | sed -n 's/^STRIPE_WEBHOOK_SECRET=//p' | tr -d '\r" ')
new=$(docker compose --profile stripe run --rm --no-deps stripe-cli --print-secret 2>/dev/null | grep -oE 'whsec_[A-Za-z0-9]+' | head -1)
env=$(sed -n 's/^STRIPE_WEBHOOK_SECRET=//p' .env | tail -1 | tr -d '\r" ')
echo "CLI identique au secret exposé : $([ -n "$new" ] && [ "$new" = "$old" ] && echo true || echo false)"
echo ".env identique au secret exposé : $([ -n "$env" ] && [ "$env" = "$old" ] && echo true || echo false)"
echo ".env identique à la CLI : $([ -n "$new" ] && [ "$new" = "$env" ] && echo true || echo false)"
unset old new env
```

Résultat attendu après remplacement : `false`, `false`, `true`.

## 11. Diagnostic

**`/gems` affiche « démo désactivée »** (`unavailable_reason: disabled`) :
- les trois variables sont-elles dans le `.env` **racine** (pas seulement `backend/.env`) ? `GEMS_CHECKOUT_MODE=test`, `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…` ;
- le backend a-t-il été recréé ? `make up` ou `docker compose up -d backend` (un `restart` ne relit pas le `.env`) ;
- ce que voit le backend, sans aucun secret :

  ```bash
  docker compose exec -T backend php artisan tinker --execute '$c = app(App\Support\GemCheckoutConfig::class); echo json_encode(["env" => app()->environment(), "mode" => $c->mode(), "test_key" => $c->hasTestKey(), "live_key" => $c->hasLiveKey(), "webhook_ok" => $c->canTalkToStripe(), "open" => $c->checkoutOpen(), "admin_only" => $c->adminOnly()]);'
  ```

  `live_key: true` : clé de production, refusée, la remplacer par une `sk_test_`.
- « réservée aux administrateurs » (`admin_only`) : `APP_ENV=production` avec la démo activée, voir §3.

**Le relais ne reçoit rien** :
- `docker compose --profile stripe ps -a stripe-cli` : `exited (64)` signifie clé vide, live ou invalide (le message est dans `make stripe-logs`) ;
- `make stripe-logs` doit montrer `Ready!`. Sinon : la clé est-elle valide et du bon environnement de test ? Le réseau sort-il vers `api.stripe.com` ?
- aucune ligne `-->` après un paiement : le paiement a-t-il été fait avec un compte ou un environnement de test différent de la clé du relais ? L'événement est-il dans `backend/resources/stripe-webhook-events.txt` ?
- `<-- [400]` (`invalid_signature`) : `STRIPE_WEBHOOK_SECRET` ne correspond pas au secret de ce relais. Reprendre `make stripe-secret`, mettre à jour le `.env`, `make up` ;
- `<-- [503]` : `stripe_not_configured` (secret webhook vide côté backend) ou `live_key_refused` ;
- erreur de connexion vers `backend:8000` : le backend ne tourne pas (`make up`) ;
- après `make down`, le relais est arrêté aussi : relancer `make up` puis `make stripe-listen`.

Une commande payée mais non créditée se rattrape toujours avec `make gems-reconcile ORDER=<public_id>` (§7).
