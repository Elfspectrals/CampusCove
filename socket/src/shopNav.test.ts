import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import type { Vec3Tuple } from './npcBehavior.ts'
import { NAV_CLEARANCE, shopNav } from './shopNav.ts'
import { shopLayout } from './shopSpots.ts'

const GREENCART = new URL('../../front/public/assets/zones/greencart.json', import.meta.url)

/** True when the segment passes through the shelf's footprint (no clearance). */
function crosses(a: Vec3Tuple, b: Vec3Tuple, shelf: { position: number[]; yaw: number; length: number; depth: number }): boolean {
  for (let t = 0; t <= 1; t += 0.01) {
    const x = a[0] + (b[0] - a[0]) * t - shelf.position[0]!
    const z = a[2] + (b[2] - a[2]) * t - shelf.position[2]!
    const lx = x * Math.cos(shelf.yaw) - z * Math.sin(shelf.yaw)
    const lz = x * Math.sin(shelf.yaw) + z * Math.cos(shelf.yaw)
    if (Math.abs(lx) < shelf.length / 2 && Math.abs(lz) < shelf.depth / 2) return true
  }
  return false
}

function legs(from: Vec3Tuple, route: Vec3Tuple[]): Array<[Vec3Tuple, Vec3Tuple]> {
  const points = [from, ...route]
  return points.slice(1).map((p, i) => [points[i]!, p])
}

const room = {
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
  props: [{ kind: 'shelf', shelf: 'gondola', position: [0, 0, 0], yaw: 0, length: 6 }]
}

test('an open line is walked straight, a shelf in the way is walked around', () => {
  const nav = shopNav(room)!
  assert.deepEqual(nav.route([-5, 0, 3], [5, 0, 3]), [[5, 0, 3]])
  const from: Vec3Tuple = [0, 0, 2]
  const route = nav.route(from, [0, 0, -2])
  assert.ok(route.length >= 3, 'goes round an end of the gondola')
  assert.deepEqual(route[route.length - 1], [0, 0, -2])
  const shelf = { position: [0, 0, 0], yaw: 0, length: 6, depth: 0.9 }
  for (const [a, b] of legs(from, route)) assert.equal(crosses(a, b, shelf), false)
  assert.ok(route.slice(0, -1).every(([x]) => Math.abs(x) >= 3 + NAV_CLEARANCE - 0.4), 'the corners are past the shelf end')
})

test('in GreenCart, walks between shelf spots and to the checkout never cut through a shelf', { skip: !existsSync(GREENCART) }, () => {
  const decor = JSON.parse(readFileSync(GREENCART, 'utf8'))
  const nav = shopNav(decor)!
  const { spots, checkout } = shopLayout(decor)
  const depth: Record<string, number> = { gondola: 0.9, wall: 0.45, fridge: 0.75, chiller: 0.9 }
  const shelves = decor.props.filter((p: { kind: string }) => p.kind === 'shelf').map((p: { position: number[]; yaw?: number; length: number; shelf: string }) => ({ position: p.position, yaw: p.yaw ?? 0, length: p.length, depth: depth[p.shelf]! }))
  const targets = [...spots.filter((_, i) => i % 7 === 0).map((s) => s.stand), checkout!.stand]
  let routes = 0
  for (const from of targets) {
    for (const to of targets) {
      if (from === to) continue
      for (const [a, b] of legs(from, nav.route(from, to))) {
        for (const shelf of shelves) assert.equal(crosses(a, b, shelf), false, `${from.join()} -> ${to.join()} cuts a shelf at ${shelf.position.join()}`)
      }
      routes++
    }
  }
  assert.ok(routes > 100)
})
