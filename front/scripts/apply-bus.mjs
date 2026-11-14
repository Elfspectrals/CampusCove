import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { dropTriangles } from './lib/dropTriangles.mjs'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const ROUTE = join(FRONT, '../map-src/CampusCove/bus_route.json')
const SITE_LAYOUT = join(ASSETS, 'park/bus_line/bus_line.layout.json')
const TOWN_GLB = join(ASSETS, 'town/town.glb')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const MALL_GLB = join(ASSETS, 'store/mall/mall.glb')
const MALL_COL = join(ASSETS, 'store/mall/mall.collision.json')
const PUB_GLB = join(ASSETS, 'park/pub_site/pub_site.glb')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')

const PREFIX = 'COL_BusLine_'
const TOWN_CUTS = [
  { name: 'COL_Tree_6_0', x: -31.3849, z: -10.1976, radius: 2.4, above: 0.02 },
  { name: 'COL_Tree_2_0', x: 31.3849, z: -10.1976, radius: 2.4, above: 0.02 },
  { name: 'COL_Tree_2_1', x: 36.1401, z: -11.7426, radius: 2.4, above: 0.02 },
  { name: 'COL_Lamp_Out_08', x: -20.8496, z: -10.6234, radius: 0.45, above: 0.13 },
  { name: 'COL_Lamp_Out_01', x: 20.8496, z: -10.6234, radius: 0.45, above: 0.13 },
  { name: 'COL_Pub_Tree28', x: 98.83, z: -104.668, radius: 0, above: 0 },
]
const TOWN_KEEP_NODES = /^(Ground|Sky_Ring|Plaza|Plaza_Curb|Road|TownHall|Fountain|Path_|HedgeRing)/i
const MALL_SHELTER = { minX: -144.4, maxX: -139.3, minZ: -20.3, maxZ: -18.2, above: 0.11 }
const MALL_BIN = { name: 'COL_Avenue_Bin1_0', x: -138.8087, z: -14.7438, radius: 0.5, above: 0.13 }
const PUB_TREE = { x: 98.83, z: -104.668, radius: 2.4, above: 0.02 }
const PUB_TREE_NODES = /^PS_Tree/

for (const file of [SITE_LAYOUT, TOWN_GLB, TOWN_COL, MALL_GLB, MALL_COL, PUB_GLB]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run the bus line build and "npm run assets:optimize -- park bus_line" first.`)
    process.exit(1)
  }
}
const route = JSON.parse(readFileSync(ROUTE, 'utf8'))
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000
const unprefixed = site.collision.filter((c) => !c.name.startsWith(PREFIX))
if (unprefixed.length) {
  console.error(`Collision boxes without the ${PREFIX} prefix: ${unprefixed.map((c) => c.name).join(', ')}`)
  process.exit(1)
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

async function cutGlb(path, label, cut) {
  const doc = await io.read(path)
  const dropped = cut(doc)
  if (dropped > 0) {
    await io.write(path, doc)
    console.log(`${label}: removed ${dropped} triangles or nodes`)
  } else {
    console.log(`${label}: already clear`)
  }
}

const near = (c) => (x, y, z) => c.radius > 0 && y > c.above && Math.hypot(x - c.x, z - c.z) <= c.radius

await cutGlb(TOWN_GLB, 'town.glb', (doc) => {
  let dropped = 0
  for (const node of doc.getRoot().listNodes()) {
    if (TOWN_KEEP_NODES.test(node.getName() || '')) continue
    dropped += dropTriangles(node, (x, y, z) => TOWN_CUTS.some((c) => near(c)(x, y, z)))
  }
  return dropped
})

await cutGlb(MALL_GLB, 'mall.glb', (doc) => {
  let dropped = 0
  const s = MALL_SHELTER
  for (const node of doc.getRoot().listNodes()) {
    dropped += dropTriangles(node, (x, y, z) => near(MALL_BIN)(x, y, z) || (y > s.above && x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ))
  }
  return dropped
})

await cutGlb(PUB_GLB, 'pub_site.glb', (doc) => {
  let dropped = 0
  for (const node of doc.getRoot().listNodes()) {
    if (PUB_TREE_NODES.test(node.getName() || '')) dropped += dropTriangles(node, near(PUB_TREE))
  }
  return dropped
})

const mallCol = JSON.parse(readFileSync(MALL_COL, 'utf8'))
const mallBefore = mallCol.cuboids.length
mallCol.cuboids = mallCol.cuboids.filter((c) => !c.name.startsWith('COL_Bus_') && c.name !== MALL_BIN.name)
writeFileSync(MALL_COL, JSON.stringify(mallCol))
console.log(`mall.collision.json: ${mallBefore} -> ${mallCol.cuboids.length} cuboids`)

const townCol = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const townBefore = townCol.cuboids.length
const cutNames = new Set(TOWN_CUTS.map((c) => c.name))
townCol.cuboids = townCol.cuboids.filter((c) => !c.name.startsWith(PREFIX) && !cutNames.has(c.name))
for (const c of site.collision) {
  townCol.cuboids.push({
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
writeFileSync(TOWN_COL, JSON.stringify(townCol))
console.log(`town.collision.json: ${townBefore} -> ${townCol.cuboids.length} cuboids`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
manifest.bus = {
  modelUrl: '/assets/park/bus_line/bus_line.glb',
  busModelUrl: '/assets/park/bus_line/city_bus.glb',
  floorY: site.busFloorY,
  buses: route.buses,
  stops: route.stops,
}
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: bus line with ${route.stops.length} stops`)
