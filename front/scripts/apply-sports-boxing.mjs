import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const KEY = 'sports_boxing'
const SITE_LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const HALL_INTERIOR = join(ASSETS, `work/${KEY}/interior.glb`)
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const RULES = join(ASSETS, 'sports/rules/boxing.json')
const PREFIX = 'COL_SportsBoxing_'
const PLACEHOLDER = `COL_Work_${KEY}`
const ADMIN_KEY = KEY
const EDGE_TOLERANCE = 1e-6

for (const file of [SITE_LAYOUT, HALL_INTERIOR, ZONE_FILE, RULES]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run the boxing Blender builds and "npm run assets:optimize -- work ${KEY}" and "-- park ${KEY}" first.`)
    process.exit(1)
  }
}
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const zone = site.zone
const round4 = (n) => Math.round(n * 10000) / 10000
const insideZone = (c) => c.cx - c.hx >= zone.minX - EDGE_TOLERANCE && c.cx + c.hx <= zone.maxX + EDGE_TOLERANCE
  && c.cz - c.hz >= zone.minZ - EDGE_TOLERANCE && c.cz + c.hz <= zone.maxZ + EDGE_TOLERANCE

const stray = site.collision.filter((c) => !insideZone(c) || (c.name !== PLACEHOLDER && !c.name.startsWith(PREFIX)))
if (stray.length) {
  console.error(`Collision boxes outside the footprint or without the ${PREFIX} prefix: ${stray.map((c) => c.name).join(', ')}`)
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
const entry = { key: KEY, optional: true, bounds: zone, modelUrl: `/assets/park/${KEY}/${KEY}.glb`, sportsPass: true, buildings: [site.hall] }
const at = manifest.zones.findIndex((z) => z.key === KEY)
if (at >= 0) manifest.zones[at] = entry
else manifest.zones.push(entry)
const adminDestinations = (manifest.adminDestinations ?? []).filter((d) => d.key !== ADMIN_KEY)
adminDestinations.push({ key: ADMIN_KEY, name: 'Cove Boxing Club', position: site.adminTeleport.position, yaw: site.adminTeleport.yaw })
manifest.adminDestinations = adminDestinations
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY}, hall door ${JSON.stringify(site.hall.door)}`)

const rules = JSON.parse(readFileSync(RULES, 'utf8'))
const xz = ([x, , z]) => ({ x, z })
const xyz = ([x, y, z]) => ({ x, y, z })
const { ring, corners, exits } = site.boxing
rules.ring = { ...rules.ring, centre: { x: ring.centre[0], y: ring.centre[1], z: ring.centre[2] }, halfM: ring.half }
rules.coach = xz(site.boxing.coach)
rules.punchBags = site.boxing.bagHits.map(([x, z]) => ({ x, z }))
rules.corners = { red: xyz(corners.red), blue: xyz(corners.blue) }
rules.exits = { red: xyz(exits.red), blue: xyz(exits.blue) }
writeFileSync(RULES, JSON.stringify(rules, null, 2) + '\n')
console.log(`sports/rules/boxing.json: ring at ${JSON.stringify(rules.ring.centre)}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
