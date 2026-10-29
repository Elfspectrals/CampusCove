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
const SITE_LAYOUT = join(ASSETS, 'park/clinic_site/clinic_site.layout.json')
const CLINIC_INTERIOR = join(ASSETS, 'work/clinic/interior.glb')

const GATE_COLLIDERS = new Set(['COL_Hedge_25', 'COL_Hedge_26', 'COL_Tree_7_0', 'COL_Tree_7_1'])
const GATE_TREES = [[-31.3849, 10.1976], [-36.1401, 11.7426]]
const TREE_RADIUS = 1.8
const HEDGE_RING_MIN_RADIUS = 40
const KEEP_NODES = /^(Ground|Sky_Ring|Plaza|Plaza_Curb|Road|TownHall|Fountain|Path_|HedgeRing)/i

for (const file of [SITE_LAYOUT, CLINIC_INTERIOR]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work" and "npm run assets:optimize -- park" first.`)
    process.exit(1)
  }
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

const { gate } = site
const inGate = (x, z) => Math.hypot(x - gate.x, z - gate.z) <= gate.width / 2 + 0.5 && Math.hypot(x, z) >= HEDGE_RING_MIN_RADIUS
const onGateTree = (x, z) => GATE_TREES.some(([tx, tz]) => Math.hypot(x - tx, z - tz) <= TREE_RADIUS)

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
  if (/^HedgeRing/i.test(name)) removedHedge += dropTriangles(node, (x, _y, z) => inGate(x, z))
  else if (!KEEP_NODES.test(name)) removedTrees += dropTriangles(node, (x, y, z) => y > 0.02 && onGateTree(x, z))
}
if (removedHedge > 0 || removedTrees > 0) {
  await io.write(TOWN_GLB, doc)
  console.log(`town.glb: removed ${removedHedge} hedge triangles (west gate), ${removedTrees} tree triangles`)
} else {
  console.log('town.glb: west gate already clear')
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !GATE_COLLIDERS.has(c.name) && !c.name.startsWith('COL_Clinic_') && c.name !== 'COL_Work_clinic')
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
  col.bounds.minX = Math.min(col.bounds.minX, site.bounds.minX)
  col.bounds.minZ = Math.min(col.bounds.minZ, site.bounds.minZ)
  col.bounds.maxZ = Math.max(col.bounds.maxZ, site.bounds.maxZ)
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids, bounds ${JSON.stringify(col.bounds)}`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = {
  key: 'clinic',
  optional: true,
  bounds: site.bounds,
  modelUrl: '/assets/park/clinic_site/clinic_site.glb',
  gate,
  buildings: [{ kind: 'work', ...site.clinic }],
}
const at = manifest.zones.findIndex((z) => z.key === zone.key)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
manifest.clinic = site.points
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: clinic door at ${JSON.stringify(site.clinic.door)}, ${site.points.beds.length} recovery beds`)
