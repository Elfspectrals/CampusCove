import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const SITE_LAYOUT = join(ASSETS, 'park/pub_site/pub_site.layout.json')
const PUB_INTERIOR = join(ASSETS, 'work/pub/interior.glb')
const PUB_INTERIOR_LAYOUT = join(ASSETS, 'work/pub/interior.layout.json')

for (const file of [SITE_LAYOUT, PUB_INTERIOR, PUB_INTERIOR_LAYOUT]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work" and "npm run assets:optimize -- park" first.`)
    process.exit(1)
  }
}
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const inner = JSON.parse(readFileSync(PUB_INTERIOR_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000
const round3 = (n) => Math.round(n * 1000) / 1000

// interior local -> world, same transform as build_pub_site.py (interiorOffset, then the building's yaw and position)
const [ox, oy, oz] = site.pub.interiorOffset
const [px, py, pz] = site.pub.position
const yaw = site.pub.rotationY
const toWorld = ([lx, ly, lz]) => {
  const x = lx + ox
  const z = lz + oz
  return [round3(px + x * Math.cos(yaw) + z * Math.sin(yaw)), round3(py + ly + oy), round3(pz - x * Math.sin(yaw) + z * Math.cos(yaw))]
}
const worldYaw = (y) => round4((((y + yaw) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))
const worldBox = ({ minX, maxX, minZ, maxZ }) => {
  const corners = [[minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]].map(([x, z]) => toWorld([x, 0, z]))
  const xs = corners.map((c) => c[0])
  const zs = corners.map((c) => c[2])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !c.name.startsWith('COL_Pub_') && c.name !== 'COL_Work_pub')
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
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids, bounds ${JSON.stringify(col.bounds)}`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = {
  key: 'pub',
  optional: true,
  bounds: site.bounds,
  modelUrl: '/assets/park/pub_site/pub_site.glb',
  gate: site.gate,
  buildings: [{ kind: 'work', ...site.pub }],
}
const at = manifest.zones.findIndex((z) => z.key === zone.key)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
// interior seats come straight from the interior layout so cellar seats carry their real (basement) height
const gardenSeats = site.points.seats.filter((seat) => seat.kind === 'garden')
const interiorSeats = inner.seats.map((seat) => ({ id: seat.id, kind: seat.kind, position: toWorld(seat.position), yaw: worldYaw(seat.yaw) }))
// every interior point is recomputed from the interior layout, so a rebuilt interior never waits for build_pub_site.py
manifest.pub = {
  ...site.points,
  bartender: toWorld(inner.npcs.bartender),
  bartenderYaw: worldYaw(inner.bartenderYaw),
  bouncer: toWorld(inner.npcs.bouncer),
  counter: toWorld(inner.counter),
  taps: toWorld(inner.taps),
  serve: toWorld(inner.serve),
  bell: toWorld(inner.bell),
  secretDoor: { position: toWorld(inner.secretDoor.position), yaw: worldYaw(inner.secretDoor.yaw) },
  darts: { board: toWorld(inner.darts.board), boardYaw: worldYaw(inner.darts.boardYaw), oche: toWorld(inner.darts.oche) },
  shots: { plank: toWorld(inner.shots.plank), yaw: worldYaw(inner.shots.yaw), player: toWorld(inner.shots.player) },
  secretRoom: worldBox(inner.secretRoom),
  basement: { ...worldBox(inner.basement), floorY: round3(py + inner.basement.floorY + oy) },
  seats: [...interiorSeats, ...gardenSeats],
}
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: pub door at ${JSON.stringify(site.pub.door)}, gate at ${JSON.stringify(site.gate)}, ${manifest.pub.seats.length} seats, basement ${JSON.stringify(manifest.pub.basement)}`)
