// Wires the Cove Parkview Mall (map-src/CampusCove/build_mall.py + the three anchor stores) into the world. Idempotent.
//
//   npm run assets:optimize -- store     (builds public/assets/store/{mall,northline,hearth_hollow,greencart}/)
//   node scripts/apply-mall.mjs
//
// world.manifest.json gets the `mall` zone: the scenery GLB, its own collision file and its floor layout (levels and
// escalators in world coordinates), the main entrance as the zone gate, and the three anchors as walk-in `store`
// buildings (the three anchors and the shops that replace a cell). Their position comes from mall.layout.json (stores[]),
// their footprint, door and interiorOffset from each store's exterior.layout.json.
// town.glb / town.collision.json get the north-west gate of the avenue (mall.layout.json hedgeGate): the hedge ring and
// the tree in the way are cut like apply-clinic.mjs does for the west gate. The world bounds already cover the site.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const MALL_DIR = join(ASSETS, 'store/mall')
const MALL_LAYOUT = join(MALL_DIR, 'mall.layout.json')
const TOWN_GLB = join(ASSETS, 'town/town.glb')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const HEDGE_RING_MIN_RADIUS = 40
const TREE_RADIUS = 2.4
const GATE_TREE_REACH = 10
const KEEP_NODES = /^(Ground|Sky_Ring|Plaza|Plaza_Curb|Road|TownHall|Fountain|Path_|HedgeRing)/i

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

// ---------------------------------------------------------------- the north-west gate in the town hedge
const gate = mall.hedgeGate
const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const nearGate = (c) => Math.hypot(c.cx - gate.x, c.cz - gate.z)
const hedgeCut = col.cuboids.filter((c) => /^COL_Hedge_/.test(c.name) && nearGate(c) <= gate.width / 2 + 0.6)
const treesCut = col.cuboids.filter((c) => /^COL_Tree_/.test(c.name) && c.cx > gate.x && nearGate(c) <= GATE_TREE_REACH && Math.abs(c.cz - gate.z) <= 3.5)
const cutNames = new Set([...hedgeCut, ...treesCut].map((c) => c.name))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !cutNames.has(c.name))
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids (gate: ${[...cutNames].join(', ') || 'already open'})`)

const inGate = (x, z) => Math.hypot(x - gate.x, z - gate.z) <= gate.width / 2 + 0.5 && Math.hypot(x, z) >= HEDGE_RING_MIN_RADIUS
const onGateTree = (x, z) => treesCut.some((t) => Math.hypot(x - t.cx, z - t.cz) <= TREE_RADIUS)
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
  else if (treesCut.length > 0 && !KEEP_NODES.test(name)) removedTrees += dropTriangles(node, (x, y, z) => y > 0.02 && onGateTree(x, z))
}
if (removedHedge > 0 || removedTrees > 0) {
  await io.write(TOWN_GLB, doc)
  console.log(`town.glb: removed ${removedHedge} hedge triangles (north-west gate), ${removedTrees} tree triangles`)
} else {
  console.log('town.glb: north-west gate already clear')
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
