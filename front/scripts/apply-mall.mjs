// Wires the Cove Parkview Mall (map-src/CampusCove/build_mall.py + the three anchor stores) into the world. Idempotent.
//
//   npm run assets:optimize -- store     (builds public/assets/store/{mall,northline,hearth_hollow,greencart}/)
//   node scripts/apply-mall.mjs
//
// world.manifest.json gets the `mall` zone: the scenery GLB, its own collision file and its floor layout (levels and
// escalators in world coordinates), the main entrance as the zone gate, and the three anchors as walk-in `store`
// buildings. Their position comes from mall.layout.json (stores[]), their footprint, door and interiorOffset from each
// store's exterior.layout.json. The world bounds already cover the site (+-500 m), so nothing else changes.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const MALL_DIR = join(ASSETS, 'store/mall')
const MALL_LAYOUT = join(MALL_DIR, 'mall.layout.json')

for (const file of [MALL_LAYOUT, join(MALL_DIR, 'mall.glb'), join(MALL_DIR, 'mall.collision.json')]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- store" first.`)
    process.exit(1)
  }
}
const mall = JSON.parse(readFileSync(MALL_LAYOUT, 'utf8'))
const round3 = (n) => Math.round(n * 1000) / 1000

function anchorBuilding(store) {
  const extPath = join(ASSETS, 'store', store.key, 'exterior.layout.json')
  if (!existsSync(extPath)) throw new Error(`Missing ${extPath} - build_${store.key}.py was not optimized`)
  const ext = JSON.parse(readFileSync(extPath, 'utf8'))
  const [px, , pz] = store.position
  const [dx, dy, dz] = ext.doorLocal
  const cos = Math.cos(store.rotationY)
  const sin = Math.sin(store.rotationY)
  return {
    kind: 'store',
    key: store.key,
    name: store.name,
    position: store.position,
    rotationY: store.rotationY,
    door: [round3(px + dx * cos + dz * sin), dy, round3(pz - dx * sin + dz * cos)],
    footprint: ext.footprint,
    interiorOffset: ext.interiorOffset,
  }
}

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = {
  key: 'mall',
  optional: true,
  bounds: mall.bounds,
  modelUrl: '/assets/store/mall/mall.glb',
  collisionUrl: '/assets/store/mall/mall.collision.json',
  layoutUrl: '/assets/store/mall/mall.layout.json',
  animatedWater: true,
  gate: { x: mall.entrance.position[0], z: mall.entrance.position[2], width: mall.entrance.width },
  buildings: mall.stores.map(anchorBuilding),
}
const at = manifest.zones.findIndex((z) => z.key === zone.key)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: mall zone with ${zone.buildings.length} stores (${zone.buildings.map((b) => `${b.key} door ${JSON.stringify(b.door)}`).join(', ')}), ${mall.cells.length} cells in the layout`)
