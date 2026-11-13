import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(FRONT, 'public/assets')
const TOWN_COL = join(ASSETS, 'town/town.collision.json')
const WORLD_MANIFEST = join(ASSETS, 'world.manifest.json')
const SITE_LAYOUT = join(ASSETS, 'park/storage_site/storage_site.layout.json')
const STORAGE_INTERIOR = join(ASSETS, 'work/storage/interior.glb')

for (const file of [SITE_LAYOUT, STORAGE_INTERIOR]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file} - run "npm run assets:optimize -- work" and "npm run assets:optimize -- park" first.`)
    process.exit(1)
  }
}
const site = JSON.parse(readFileSync(SITE_LAYOUT, 'utf8'))
const round4 = (n) => Math.round(n * 10000) / 10000

const { gate } = site

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
const before = col.cuboids.length
col.cuboids = col.cuboids.filter((c) => !c.name.startsWith('COL_Storage_') && c.name !== 'COL_Work_storage')
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
  col.bounds.maxX = Math.max(col.bounds.maxX, site.bounds.maxX)
  col.bounds.minZ = Math.min(col.bounds.minZ, site.bounds.minZ)
  col.bounds.maxZ = Math.max(col.bounds.maxZ, site.bounds.maxZ)
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${before} -> ${col.cuboids.length} cuboids, bounds ${JSON.stringify(col.bounds)}`)

const manifest = JSON.parse(readFileSync(WORLD_MANIFEST, 'utf8'))
const zone = {
  key: 'storage',
  optional: true,
  bounds: site.bounds,
  modelUrl: '/assets/park/storage_site/storage_site.glb',
  gate,
  buildings: [{ kind: 'work', job: 'auction', ...site.storage }],
}
const at = manifest.zones.findIndex((z) => z.key === zone.key)
if (at >= 0) manifest.zones[at] = zone
else manifest.zones.push(zone)
manifest.storage = site.points
manifest.bounds = col.bounds
writeFileSync(WORLD_MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
console.log(`world.manifest.json: storage door at ${JSON.stringify(site.storage.door)}, ${site.points.units.length} storage units`)
