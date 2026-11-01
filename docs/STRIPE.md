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

## 2. Fonctionnement

```
/gems  ──POST /api/gems/orders {pack, locale}──▶  GemCheckoutService
                                                   1. ligne gem_orders (status creating) — transaction courte, verrou du compte
                                                   2. hors transaction : Checkout Session (clé d'idempotence gem-order-<uuid>)
        ◀── checkout_url ──                        3. status open
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
- **Moyens de paiement** : `payment_method_types: ['card']`. Apple Pay / Google Pay sont des portefeuilles de carte, affichés par Checkout s'ils sont activés dans le Dashboard (mode test) et si l'appareil le permet. Google Pay est désactivé par défaut côté Stripe. Pas d'abonnement, de paiement fractionné ni de virement.
- **Doubles clics / reprises** : sous verrou du compte, une commande `creating`/`open` du même pack de moins de 20 min est rendue telle quelle. Même commande, même clé d'idempotence, mêmes paramètres, donc même session.
  - Si Stripe est injoignable, la commande reste `creating` et le clic suivant réessaie avec la même clé.
  - Si Stripe refuse (réponse 4xx/5xx mémorisée par son idempotence), la commande passe `canceled` et le clic suivant en crée une nouvelle.
  - Au plus 5 commandes en attente par joueur, et `throttle:10,1` sur la création.
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
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` du point de terminaison de test (ou de `stripe listen`) |
| `FRONTEND_URL` | origine des URLs de retour (`http://localhost:5173` en dev, `https://$DOMAIN` en prod) |

Les secrets restent côté backend. Le front ne connaît aucune clé : il redirige seulement vers l'URL Checkout renvoyée par l'API. Sans configuration, tout le projet démarre normalement et `/gems` affiche « La démo de la boutique de gems est désactivée ».

**Local** : créer un `.env` à la racine du dépôt (lu par Docker Compose, ignoré par git) :

```bash
GEMS_CHECKOUT_MODE=test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # affiché par `make stripe-listen`
```

puis `docker compose up -d backend` (les variables sont transmises à `artisan serve`, voir `AppServiceProvider`).

**Production (Caddy)** : renseigner les mêmes variables dans `.env.prod` (clés **de test**). Dans le Dashboard Stripe **en mode test**, créer un point de terminaison `https://$DOMAIN/api/stripe/webhook` avec les événements du §4 et copier son secret. `make prod-up`.

**Routes front** : `/gems` et `/gems/return` sont privées et sont déclarées dans `deploy/Caddyfile` (`@app`, `@noindex`) et `front/vercel.json` (réécriture vers `/app`, `X-Robots-Tag: noindex`). Le chargement direct et l'actualisation fonctionnent. Elles sont aussi bloquées dans `robots.txt` (`ROBOTS_BLOCKED_PATHS`) et absentes du prérendu SEO.

**En-têtes de sécurité** : aucun changement nécessaire. La redirection vers Checkout est une navigation de premier niveau (`window.location.assign`), donc ni `form-action 'self'`, ni `frame-ancestors`, ni COOP ne s'y opposent. `Permissions-Policy: payment=()` ne concerne que nos pages, la Payment Request API étant utilisée sur le domaine de Stripe. Aucun script Stripe n'est chargé chez nous.

## 4. Webhooks en local

Installer la [Stripe CLI](https://docs.stripe.com/stripe-cli), puis :

```bash
stripe login
make stripe-listen
# = stripe listen --forward-to localhost:8000/api/stripe/webhook --events <liste ci-dessous>
```

Copier le `whsec_…` affiché dans `STRIPE_WEBHOOK_SECRET`, puis redémarrer le backend.

Événements à activer :
- **Paiement** : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
- **Remboursements** : `charge.refunded`, `charge.refund.updated`, `refund.created`, `refund.updated`, `refund.failed`.
- **Litiges** : `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`.

## 5. Scénarios de test (cartes officielles Stripe)

Date d'expiration future quelconque, CVC quelconque. Référence : [docs.stripe.com/testing](https://docs.stripe.com/testing).

| Scénario | Carte / action | Attendu |
|---|---|---|
| Paiement réussi | `4242 4242 4242 4242` | page de retour « N gems ajoutés ! », solde premium +N, pièces inchangées, e-mail (dans `storage/logs` avec `MAIL_MAILER=log`) |
| 3D Secure | `4000 0025 0000 3155` | authentification simulée, puis comme ci-dessus |
| Paiement refusé | `4000 0000 0000 0002` (ou `…9995` fonds insuffisants) | Stripe refuse sur sa page, commande `open`, rien crédité |
| Annulation | bouton retour de la page Stripe | « Paiement annulé », commande `open` jusqu'à expiration (60 min) |
| Fermer l'onglet après paiement | payer puis fermer | crédit par le webhook seul ; historique sur `/gems` |
| Webhook en retard | couper `stripe listen`, payer | la page de retour interroge Stripe et crédite ; sinon `make gems-reconcile` |
| Rejeu | `stripe events resend evt_…` | `outcome: duplicate`, aucun second crédit |
| Signature invalide | `curl -X POST localhost:8000/api/stripe/webhook -d '{}'` | 400 `invalid_signature` |
| Clé de production | `STRIPE_SECRET_KEY=sk_live_x` | boutique désactivée, webhook 503 `live_key_refused` |
| Litige | `4000 0000 0000 0259` | litige `needs_response` enregistré, aucun retrait ; perdu → retrait (§6) |
| Remboursement qui échoue | `4000 0000 0000 5126` puis remboursement | retrait à la réussite, puis écriture compensatrice `gem_refund_reversal` à l'échec |

Les tests automatisés couvrent les mêmes cas sans clé ni réseau (`tests/Fakes/FakeStripeGateway.php`, signatures HMAC réelles) : `tests/Feature/GemShopApiTest.php`, `tests/Feature/StripeWebhookApiTest.php`, `front/src/utils/gemCheckout.test.ts`.

## 6. Remboursements simulés (Dashboard Stripe, mode test)

Décidés par l'exploitant, sans interface dans CampusCove : Dashboard (mode test) → Paiements → le paiement (métadonnée `gem_order`) → **Rembourser** (total ou partiel).

- Seuls les remboursements `succeeded` comptent. Un remboursement en attente ne retire rien. Un remboursement compté qui échoue ensuite (`refund.failed`) rend les gems avec une écriture `gem_refund_reversal`.
- Le retrait est recalculé depuis le **cumul** remboursé, relu via l'API Stripe : `floor(gems × remboursé / montant)`, et le pack entier si tout est remboursé. Seule la **différence** avec `gem_orders.gems_reversed` est écrite (`gem_refund`). C'est insensible aux répétitions et à l'ordre des événements, et un instantané plus ancien n'écrase jamais un plus récent (`stripe_state_version`).
- Rien n'est supprimé : les écritures d'achat restent, les corrections sont de nouvelles lignes.
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
