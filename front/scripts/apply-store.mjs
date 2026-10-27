// Wires the Cove Home furniture store (map-src/CampusCove/build_store_ext.py) into the existing town. Idempotent.
//
//   npm run assets:optimize -- store     (builds public/assets/store/{cove_home,park}/)
//   node scripts/apply-store.mjs
//
// 1. town.collision.json : replaces every COL_Store_* box by the ones in park.layout.json, extends the walkable
//                          bounds east and north to the retail park
// 2. world.manifest.json : writes the `retail_park` zone (park scenery + the walk-in `store` building) and the
//                          world bounds
// town.glb is untouched: the park scenery (park.glb) and the store exterior are loaded next to it by the game.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const PARK_LAYOUT = join(ASSETS, 'store/park/park.layout.json')

if (!existsSync(PARK_LAYOUT)) {
  console.error(`Missing ${PARK_LAYOUT} - run "npm run assets:optimize -- store" first.`)
  process.exit(1)
}
const park = JSON.parse(readFileSync(PARK_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000

// ---------------------------------------------------------------- 1. collision
const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !c.name.startsWith('COL_Store_'))
for (const c of park.collision) {
  col.cuboids.push({
    name: c.name,
    cx: round4(c.cx),
    cy: round4(c.cy),
    cz: round4(c.cz),
    hx: round4(c.hx),
    hy: round4(c.hy),
    hz: round4(c.hz),
    qx: 0,
    qy: round4(Math.sin(c.yaw / 2)),
    qz: 0,
    qw: round4(Math.cos(c.yaw / 2)),
  })
}
if (col.bounds) {
  col.bounds.maxX = Math.max(col.bounds.maxX, park.bounds.maxX)
  col.bounds.maxZ = Math.max(col.bounds.maxZ, park.bounds.maxZ)
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids, bounds ${JSON.stringify(col.bounds)}`)

// ---------------------------------------------------------------- 2. manifest
const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = {
  key: 'retail_park',
  optional: true,
  bounds: { minX: 29.3, maxX: park.bounds.maxX, minZ: 47, maxZ: park.bounds.maxZ },
  modelUrl: '/assets/store/park/park.glb',
  buildings: [{ kind: 'store', ...park.store }],
}
const at = manifest.zones.findIndex((z) => z.key === zone.key)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: store "${park.store.name}" door at ${JSON.stringify(park.store.door)}, bounds ${JSON.stringify(manifest.bounds)}`)
