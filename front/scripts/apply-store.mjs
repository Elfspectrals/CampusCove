// Wires the Cove Home furniture store (map-src/CampusCove/build_store_ext.py) into the existing town. Idempotent.
//
//   npm run assets:optimize -- store     (builds public/assets/store/{cove_home,park}/)
//   node scripts/apply-store.mjs
//
// 1. town.collision.json : replaces every COL_Store_* box by the ones in park.layout.json, extends the walkable
//                          bounds east and north to the retail park
// 2. world.manifest.json : writes the `retail_park` zone (park scenery + the walk-in `store` building) and the
//                          world bounds
// 3. town.glb            : re-centres and widens the skyline ring (Sky_Ring) and the ground disc (Ground) on the
//                          world bounds, so the bigger world stays inside the backdrop
// The park scenery (park.glb) and the store exterior are loaded next to town.glb by the game.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const TOWN_GLB = join(ASSETS, 'town/town.glb')
const SKY_MARGIN = 10
const GROUND_OVERLAP = 5
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

// ---------------------------------------------------------------- 3. skyline ring + ground disc
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })
const doc = await io.read(TOWN_GLB)
const worldCx = (manifest.bounds.minX + manifest.bounds.maxX) / 2
const worldCz = (manifest.bounds.minZ + manifest.bounds.maxZ) / 2
const skyRadius = Math.hypot(manifest.bounds.maxX - worldCx, manifest.bounds.maxZ - worldCz) + SKY_MARGIN

function reshapeDisc(name, radius) {
  const node = doc.getRoot().listNodes().find((n) => n.getName() === name)
  if (!node?.getMesh()) throw new Error(`town.glb has no ${name} mesh`)
  const [tx, , tz] = node.getTranslation()
  const cx = worldCx - tx
  const cz = worldCz - tz
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const uv = prim.getAttribute('TEXCOORD_0')
    const v = [0, 0, 0]
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v)
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2])
    }
    const oldCx = (minX + maxX) / 2
    const oldCz = (minZ + maxZ) / 2
    const scale = radius / ((maxX - minX) / 2)
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v)
      pos.setElement(i, [cx + (v[0] - oldCx) * scale, v[1], cz + (v[2] - oldCz) * scale])
    }
    if (uv) {
      const t = [0, 0]
      for (let i = 0; i < uv.getCount(); i++) {
        uv.getElement(i, t)
        uv.setElement(i, name === 'Sky_Ring' ? [t[0] * scale, t[1]] : [t[0] * scale, t[1] * scale])
      }
    }
  }
}

reshapeDisc('Sky_Ring', skyRadius)
reshapeDisc('Ground', skyRadius + GROUND_OVERLAP)
await io.write(TOWN_GLB, doc)
console.log(`town.glb: Sky_Ring radius ${skyRadius.toFixed(1)} and Ground radius ${(skyRadius + GROUND_OVERLAP).toFixed(1)} around (${worldCx.toFixed(1)}, ${worldCz.toFixed(1)})`)
