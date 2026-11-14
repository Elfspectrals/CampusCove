import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const SITE_LAYOUT = join(ASSETS, 'park/sports_gym/sports_gym.layout.json')
const GYM_INTERIOR = join(ASSETS, 'work/sports_gym/interior.glb')
const COURT_CONTRACT = join(ASSETS, 'sports/gym/court.json')
const ZONE_KEY = 'sports_gym'
const PREFIX = 'COL_SportsGym_'
const PLACEHOLDER = 'COL_Work_sports_gym'

for (const file of [SITE_LAYOUT, GYM_INTERIOR, join(ASSETS, `zones/${ZONE_KEY}.json`)]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work sports_gym" and "npm run assets:optimize -- park sports_gym" first.`)
    process.exit(1)
  }
}
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000
const b = site.bounds
const outside = site.collision.filter((c) => c.cx - c.hx < b.minX || c.cx + c.hx > b.maxX || c.cz - c.hz < b.minZ || c.cz + c.hz > b.maxZ)
if (outside.length) {
  console.error(`Collision boxes outside the sports_gym footprint: ${outside.map((c) => c.name).join(', ')}`)
  process.exit(1)
}
const unprefixed = site.collision.filter((c) => c.name !== PLACEHOLDER && !c.name.startsWith(PREFIX))
if (unprefixed.length) {
  console.error(`Collision boxes without the ${PREFIX} prefix: ${unprefixed.map((c) => c.name).join(', ')}`)
  process.exit(1)
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => c.name !== PLACEHOLDER && !c.name.startsWith(PREFIX))
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
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = {
  key: ZONE_KEY,
  optional: true,
  bounds: site.bounds,
  modelUrl: '/assets/park/sports_gym/sports_gym.glb',
  sportsPass: true,
  buildings: [site.gym],
}
const at = manifest.zones.findIndex((z) => z.key === ZONE_KEY)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${ZONE_KEY}, door ${JSON.stringify(site.gym.door)}`)

writeFileSync(COURT_CONTRACT, JSON.stringify(site.court, null, 2) + '\n')
console.log(`sports/gym/court.json: coach ${JSON.stringify(site.court.coach)}, centre ${JSON.stringify(site.court.centre)}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(ZONE_KEY)) {
  index.zones = [...index.zones, ZONE_KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${ZONE_KEY} added`)
}
