import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const KEY = 'sports_climbing'
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const ZONE_INDEX = join(ASSETS, 'zones/index.json')
const LAYOUT = join(ASSETS, `park/${KEY}/${KEY}.layout.json`)
const GROUND = join(ASSETS, `park/${KEY}/${KEY}.glb`)
const HALL_INTERIOR = join(ASSETS, `work/${KEY}/interior.glb`)
const ZONE_FILE = join(ASSETS, `zones/${KEY}.json`)
const RULES = join(ASSETS, 'sports/rules/climbing.json')
const PREFIX = 'COL_SportsClimbing_'
const PLACEHOLDER = `COL_Work_${KEY}`

for (const file of [LAYOUT, GROUND, HALL_INTERIOR, ZONE_FILE, RULES]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work ${KEY}" and "npm run assets:optimize -- park ${KEY}" first.`)
    process.exit(1)
  }
}
const layout = JSON.parse(readFileSync(LAYOUT, 'utf8'))
const zone = layout.zone
const round4 = (n) => Math.round(n * 10000) / 10000
const inside = (x, z) => x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ

const outside = layout.collision.filter((c) => !inside(c.cx - c.hx, c.cz - c.hz) || !inside(c.cx + c.hx, c.cz + c.hz))
if (outside.length) {
  console.error(`Collision boxes outside the climbing footprint: ${outside.map((c) => c.name).join(', ')}`)
  process.exit(1)
}
const unprefixed = layout.collision.filter((c) => c.name !== PLACEHOLDER && !c.name.startsWith(PREFIX))
if (unprefixed.length) {
  console.error(`Collision boxes without the ${PREFIX} prefix: ${unprefixed.map((c) => c.name).join(', ')}`)
  process.exit(1)
}
const rules = JSON.parse(readFileSync(RULES, 'utf8'))
const strayLines = rules.lines.filter((line) => !inside(line.base[0], line.base[1]))
if (rules.zone !== KEY || strayLines.length) {
  console.error(`climbing.json must name ${KEY} and keep its lines inside it: ${strayLines.map((l) => l.id).join(', ')}`)
  process.exit(1)
}
const coaches = JSON.parse(readFileSync(ZONE_FILE, 'utf8')).props.filter((p) => p.coach === rules.coachId)
if (coaches.length !== 1 || !inside(coaches[0].position[0], coaches[0].position[2])) {
  console.error(`zones/${KEY}.json needs one coach NPC "${rules.coachId}" inside the footprint`)
  process.exit(1)
}

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => c.name !== PLACEHOLDER && !c.name.startsWith(PREFIX))
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
const entry = { key: KEY, optional: true, bounds: zone, modelUrl: `/assets/park/${KEY}/${KEY}.glb`, sportsPass: true, buildings: [layout.hall] }
const at = manifest.zones.findIndex((z) => z.key === KEY)
if (at >= 0) manifest.zones[at] = entry
else manifest.zones.push(entry)
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zone ${KEY}, hall door ${JSON.stringify(layout.hall.door)}`)

const index = JSON.parse(readFileSync(ZONE_INDEX, 'utf8'))
if (!index.zones.includes(KEY)) {
  index.zones = [...index.zones, KEY].sort()
  writeFileSync(ZONE_INDEX, JSON.stringify(index, null, 2) + '\n')
  console.log(`zones/index.json: ${KEY} added`)
}
