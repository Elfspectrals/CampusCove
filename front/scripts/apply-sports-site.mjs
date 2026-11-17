// Wires the Cove Sports Park core into the open world (docs/sports/MASTER_PLAN.md, docs/sports/CORE.md). Idempotent.
//   node scripts/apply-sports-site.mjs   (after `npm run assets:optimize -- work sports_reception` and `-- park sports_site`)
// - merges the COL_SportsRoad_ / COL_SportsSite_ / COL_SportsReception_ boxes and the reception placeholder
//   (COL_Work_sports_reception) into town.collision.json
// - upserts the zones sports_road, sports_entrance, sports_reception (with the pavilion) and sports_complex (pass area)
// - copies the gate, bus stop and car park points to manifest.sportsComplex and adds the admin teleport outside the gate
// - lists the zone files sports_entrance (ATM) and sports_reception (pass clerk) in zones/index.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const SITE_LAYOUT = join(ASSETS, 'park/sports_site/sports_site.layout.json')
const RECEPTION_INTERIOR = join(ASSETS, 'work/sports_reception/interior.glb')
const PREFIXES = ['COL_SportsRoad_', 'COL_SportsSite_', 'COL_SportsReception_']
const RECEPTION_PLACEHOLDER = 'COL_Work_sports_reception'
const ZONE_FILES = ['sports_entrance', 'sports_reception']
const ADMIN_KEY = 'sports_gate'
const EDGE_TOLERANCE = 0.5

for (const file of [SITE_LAYOUT, RECEPTION_INTERIOR, ...ZONE_FILES.map((z) => join(ASSETS, `zones/${z}.json`))]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work sports_reception" and "npm run assets:optimize -- park sports_site" first.`)
    process.exit(1)
  }
}
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000
const inside = (b, x, z) => x >= b.minX - EDGE_TOLERANCE && x <= b.maxX + EDGE_TOLERANCE && z >= b.minZ - EDGE_TOLERANCE && z <= b.maxZ + EDGE_TOLERANCE

const zones = Object.values(site.zones)
const stray = site.collision.filter((c) => !zones.some((b) => inside(b, c.cx, c.cz)))
if (stray.length) {
  console.error(`Collision boxes outside the sports zones: ${stray.map((c) => c.name).join(', ')}`)
  process.exit(1)
}
const unprefixed = site.collision.filter((c) => c.name !== RECEPTION_PLACEHOLDER && !PREFIXES.some((p) => c.name.startsWith(p)))
if (unprefixed.length) {
  console.error(`Collision boxes without a sports prefix: ${unprefixed.map((c) => c.name).join(', ')}`)
  process.exit(1)
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => c.name !== RECEPTION_PLACEHOLDER && !PREFIXES.some((p) => c.name.startsWith(p)))
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
for (const b of zones) {
  col.bounds.minX = Math.min(col.bounds.minX, b.minX)
  col.bounds.maxX = Math.max(col.bounds.maxX, b.maxX)
  col.bounds.minZ = Math.min(col.bounds.minZ, b.minZ)
  col.bounds.maxZ = Math.max(col.bounds.maxZ, b.maxZ)
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids`)

const modelUrl = (key) => `/assets/park/sports_site/${key}.glb`
const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const upserts = [
  { key: 'sports_road', optional: true, bounds: site.zones.sports_road, modelUrl: modelUrl('sports_road') },
  { key: 'sports_entrance', optional: true, bounds: site.zones.sports_entrance, modelUrl: modelUrl('sports_entrance') },
  { key: 'sports_reception', optional: true, bounds: site.zones.sports_reception, modelUrl: modelUrl('sports_reception'), buildings: [site.reception] },
  { key: 'sports_complex', optional: true, bounds: site.zones.sports_complex, modelUrl: modelUrl('sports_complex'), sportsPass: true, gate: site.gate },
]
for (const zone of upserts) {
  const at = manifest.zones.findIndex((z) => z.key === zone.key)
  if (at >= 0) manifest.zones[at] = zone
  else manifest.zones.push(zone)
}
manifest.sportsComplex = site.sportsComplex
const adminDestinations = (manifest.adminDestinations ?? []).filter((d) => d.key !== ADMIN_KEY)
adminDestinations.push({ key: ADMIN_KEY, name: 'Cove Sports Park gate', position: site.adminTeleport.position, yaw: site.adminTeleport.yaw })
manifest.adminDestinations = adminDestinations
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zones ${upserts.map((z) => z.key).join(', ')}, reception door ${JSON.stringify(site.reception.door)}, gate ${JSON.stringify(site.gate)}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
const missing = ZONE_FILES.filter((z) => !index.zones.includes(z))
if (missing.length) {
  index.zones = [...index.zones, ...missing].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${missing.join(', ')} added`)
}
