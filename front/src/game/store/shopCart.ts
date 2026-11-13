/**
 * The shopping cart: items from every shop the player walked through, each line paid at its own shop's cashier.
 * Pure data, no Vue: `useShopCart` keeps the lines, the server checks every line again when it is paid
 * (docs/SHOP_CART.md).
 */

/** Same caps as Laravel's ShopCheckoutRequest and the socket's zone checkout. */
export const MAX_CART_LINES_PER_SHOP = 50
export const MAX_LINE_QUANTITY = 20

export interface CartItem {
  shopCatalogItemId: number
  itemDefId: number
  name: string
  previewImage: string | null
  /** Coins for one, at this shop's price. */
  unitPrice: number
  /** Clothes are owned one at a time. */
  oneAtATime: boolean
}

export interface CartLine {
  shopKey: string
  shopName: string
  item: CartItem
  quantity: number
}

export interface CartShop {
  shopKey: string
  shopName: string
  lines: CartLine[]
  total: number
}

function sameLine(line: CartLine, shopKey: string, shopCatalogItemId: number): boolean {
  return line.shopKey === shopKey && line.item.shopCatalogItemId === shopCatalogItemId
}

function maxQuantity(item: CartItem): number {
  return item.oneAtATime ? 1 : MAX_LINE_QUANTITY
}

export function quantityInCart(lines: readonly CartLine[], shopKey: string, shopCatalogItemId: number): number {
  return lines.find((line) => sameLine(line, shopKey, shopCatalogItemId))?.quantity ?? 0
}

/** One more of `item` from this shop; the same lines back when the line is full or the shop has too many lines. */
export function addToCart(lines: readonly CartLine[], shopKey: string, shopName: string, item: CartItem): CartLine[] {
  const index = lines.findIndex((line) => sameLine(line, shopKey, item.shopCatalogItemId))
  if (index === -1) {
    if (lines.filter((line) => line.shopKey === shopKey).length >= MAX_CART_LINES_PER_SHOP) return [...lines]
    return [...lines, { shopKey, shopName, item, quantity: 1 }]
  }
  return setQuantity(lines, shopKey, item.shopCatalogItemId, lines[index]!.quantity + 1)
}

/** Quantity clamped to what the item allows; 0 or less removes the line. */
export function setQuantity(lines: readonly CartLine[], shopKey: string, shopCatalogItemId: number, quantity: number): CartLine[] {
  if (quantity <= 0) return removeLine(lines, shopKey, shopCatalogItemId)
  return lines.map((line) =>
    sameLine(line, shopKey, shopCatalogItemId) ? { ...line, quantity: Math.min(Math.floor(quantity), maxQuantity(line.item)) } : line,
  )
}

export function removeLine(lines: readonly CartLine[], shopKey: string, shopCatalogItemId: number): CartLine[] {
  return lines.filter((line) => !sameLine(line, shopKey, shopCatalogItemId))
}

export function removeShop(lines: readonly CartLine[], shopKey: string): CartLine[] {
  return lines.filter((line) => line.shopKey !== shopKey)
}

export function lineTotal(line: CartLine): number {
  return line.item.unitPrice * line.quantity
}

/** The cart grouped by shop, in the order the shops were first added to. */
export function cartByShop(lines: readonly CartLine[]): CartShop[] {
  const shops = new Map<string, CartShop>()
  for (const line of lines) {
    let shop = shops.get(line.shopKey)
    if (!shop) {
      shop = { shopKey: line.shopKey, shopName: line.shopName, lines: [], total: 0 }
      shops.set(line.shopKey, shop)
    }
    shop.lines.push(line)
    shop.total += lineTotal(line)
  }
  return [...shops.values()]
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}

export function cartTotal(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0)
}

/** What a shop's cashier is asked to charge. */
export function checkoutLines(lines: readonly CartLine[], shopKey: string): Array<{ id: number; quantity: number }> {
  return lines.filter((line) => line.shopKey === shopKey).map((line) => ({ id: line.item.shopCatalogItemId, quantity: line.quantity }))
}
