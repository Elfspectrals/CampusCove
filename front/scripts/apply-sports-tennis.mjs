import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const KEY = 'sports_tennis'
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const RULES = join(ASSETS, 'sports/rules/tennis.json')
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const PREFIX = 'COL_SportsTennis_'
const EPSILON = 1e-6

for (const file of [LAYOUT, RULES, ZONE_FILE]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- park ${KEY}" first.`)
    process.exit(1)
  }
}
const layout = JSON.parse(readFileSync(LAYOUT, 'utf8'))
const rules = JSON.parse(readFileSync(RULES, 'utf8'))
const bounds = layout.zone.bounds

const mismatch = rules.courts.filter((court) => {
  const built = layout.courts.find((c) => c.id === court.id)
  return !built || built.centre.some((v, i) => Math.abs(v - court.centre[i]) > EPSILON) || Math.abs(built.netHeight - court.netHeightM) > EPSILON
})
if (mismatch.length || layout.courts.length !== rules.courts.length) {
  console.error(`Courts of ${LAYOUT} differ from ${RULES}: ${mismatch.map((c) => c.id).join(', ') || 'count'}`)
  process.exit(1)
}
const stray = layout.collision.filter((c) => !c.name.startsWith(PREFIX) || c.cx - c.hx < bounds.minX || c.cx + c.hx > bounds.maxX || c.cz - c.hz < bounds.minZ || c.cz + c.hz > bounds.maxZ)
if (stray.length) {
  console.error(`Collision boxes outside ${KEY} or without ${PREFIX}: ${stray.map((c) => c.name).join(', ')}`)
  process.exit(1)
}

const round4 = (n) => Math.round(n * 10000) / 10000
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
const zone = { key: KEY, optional: true, bounds, modelUrl: `/assets/park/${KEY}/${KEY}.glb`, sportsPass: true }
const at = manifest.zones.findIndex((z) => z.key === KEY)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY} ${JSON.stringify(bounds)}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
