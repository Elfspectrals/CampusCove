import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parseNpcBehavior } from './npcBehavior.ts'
import { AFTER_PAY_MS, NPC_PAY_MS, NpcBrain, type NpcShop } from './npcBrain.ts'
import { CHECKOUT_STAND, CheckoutLine, QUEUE_GAP, SHELF_STAND, queueSpot, shopLayout } from './shopSpots.ts'

const GREENCART = new URL('../../front/public/assets/zones/greencart.json', import.meta.url)

function near(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} is not ${expected}`)
}

const decor = {
  props: [
    // a gondola along x at the origin: face 0 looks to +z, face 1 to -z; only slot 1 of face 0 and slot 0 of face 1 hold goods
    { kind: 'shelf', id: 'g', shelf: 'gondola', position: [0, 0.2, 0], yaw: 0, length: 2.08, levels: 2, slots: 2, fill: { '0.1.1': { code: 'food_cookie', key: 'cookie' }, '1.0.0': { code: 'grocery_cereal', key: 'cereal' } } },
    { kind: 'npc', id: 'clerk', position: [10, 0.2, 0], yaw: -Math.PI / 2 }
  ],
  areas: [{ role: 'seller', npc: 'clerk', bounds: { minX: -5, maxX: 15, minZ: -20, maxZ: 2 } }]
}

test('a shopper stands in front of each shelf slot that holds goods, on the right face', () => {
  const { spots } = shopLayout(decor)
  assert.equal(spots.length, 2)
  const [front, back] = spots
  near(front!.stand[0], 0.5, 'slot 1 of face 0 is on the +x half')
  near(front!.stand[2], 0.45 + SHELF_STAND, 'in front of face 0')
  assert.equal(front!.stand[1], 0.2)
  assert.deepEqual(front!.items, [{ code: 'food_cookie', key: 'cookie' }])
  near(back!.stand[0], 0.5, 'face 1 mirrors x, like slotBoxes')
  near(back!.stand[2], -(0.45 + SHELF_STAND), 'behind, in front of face 1')
})

test('the checkout is past the counter in front of the clerk, the line runs towards the middle of the shop', () => {
  const { checkout } = shopLayout(decor)
  near(checkout!.stand[0], 10 - 2 - CHECKOUT_STAND, 'past the counter, 2 m ahead of the clerk')
  near(checkout!.stand[2], 0, 'in line with the clerk')
  near(checkout!.queue[1], -1, 'the shop middle is at -z')
  near(queueSpot(checkout!, 2)[2], -2 * QUEUE_GAP, 'third in line')
})

test('the GreenCart zone gives shoppers shelves and a checkout', { skip: !existsSync(GREENCART) }, () => {
  const layout = shopLayout(JSON.parse(readFileSync(GREENCART, 'utf8')))
  assert.ok(layout.spots.length > 20)
  assert.ok(layout.checkout)
})

const shopperTree = parseNpcBehavior({
  version: 1,
  trees: {
    t: {
      name: 'Shopper',
      points: [],
      root: {
        id: 's',
        type: 'sequence',
        children: [
          { id: 'b', type: 'browse_shelf', radius: 30, seconds: 2, take: 100 },
          { id: 'c', type: 'checkout' }
        ]
      }
    }
  },
  npcs: []
}).trees.get('t')!

function shopper(id: string, shop: NpcShop, at: [number, number, number]): NpcBrain {
  return new NpcBrain(id, shopperTree, { position: at, yaw: 0 }, {}, { random: () => 0, shop })
}

/** Ticks every 100 ms until `until`. */
function run(brains: NpcBrain[], from: number, until: number): void {
  for (let now = from; now <= until; now += 100) for (const b of brains) b.tick({ now, hour: 12, players: [] })
}

test('a shopper browses, takes an item, queues and pays; the next one waits behind and pays after', () => {
  const shop = { layout: shopLayout(decor), line: new CheckoutLine(), nav: null }
  const a = shopper('a', shop, [0, 0.2, 0.95])
  const b = shopper('b', shop, [0, 0.2, 0.95])
  run([a], 0, 300)
  assert.equal(a.state(300).clip, 'browse')
  const paidAt = new Map<string, number>()
  const tookAt = new Map<string, number>()
  let behind = false
  for (let now = 400; now < 30000; now += 100) {
    for (const brain of [a, b]) {
      const before = brain.state(now).held
      brain.tick({ now, hour: 12, players: [] })
      const after = brain.state(now).held
      if (!before && after && !tookAt.has(brain.id)) tookAt.set(brain.id, now)
      if (before && !after && !paidAt.has(brain.id)) paidAt.set(brain.id, now)
    }
    if (shop.line.placeOf('b') === 1) behind = true
  }
  assert.ok(tookAt.get('a')! >= 2000, 'a looked at the shelf for 2 s before taking')
  assert.ok(behind, 'b waited one place behind a')
  assert.ok(paidAt.has('a') && paidAt.has('b'), 'both paid')
  assert.ok(paidAt.get('a')! + NPC_PAY_MS + AFTER_PAY_MS <= paidAt.get('b')! + 100, 'b paid after a was done')
})

test('checkout fails with empty hands, and an aborted shopper leaves the line', () => {
  const shop = { layout: shopLayout(decor), line: new CheckoutLine(), nav: null }
  const tree = parseNpcBehavior({ version: 1, trees: { t: { name: 'T', points: [], root: { id: 'c', type: 'checkout' } } }, npcs: [] }).trees.get('t')!
  const empty = new NpcBrain('e', tree, { position: [0, 0.2, 0], yaw: 0 }, {}, { shop })
  empty.tick({ now: 0, hour: 12, players: [] })
  assert.equal(shop.line.placeOf('e'), -1)
  assert.equal(empty.state(0).move, null)
})
