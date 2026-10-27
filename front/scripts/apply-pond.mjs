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
const POND_LAYOUT = join(ASSETS, 'park/pond/pond.layout.json')

const GATE_HALF_WIDTH = 6.05
const GATE_Z_MIN = -48.5
const GATE_Z_MAX = -43.5
const AVENUE_HALF_WIDTH = 2.6
const AVENUE_Z_MIN = -40.6
const AVENUE_Z_MAX = -30.4
const GATE_COLLIDERS = new Set(['COL_Hedge_11', 'COL_Hedge_12', 'COL_Tree_4_0', 'COL_Tree_4_1'])
const KEEP_NODES = /^(Ground|Sky_Ring|Plaza|Plaza_Curb|Road|TownHall|Fountain|Path_|HedgeRing)/i

if (!existsSync(POND_LAYOUT)) {
  console.error(`Missing ${POND_LAYOUT} - run "npm run assets:optimize -- park" first.`)
  process.exit(1)
}
const pond = JSON.parse(readFileSync(POND_LAYOUT, 'utf8'))
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
      let cy = 0
      let cz = 0
      for (let k = 0; k < 3; k++) {
        const i = idx[t + k] * 3
        const x = pos[i]
        const y = pos[i + 1]
        const z = pos[i + 2]
        cx += m[0] * x + m[4] * y + m[8] * z + m[12]
        cy += m[1] * x + m[5] * y + m[9] * z + m[13]
        cz += m[2] * x + m[6] * y + m[10] * z + m[14]
      }
      if (shouldDrop(cx / 3, cy / 3, cz / 3)) {
        dropped++
        continue
      }
      keep.push(idx[t], idx[t + 1], idx[t + 2])
    }
    if (keep.length !== idx.length) idxAcc.setArray(new idx.constructor(keep))
  }
  return dropped
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })
const doc = await io.read(TOWN_GLB)
let removedHedge = 0
let removedTrees = 0
for (const node of doc.getRoot().listNodes()) {
  const name = node.getName() || ''
  if (/^HedgeRing/i.test(name)) {
    removedHedge += dropTriangles(node, (x, _y, z) => Math.abs(x) <= GATE_HALF_WIDTH && z >= GATE_Z_MIN && z <= GATE_Z_MAX)
  } else if (!KEEP_NODES.test(name)) {
    removedTrees += dropTriangles(node, (x, y, z) => Math.abs(x) <= AVENUE_HALF_WIDTH && z >= AVENUE_Z_MIN && z <= AVENUE_Z_MAX && y > 0.02)
  }
}
if (removedHedge > 0 || removedTrees > 0) {
  await io.write(TOWN_GLB, doc)
  console.log(`town.glb: removed ${removedHedge} hedge triangles (north gate), ${removedTrees} tree triangles (pond avenue)`)
} else {
  console.log('town.glb: north gate and pond avenue already clear')
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !GATE_COLLIDERS.has(c.name) && !c.name.startsWith('COL_Pond_'))
for (const c of pond.collision) {
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
  col.bounds.minZ = Math.min(col.bounds.minZ, pond.bounds.minZ)
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids, bounds ${JSON.stringify(col.bounds)}`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = manifest.zones.find((z) => z.key === 'pond')
if (!zone) throw new Error('world.manifest.json has no pond zone')
Object.assign(zone, {
  gate: pond.gate,
  center: pond.center,
  fishingSpots: pond.fishingSpots,
  kiosk: pond.kiosk,
})
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: pond with ${zone.fishingSpots.length} fishing spots`)
