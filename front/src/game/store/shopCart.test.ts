import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addToCart,
  cartByShop,
  cartCount,
  cartTotal,
  checkoutLines,
  MAX_CART_LINES_PER_SHOP,
  MAX_LINE_QUANTITY,
  quantityInCart,
  removeLine,
  removeShop,
  setQuantity,
  type CartItem,
  type CartLine,
} from './shopCart.ts'

function item(id: number, unitPrice = 10, oneAtATime = false): CartItem {
  return { shopCatalogItemId: id, itemDefId: id + 100, name: `Item ${id}`, previewImage: null, unitPrice, oneAtATime }
}

test('adding the same item twice in one shop makes one line of two', () => {
  let lines: CartLine[] = []
  lines = addToCart(lines, 'greencart', 'GreenCart', item(1))
  lines = addToCart(lines, 'greencart', 'GreenCart', item(1))
  assert.equal(lines.length, 1)
  assert.equal(quantityInCart(lines, 'greencart', 1), 2)
})

test('the same item from two shops stays two lines, each paid at its own shop', () => {
  let lines: CartLine[] = []
  lines = addToCart(lines, 'greencart', 'GreenCart', item(1, 4))
  lines = addToCart(lines, 'farm_stall', 'Farm stall', item(1, 3))
  lines = addToCart(lines, 'greencart', 'GreenCart', item(2, 7))
  assert.deepEqual(
    cartByShop(lines).map((shop) => [shop.shopKey, shop.lines.length, shop.total]),
    [
      ['greencart', 2, 11],
      ['farm_stall', 1, 3],
    ],
  )
  assert.deepEqual(checkoutLines(lines, 'greencart'), [
    { id: 1, quantity: 1 },
    { id: 2, quantity: 1 },
  ])
  assert.equal(cartTotal(lines), 14)
  assert.equal(cartCount(lines), 3)
})

test('clothes stay at one, other items stop at the line cap', () => {
  let lines = addToCart([], 'threads', 'Cove Threads', item(5, 50, true))
  lines = addToCart(lines, 'threads', 'Cove Threads', item(5, 50, true))
  assert.equal(quantityInCart(lines, 'threads', 5), 1)
  lines = setQuantity(addToCart(lines, 'greencart', 'GreenCart', item(1)), 'greencart', 1, 999)
  assert.equal(quantityInCart(lines, 'greencart', 1), MAX_LINE_QUANTITY)
})

test('a quantity of zero removes the line, remove and removeShop drop lines', () => {
  let lines = addToCart(addToCart([], 'a', 'A', item(1)), 'b', 'B', item(2))
  assert.equal(setQuantity(lines, 'a', 1, 0).length, 1)
  assert.deepEqual(removeLine(lines, 'b', 2).map((l) => l.shopKey), ['a'])
  lines = addToCart(lines, 'a', 'A', item(3))
  assert.deepEqual(removeShop(lines, 'a').map((l) => l.shopKey), ['b'])
})

test('a shop holds at most the line cap the server accepts', () => {
  let lines: CartLine[] = []
  for (let id = 1; id <= MAX_CART_LINES_PER_SHOP + 1; id++) lines = addToCart(lines, 'a', 'A', item(id))
  assert.equal(lines.length, MAX_CART_LINES_PER_SHOP)
  assert.equal(addToCart(lines, 'b', 'B', item(1)).length, MAX_CART_LINES_PER_SHOP + 1)
})
