// Wires the athletics venue of the Cove Sports Park into the open world (docs/sports/MASTER_PLAN.md § 6). Idempotent.
//   node scripts/apply-sports-athletics.mjs   (after `npm run assets:optimize -- park sports_athletics`)
// - merges the COL_SportsAthletics_ boxes into town.collision.json
// - upserts the sports_athletics zone (pass area) and its admin teleport in world.manifest.json
// - puts the coach NPC of zones/sports_athletics.json where sports/rules/running.json says, and lists the zone file
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const KEY = 'sports_athletics'
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const MODEL = join(ASSETS, `park/${KEY}/${KEY}.glb`)
const RULES = join(ASSETS, 'sports/rules/running.json')
const PREFIX = 'COL_SportsAthletics_'
const ADMIN_KEY = 'sports_athletics'

for (const file of [LAYOUT, MODEL, ZONE_FILE, RULES]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- park ${KEY}" first.`)
    process.exit(1)
  }
}
const layout = JSON.parse(readFileSync(LAYOUT, 'utf8'))
const rules = JSON.parse(readFileSync(RULES, 'utf8'))
const zone = layout.zone
const round4 = (n) => Math.round(n * 10000) / 10000

const outside = layout.collision.filter((c) => !c.name.startsWith(PREFIX) || c.cx - c.hx < zone.minX || c.cx + c.hx > zone.maxX || c.cz - c.hz < zone.minZ || c.cz + c.hz > zone.maxZ)
if (outside.length) {
  console.error(`Collision boxes outside ${KEY} or without ${PREFIX}: ${outside.map((c) => c.name).join(', ')}`)
  process.exit(1)
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !c.name.startsWith(PREFIX))
for (const c of layout.collision) {
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
const entry = { key: KEY, optional: true, bounds: zone, modelUrl: `/assets/park/${KEY}/${KEY}.glb`, sportsPass: true }
const at = manifest.zones.findIndex((z) => z.key === KEY)
if (at >= 0) manifest.zones[at] = entry
else manifest.zones.push(entry)
const adminDestinations = (manifest.adminDestinations ?? []).filter((d) => d.key !== ADMIN_KEY)
adminDestinations.push({ key: ADMIN_KEY, name: 'Athletics track', position: layout.adminTeleport.position, yaw: layout.adminTeleport.yaw })
manifest.adminDestinations = adminDestinations
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY} ${JSON.stringify(zone)}`)

const decor = JSON.parse(readFileSync(ZONE_FILE, 'utf8'))
const coach = decor.props.find((p) => p.kind === 'npc' && p.coach === rules.coachId)
if (!coach) {
  console.error(`zones/${KEY}.json has no NPC with "coach": "${rules.coachId}"`)
  process.exit(1)
}
coach.position = [rules.coach.x, coach.position[1], rules.coach.z]
writeFileSync(ZONE_FILE, JSON.stringify(decor, null, 2) + '\n')

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
