import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const KEY = 'sports_dance'
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const RULES = join(ASSETS, 'sports/rules/dance.json')
const LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const INTERIOR = join(ASSETS, `work/${KEY}/interior.glb`)
const PREFIX = 'COL_SportsDance_'
const BODY = `COL_Work_${KEY}`
const COACH_PROP = 'dance_coach'

for (const file of [LAYOUT, INTERIOR, ZONE_FILE, RULES]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work ${KEY}" and "npm run assets:optimize -- park ${KEY}" first.`)
    process.exit(1)
  }
}
const site = JSON.parse(readFileSync(LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000
const zone = site.zone
const insideZone = (c) => c.cx - c.hx >= zone.minX - 1e-6 && c.cx + c.hx <= zone.maxX + 1e-6 && c.cz - c.hz >= zone.minZ - 1e-6 && c.cz + c.hz <= zone.maxZ + 1e-6

const stray = site.collision.filter((c) => !insideZone(c))
if (stray.length) {
  console.error(`Collision boxes outside the ${KEY} footprint: ${stray.map((c) => c.name).join(', ')}`)
  process.exit(1)
}
const unprefixed = site.collision.filter((c) => c.name !== BODY && !c.name.startsWith(PREFIX))
if (unprefixed.length) {
  console.error(`Collision boxes without the ${PREFIX} prefix: ${unprefixed.map((c) => c.name).join(', ')}`)
  process.exit(1)
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => c.name !== BODY && !c.name.startsWith(PREFIX))
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
const entry = { key: KEY, optional: true, bounds: zone, modelUrl: `/assets/park/${KEY}/${KEY}.glb`, sportsPass: true, buildings: [site.studio] }
const at = manifest.zones.findIndex((z) => z.key === KEY)
if (at >= 0) manifest.zones[at] = entry
else manifest.zones.push(entry)
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY}, studio door ${JSON.stringify(site.studio.door)}`)

const rules = JSON.parse(readFileSync(RULES, 'utf8'))
const { coach, playArea, spots } = site.dance
rules.venue = { coach, playArea, spots }
writeFileSync(RULES, JSON.stringify(rules, null, 2) + '\n')
console.log(`sports/rules/dance.json: venue coach ${JSON.stringify(coach)}, ${spots.length} spots`)

const decor = JSON.parse(readFileSync(ZONE_FILE, 'utf8'))
const coachProp = decor.props.find((p) => p.id === COACH_PROP)
if (!coachProp) {
  console.error(`zones/${KEY}.json: no ${COACH_PROP} NPC prop`)
  process.exit(1)
}
coachProp.position = site.dance.coachPosition
coachProp.yaw = site.dance.coachYaw
writeFileSync(ZONE_FILE, JSON.stringify(decor, null, 2) + '\n')

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
