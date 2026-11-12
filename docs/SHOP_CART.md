# Panier multi-boutiques

Un seul panier pour toutes les boutiques qui ont une caisse (boutiques du centre commercial, zones de vente des
fichiers de zone, Cove Threads, Northline...). Le joueur clique sur un article pour en ajouter un au panier, de
n'importe quelle boutique, puis ouvre le panier (touche **L**, modifiable, ou **Utiliser** devant une caisse). Le panier
range les lignes par boutique ; **chaque boutique se paie à sa propre caisse**, en liquide (`docs/BANK.md`). Cove Home
(sans caisse) garde l'achat immédiat au clic.

Le panier ne vit que dans la page (pas de stockage) : il survit à la sortie d'une boutique, pas à un rechargement.

## Front

- `front/src/game/store/shopCart.ts` (+ `shopCart.test.ts`) : lignes `{ shopKey, shopName, item, quantity }`, ajout,
  quantité bornée (1 pour les vêtements, `MAX_LINE_QUANTITY` sinon), regroupement par boutique, totaux.
- `composables/game/useShopCart.ts` : une instance créée par `GameView.vue` et passée à chaque `useFurnitureStore`
  (`deps.cart`). À la caisse, `tryOpenCheckout()` ouvre le panier avec la boutique payable ; s'éloigner de la caisse
  rend le panier non payable sans le fermer.
- `components/game/GameShopCart.vue` : l'écran (image, nom, prix, quantité − / +, retrait, total par boutique et
  global, bouton « Payer ici » seulement pour la boutique de la caisse).

## Clé de paiement (idempotence)

Le client tire une `checkout_key` (UUID v4) au premier paiement des lignes d'une boutique et la renvoie à chaque
nouvel essai tant que ces lignes ne changent pas. Laravel enregistre le paiement dans `shop_checkouts`
(`account_id`, `checkout_key`, ids des achats, solde après) : la même clé renvoie le premier résultat sans débiter une
seconde fois. Toute modification des lignes de la boutique jette la clé.

## Contrats

Plafonds partagés : `ShopCheckoutRequest::MAX_LINES` = 50 lignes, `ShopPurchaseService::MAX_LINE_QUANTITY` = 20 par
ligne (mêmes valeurs dans `socket/src/zoneShop.ts` et `front/src/game/store/shopCart.ts`).

### `POST /api/shop/checkout` (navigateur, boutiques au prix du catalogue)

| Champ | Type | Règle |
|---|---|---|
| `checkout_key` | string | UUID, requis |
| `items` | array | 1 à 50 lignes |
| `items.*.shop_catalog_item_id` | int | ≥ 1, distinct |
| `items.*.quantity` | int | 1 à 20 ; 1 pour un article unique ou un vêtement (`invalid_quantity`) |

Réponse : `{ purchases: [...], balance_after }`. Tout ou rien : un prix, un stock, un article déjà possédé ou un
manque de liquide refuse tout le panier de cette boutique.

### Socket `zone_checkout` (zones de vente)

Client → socket : `{ zone: string, checkoutKey: uuid, items: [{ id: int, quantity: int }], request: int }`. Le socket
vérifie les types, les plafonds, l'absence de doublon et que le joueur est dans les bornes de la zone, puis appelle
`POST /api/zone/checkout` (route `realtime`) avec `{ zone, checkout_key, items: [{ shop_catalog_item_id, quantity }] }`.
Laravel prend les prix de la zone (`ZonePriceBook`). Réponses : `zone_checkout_done` / `zone_checkout_error`
(`request` renvoyé).
