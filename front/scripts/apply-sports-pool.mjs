import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fitTownBackdrop } from './lib/worldBackdrop.mjs'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const KEY = 'sports_pool'
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const TOWN_GLB = join(ASSETS, 'town/town.glb')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const SWIMMING_RULES = join(ASSETS, 'sports/rules/swimming.json')
const DIVING_RULES = join(ASSETS, 'sports/rules/diving.json')
const PREFIX = 'COL_SportsPool_'
const COVER_STEP = 0.25

for (const file of [LAYOUT, ZONE_FILE, SWIMMING_RULES, DIVING_RULES]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- park ${KEY}" first.`)
    process.exit(1)
  }
}
const layout = JSON.parse(readFileSync(LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000
const within = (b, minX, maxX, minZ, maxZ) => minX >= b.minX - 1e-6 && maxX <= b.maxX + 1e-6 && minZ >= b.minZ - 1e-6 && maxZ <= b.maxZ + 1e-6
const contains = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ

const stray = layout.collision.filter((c) => !c.name.startsWith(PREFIX) || c.yaw !== 0
  || !within(layout.bounds, c.cx - c.hx, c.cx + c.hx, c.cz - c.hz, c.cz + c.hz))
if (stray.length) {
  console.error(`Pool collision boxes without the ${PREFIX} prefix, turned, or outside the footprint: ${stray.map((c) => c.name).join(', ')}`)
  process.exit(1)
}

const hole = layout.groundHole
const uncovered = []
for (let x = hole.minX; x <= hole.maxX + 1e-9; x += COVER_STEP) {
  for (let z = hole.minZ; z <= hole.maxZ + 1e-9; z += COVER_STEP) {
    if (!layout.groundCover.some((r) => contains(r, x, z))) uncovered.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`)
  }
}
if (uncovered.length) {
  console.error(`Ground hole of ${KEY} left uncovered at ${uncovered.length} points, first ${uncovered.slice(0, 5).join(' ')}`)
  process.exit(1)
}

const coach = JSON.parse(readFileSync(ZONE_FILE, 'utf8')).props.find((p) => p.coach === 'pool_lanes')
if (!coach || Math.hypot(coach.position[0] - layout.pool.coach[0], coach.position[2] - layout.pool.coach[2]) > 0.01) {
  console.error(`zones/${KEY}.json: the pool_lanes coach must stand at ${JSON.stringify(layout.pool.coach)}`)
  process.exit(1)
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !c.name?.startsWith(PREFIX))
for (const c of layout.collision) {
  col.cuboids.push({ name: c.name, cx: round4(c.cx), cy: round4(c.cy), cz: round4(c.cz), hx: round4(c.hx), hy: round4(c.hy), hz: round4(c.hz), qx: 0, qy: 0, qz: 0, qw: 1 })
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = {
  key: KEY,
  optional: true,
  bounds: layout.bounds,
  modelUrl: `/assets/park/${KEY}/${KEY}.glb`,
  layoutUrl: `/assets/park/${KEY}/${KEY}.layout.json`,
  sportsPass: true,
  groundHole: hole,
}
const at = manifest.zones.findIndex((z) => z.key === KEY)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY}, ground hole ${JSON.stringify(hole)}`)

const backdrop = await fitTownBackdrop(TOWN_GLB, manifest)
console.log(`town.glb: Ground radius ${backdrop.groundRadius.toFixed(1)}, ${backdrop.holes} ground hole(s)`)

const swimming = JSON.parse(readFileSync(SWIMMING_RULES, 'utf8'))
swimming.coachPosition = layout.pool.coach
const { lengthM, lanes, water, depthsM, exits, startX, turnX, waterY, wadeY } = layout.pool
swimming.pool = {
  ...swimming.pool,
  lengthM,
  lanes: lanes.length,
  lanePositions: lanes.map((l) => ({ lane: l.lane, z: l.z })),
  blockPositions: lanes.map((l) => l.block),
  startX,
  turnX,
  waterVolume: water,
  waterY,
  wadeY,
  depthsM,
  exits,
}
writeFileSync(SWIMMING_RULES, JSON.stringify(swimming, null, 2) + '\n')
const diving = JSON.parse(readFileSync(DIVING_RULES, 'utf8'))
diving.pit = layout.diving.pit
diving.pitDepthM = layout.pool.depthsM.pit
diving.boards = layout.diving.boards
writeFileSync(DIVING_RULES, JSON.stringify(diving, null, 2) + '\n')
console.log('sports/rules: swimming pool and diving boards written')

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
