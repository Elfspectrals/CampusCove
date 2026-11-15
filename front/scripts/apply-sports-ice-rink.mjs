import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KEY = 'sports_ice_rink'
const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const SITE_LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const HALL_INTERIOR = join(ASSETS, `work/${KEY}/interior.glb`)
const PREFIX = 'COL_SportsIceRink_'
const PLACEHOLDER = `COL_Work_${KEY}`
const COACH_ID = 'rink_coach'
const ADMIN_KEY = KEY
const ADMIN_STEP_OUT = 2.5
const EPSILON = 1e-6

for (const file of [SITE_LAYOUT, HALL_INTERIOR, ZONE_FILE]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work ${KEY}" and "npm run assets:optimize -- park ${KEY}" first.`)
    process.exit(1)
  }
}
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const zone = site.zone
const round4 = (n) => Math.round(n * 10000) / 10000

const outside = site.collision.filter((c) => {
  const reach = Math.abs(c.hx * Math.cos(c.yaw)) + Math.abs(c.hz * Math.sin(c.yaw))
  const depth = Math.abs(c.hx * Math.sin(c.yaw)) + Math.abs(c.hz * Math.cos(c.yaw))
  return c.cx - reach < zone.minX - EPSILON || c.cx + reach > zone.maxX + EPSILON || c.cz - depth < zone.minZ - EPSILON || c.cz + depth > zone.maxZ + EPSILON
})
if (outside.length) {
  console.error(`Collision boxes outside the ${KEY} footprint: ${outside.map((c) => c.name).join(', ')}`)
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
const entry = {
  key: KEY,
  optional: true,
  bounds: zone,
  modelUrl: `/assets/park/${KEY}/${KEY}.glb`,
  sportsPass: true,
  buildings: [site.building],
}
const at = manifest.zones.findIndex((z) => z.key === KEY)
if (at >= 0) manifest.zones[at] = entry
else manifest.zones.push(entry)
const [doorX, , doorZ] = site.building.door
const adminDestinations = (manifest.adminDestinations ?? []).filter((d) => d.key !== ADMIN_KEY)
adminDestinations.push({ key: ADMIN_KEY, name: 'Cove Ice Rink', position: [round4(doorX + ADMIN_STEP_OUT), 0, doorZ], yaw: site.points.coachYaw })
manifest.adminDestinations = adminDestinations
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY}, door ${JSON.stringify(site.building.door)}`)

const decor = JSON.parse(readFileSync(ZONE_FILE, 'utf8'))
const coach = decor.props.find((p) => p.coach === COACH_ID)
if (!coach) {
  console.error(`${ZONE_FILE}: no prop with "coach": "${COACH_ID}"`)
  process.exit(1)
}
coach.position = site.points.rinkCoach
coach.yaw = site.points.coachYaw
writeFileSync(ZONE_FILE, JSON.stringify(decor, null, 2) + '\n')
console.log(`zones/${KEY}.json: coach at ${JSON.stringify(coach.position)}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
