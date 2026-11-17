// Wires the Cove Sports Park boulodrome into the open world (docs/sports/CORE.md § 7). Idempotent.
//   node scripts/apply-sports-petanque.mjs   (after `npm run assets:optimize -- park sports_petanque`)
// - replaces the COL_SportsPetanque_ boxes in town.collision.json
// - upserts the sports_petanque zone (pass area) in world.manifest.json, right after sports_complex
// - lists the sports_petanque zone file (coach) in zones/index.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const KEY = 'sports_petanque'
const LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const MODEL = join(ASSETS, `park/${KEY}/${KEY}.glb`)
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const PREFIX = 'COL_SportsPetanque_'
const round4 = (n) => Math.round(n * 10000) / 10000

for (const file of [LAYOUT, MODEL, ZONE_FILE]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- park ${KEY}" first.`)
    process.exit(1)
  }
}
const layout = JSON.parse(readFileSync(LAYOUT, 'utf8'))
const zone = layout.zone
const within = (c) => c.cx - c.hx >= zone.minX && c.cx + c.hx <= zone.maxX && c.cz - c.hz >= zone.minZ && c.cz + c.hz <= zone.maxZ
const stray = layout.collision.filter((c) => !c.name.startsWith(PREFIX) || !within(c))
if (stray.length) {
  console.error(`Collision boxes outside ${KEY} or without ${PREFIX}: ${stray.map((c) => c.name).join(', ')}`)
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
if (at >= 0) {
  manifest.zones[at] = entry
} else {
  const site = manifest.zones.findIndex((z) => z.key === 'sports_complex')
  if (site < 0) {
    console.error('world.manifest.json has no sports_complex zone: run apply-sports-site.mjs first.')
    process.exit(1)
  }
  manifest.zones.splice(site + 1, 0, entry)
}
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
