import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_GLB = join(ASSETS, 'town/town.glb')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const SITE_LAYOUT = join(ASSETS, 'park/market_site/market_site.layout.json')

const ZONE_KEY = 'town_market'
const GATE_COLLIDERS = new Set(['COL_Hedge_02', 'COL_Hedge_03'])
const HEDGE_RING_MIN_RADIUS = 40

if (!existsSync(SITE_LAYOUT)) {
  console.error(`Missing ${SITE_LAYOUT} - run "npm run assets:optimize -- park" first.`)
  process.exit(1)
}
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000

function dropTriangles(node, shouldDrop) {
  const mesh = node.getMesh()
  if (!mesh) return 0
  const m = node.getMatrix()
  let dropped = 0
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray()
    const idxAcc = prim.getIndices()
    if (!idxAcc) continue
    const idx = idxAcc.getArray()
    const keep = []
    for (let t = 0; t + 2 < idx.length; t += 3) {
      let cx = 0
      let cz = 0
      for (let k = 0; k < 3; k++) {
        const i = idx[t + k] * 3
        cx += m[0] * pos[i] + m[4] * pos[i + 1] + m[8] * pos[i + 2] + m[12]
        cz += m[2] * pos[i] + m[6] * pos[i + 1] + m[10] * pos[i + 2] + m[14]
      }
      if (shouldDrop(cx / 3, cz / 3)) {
        dropped++
        continue
      }
      keep.push(idx[t], idx[t + 1], idx[t + 2])
    }
    if (keep.length !== idx.length) idxAcc.setArray(new idx.constructor(keep))
  }
  return dropped
}

const { gate } = site
const inGate = (x, z) => Math.hypot(x - gate.x, z - gate.z) <= gate.width / 2 + 0.5 && Math.hypot(x, z) >= HEDGE_RING_MIN_RADIUS

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })
const doc = await io.read(TOWN_GLB)
let removedHedge = 0
for (const node of doc.getRoot().listNodes()) {
  if (/^HedgeRing/i.test(node.getName() || '')) removedHedge += dropTriangles(node, inGate)
}
if (removedHedge > 0) {
  await io.write(TOWN_GLB, doc)
  console.log(`town.glb: removed ${removedHedge} hedge triangles (market gate)`)
} else {
  console.log('town.glb: market gate already clear')
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !GATE_COLLIDERS.has(c.name) && !c.name.startsWith('COL_Market_'))
for (const c of site.collision) {
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
  col.bounds.maxX = Math.max(col.bounds.maxX, site.bounds.maxX)
  col.bounds.minZ = Math.min(col.bounds.minZ, site.bounds.minZ)
  col.bounds.maxZ = Math.max(col.bounds.maxZ, site.bounds.maxZ)
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = { key: ZONE_KEY, optional: true, bounds: site.bounds, modelUrl: '/assets/park/market_site/market_site.glb', gate }
const at = manifest.zones.findIndex((z) => z.key === zone.key)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: ${ZONE_KEY} zone, gate ${JSON.stringify(gate)}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(ZONE_KEY)) {
  index.zones = [...index.zones, ZONE_KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${ZONE_KEY} added`)
}
