// Wires the business district (map-src/CampusCove/build_work_district.py) into the existing town. Idempotent.
//
//   npm run assets:optimize -- work     (builds public/assets/work/district/{district.glb,district.layout.json})
//   node scripts/apply-work-district.mjs
//
// 1. town.glb          : removes the hedge triangles of the two south segments (the gate, |x| <= 6.05 around z = 46)
// 2. town.collision.json : drops COL_Hedge_35/36, replaces every COL_Work_* box by the ones in district.layout.json,
//                          extends the walkable bounds to the district
// 3. town.layout.json  : writes the `work` array (building placements + door interaction points)
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
const TOWN_LAYOUT = join(ASSETS, 'town/town.layout.json')
const DISTRICT_LAYOUT = join(ASSETS, 'work/district/district.layout.json')

const GATE_HALF_WIDTH = 6.05
const GATE_Z_MIN = 43.5
const GATE_Z_MAX = 48.5
const GATE_HEDGES = new Set(['COL_Hedge_35', 'COL_Hedge_36', 'COL_Tree_9_0', 'COL_Tree_9_1'])

if (!existsSync(DISTRICT_LAYOUT)) {
  console.error(`Missing ${DISTRICT_LAYOUT} - run "npm run assets:optimize -- work" first.`)
  process.exit(1)
}
const district = JSON.parse(readFileSync(DISTRICT_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000

// ---------------------------------------------------------------- 1. gate in the hedge ring (visual)
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })
const doc = await io.read(TOWN_GLB)
let removed = 0
let removedTrees = 0
/** Ground / big surface nodes never lose triangles to the avenue clearing. */
const KEEP_NODES = /^(Ground|Sky_Ring|Plaza|Plaza_Curb|Road|TownHall|Fountain|Path_|HedgeRing)/i
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getMatrix()
  // Avenue clearing: the two town trees Tree_9 at (0, 33) and (0, 38) stand in the middle of the new avenue.
  if (!KEEP_NODES.test(node.getName() || '')) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray()
      const idxAcc = prim.getIndices()
      if (!idxAcc) continue
      const idx = idxAcc.getArray()
      const keep = []
      for (let t = 0; t + 2 < idx.length; t += 3) {
        let cx = 0
        let cz = 0
        let cy = 0
        for (let k = 0; k < 3; k++) {
          const i = idx[t + k] * 3
          const x = pos[i]
          const y = pos[i + 1]
          const z = pos[i + 2]
          cx += m[0] * x + m[4] * y + m[8] * z + m[12]
          cy += m[1] * x + m[5] * y + m[9] * z + m[13]
          cz += m[2] * x + m[6] * y + m[10] * z + m[14]
        }
        cx /= 3
        cy /= 3
        cz /= 3
        if (Math.abs(cx) <= 2.6 && cz >= 30.4 && cz <= 40.6 && cy > 0.02) {
          removedTrees++
          continue
        }
        keep.push(idx[t], idx[t + 1], idx[t + 2])
      }
      if (keep.length !== idx.length) idxAcc.setArray(new idx.constructor(keep))
    }
  }
  if (!/^HedgeRing/i.test(node.getName() || '')) continue
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
        const x = pos[i]
        const y = pos[i + 1]
        const z = pos[i + 2]
        cx += m[0] * x + m[4] * y + m[8] * z + m[12]
        cz += m[2] * x + m[6] * y + m[10] * z + m[14]
      }
      cx /= 3
      cz /= 3
      if (Math.abs(cx) <= GATE_HALF_WIDTH && cz >= GATE_Z_MIN && cz <= GATE_Z_MAX) {
        removed++
        continue
      }
      keep.push(idx[t], idx[t + 1], idx[t + 2])
    }
    if (keep.length !== idx.length) idxAcc.setArray(new idx.constructor(keep))
  }
}
if (removed > 0 || removedTrees > 0) {
  await io.write(TOWN_GLB, doc)
  console.log(`town.glb: removed ${removed} hedge triangles (gate), ${removedTrees} tree triangles (avenue)`)
} else {
  console.log('town.glb: gate and avenue already clear')
}

// ---------------------------------------------------------------- 2. collision
const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !GATE_HEDGES.has(c.name) && !c.name.startsWith('COL_Work_'))
for (const c of district.collision) {
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
  col.bounds.maxZ = Math.max(col.bounds.maxZ, district.bounds.maxZ)
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids, bounds ${JSON.stringify(col.bounds)}`)

// ---------------------------------------------------------------- 3. layout
const layout = JSON.parse(readFileSync(TOWN_LAYOUT, 'utf8'))
layout.work = district.works.map((w) => ({
  key: w.key,
  name: w.name,
  job: w.job,
  position: w.position,
  rotationY: w.rotationY,
  door: w.door,
  footprint: w.footprint,
}))
layout.workGate = district.gate
writeFileSync(TOWN_LAYOUT, JSON.stringify(layout, null, 2) + '\n')
console.log(`town.layout.json: ${layout.work.length} work buildings`)
