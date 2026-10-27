// Places the free drinking fountains (survival: thirst) in the town. Idempotent.
//
//   npm run assets:optimize -- park      (builds public/assets/park/drinking_fountain/, map-src/CampusCove/build_food_items.py)
//   node scripts/apply-fountains.mjs
//
// 1. world.manifest.json : top-level `fountains` ([x, 0, z]; the game puts them on the terrain). The realtime server
//                          reads the same list to check a player stands at one before letting them drink.
// 2. town.collision.json : one COL_Fountain_<n> box per fountain.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')

// One near the spawn, one on the business-district plaza, one by the pond kiosk, one at the retail park.
const FOUNTAINS = [
  [3, 16],
  [8, 52],
  [12, -50],
  [30, 55],
]
const HALF_SIZE = 0.25
const HEIGHT = 1.0

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
col.cuboids = col.cuboids.filter((c) => !c.name.startsWith('COL_Fountain_'))
FOUNTAINS.forEach(([x, z], i) => {
  col.cuboids.push({ name: `COL_Fountain_${i}`, cx: x, cy: HEIGHT / 2, cz: z, hx: HALF_SIZE, hy: HEIGHT / 2, hz: HALF_SIZE, qx: 0, qy: 0, qz: 0, qw: 1 })
})
writeFileSync(TOWN_COL, JSON.stringify(col))

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
manifest.fountains = FOUNTAINS.map(([x, z]) => [x, 0, z])
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`${FOUNTAINS.length} drinking fountains written to world.manifest.json and town.collision.json`)
