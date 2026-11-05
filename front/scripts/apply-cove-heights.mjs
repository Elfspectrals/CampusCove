// Wires Cove Heights (gated estate) and Cove Road into the open world. Idempotent.
//   node scripts/apply-cove-heights.mjs   (after `npm run assets:optimize -- park cove_heights`)
// - merges the estate and road COL_ boxes into town.collision.json (orchard-style, no per-zone collision file)
// - adds the zones `cove_heights`, `cove_road`, `cove_road_mall` to world.manifest.json
// - copies the estate points (lots, gate, checkpoint) to manifest.coveHeights for later gameplay (docs/GATED_COMMUNITY.md)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const LAYOUT = join(ASSETS, 'park/cove_heights/cove_heights.layout.json')

if (!existsSync(LAYOUT)) {
  console.error(`Missing ${LAYOUT} - run "npm run assets:optimize -- park cove_heights" first.`)
  process.exit(1)
}
const site = JSON.parse(readFileSync(LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
// COL_House_<key>: the placeholder each walk-in house needs in a zone collision (openHouses.ts swaps it for the interior)
const houseKeys = new Set((site.houses ?? []).map((h) => h.key))
col.cuboids = col.cuboids.filter((c) => !c.name.startsWith('COL_Cove_') && !c.name.startsWith('COL_CoveRoad_')
  && !(c.name.startsWith('COL_House_cove_') || houseKeys.has(c.name.slice('COL_House_'.length))))
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
if (col.bounds) {
  for (const b of Object.values(site.zones)) {
    col.bounds.minX = Math.min(col.bounds.minX, b.minX)
    col.bounds.maxX = Math.max(col.bounds.maxX, b.maxX)
    col.bounds.minZ = Math.min(col.bounds.minZ, b.minZ)
    col.bounds.maxZ = Math.max(col.bounds.maxZ, b.maxZ)
  }
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
// walk-in, buyable houses of the estate (build_house_v2.py assets, HousingUnitSeeder rows with the same key and door)
const buildings = (site.houses ?? []).map(({ kind, key, name, position, rotationY, door, offer, price, interiorOffset }) =>
  ({ kind, key, name, position, rotationY, door, offer, price, interiorOffset }))
for (const [key, bounds] of Object.entries(site.zones)) {
  const zone = { key, optional: true, bounds, modelUrl: `/assets/park/cove_heights/${key}.glb` }
  if (key === 'cove_heights' && buildings.length) zone.buildings = buildings
  const at = manifest.zones.findIndex((z) => z.key === key)
  if (at >= 0) manifest.zones[at] = zone
  else manifest.zones.push(zone)
}
manifest.coveHeights = {
  spawn: site.spawn,
  mainGate: site.mainGate,
  emergencyGate: site.emergencyGate,
  gate: site.gate,
  checkpoint: site.checkpoint,
  clubhouseDoor: site.clubhouseDoor,
  lots: site.lots.map(({ id, type, center, entry, entryYaw, housingKey }) => ({ id, type, center, entry, entryYaw, housingKey })),
}
// admin watch menu: teleport just outside the main gate, on the visitor lane, looking into the estate (socket world.ts)
const adminDestinations = (manifest.adminDestinations ?? []).filter((d) => d.key !== 'cove_heights_gate')
adminDestinations.push({ key: 'cove_heights_gate', name: 'Cove Heights gate', position: site.adminTeleport.position, yaw: site.adminTeleport.yaw })
manifest.adminDestinations = adminDestinations
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: zones ${Object.keys(site.zones).join(', ')}, ${site.lots.length} lots, houses ${buildings.map((b) => b.key).join(', ') || 'none'}, gate enforced=${site.gate.enforced}`)
