// Map-wide topography check: does the walk height follow the ground that is actually drawn?
//
//   npm run topo:check                 (every zone of world.manifest.json)
//   npm run topo:check -- pond orchard (only these zones)
//
// For every zone GLB in public/assets/world.manifest.json, the upward-facing triangles of ground materials
// (grass, meadow, paths, paving, ...) are sampled on a 1 m grid over the zone bounds and compared with the walk
// height the game uses (src/game/town/terrainHeight.ts over every zone heightmap; 0 where no zone has one).
// Two failures, each reported as clusters with a position to go and look:
//   sunk     the drawn ground is above the walk height: the player walks inside a slope
//   floating the walk height is above the drawn ground with no deck under the feet: a climb into the void
// Exit code 1 when anything is found. Docs: docs/ASSETS_STYLE_GUIDE.md "Relief".
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { heightmapAt, terrainHeightIn } from '../src/game/town/terrainHeight.ts'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(FRONT, 'public')

/** Materials players stand on outdoors. Upper mall floors are inside a building (buildingFloorAt), not terrain. */
const GROUND = /Grass|Meadow|Hill|Sand|PondBed|Path|Paving|Avenue|Asphalt|Cobble|Street|MallFloor$|SoftFloor|OrchardRows|Flagstone|CreekBank|Lawn/
/** Walkable structures above the ground (jetty, bridges, gazebo floor): the walk height may sit on them. */
const DECK = /Plank|Deck|Bridge|Step/
const TOLERANCE = 0.15
const CLUSTER = 6

const manifest = JSON.parse(readFileSync(join(PUBLIC, 'assets/world.manifest.json'), 'utf8'))
const only = process.argv.slice(2)
const zones = manifest.zones.filter((z) => z.modelUrl && (only.length === 0 || only.includes(z.key)))

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

/** Spatial hash of horizontal-ish triangles: [x0, y0, z0, x1, y1, z1, x2, y2, z2] each. */
class TriangleGrid {
  cell = 4
  buckets = new Map()
  count = 0
  add(t) {
    const minX = Math.floor(Math.min(t[0], t[3], t[6]) / this.cell)
    const maxX = Math.floor(Math.max(t[0], t[3], t[6]) / this.cell)
    const minZ = Math.floor(Math.min(t[2], t[5], t[8]) / this.cell)
    const maxZ = Math.floor(Math.max(t[2], t[5], t[8]) / this.cell)
    for (let i = minX; i <= maxX; i++) {
      for (let j = minZ; j <= maxZ; j++) {
        const key = `${i},${j}`
        if (!this.buckets.has(key)) this.buckets.set(key, [])
        this.buckets.get(key).push(t)
      }
    }
    this.count++
  }
  /** Heights of every triangle under (x, z). */
  heightsAt(x, z) {
    const out = []
    for (const t of this.buckets.get(`${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`) ?? []) {
      const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8])
      if (Math.abs(d) < 1e-9) continue
      const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d
      const b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d
      const c = 1 - a - b
      if (a >= -1e-6 && b >= -1e-6 && c >= -1e-6) out.push(a * t[1] + b * t[4] + c * t[7])
    }
    return out
  }
}

const ground = new TriangleGrid()
const decks = new TriangleGrid()
const unknownUp = new Set()

for (const zone of zones) {
  const doc = await io.read(join(PUBLIC, zone.modelUrl))
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const name = prim.getMaterial()?.getName() ?? ''
      const target = GROUND.test(name) ? ground : DECK.test(name) ? decks : null
      if (!target) continue
      const pos = prim.getAttribute('POSITION')
      const idx = prim.getIndices()
      const n = idx ? idx.getCount() : pos.getCount()
      const p = []
      for (let t = 0; t + 2 < n; t += 3) {
        const tri = []
        for (let k = 0; k < 3; k++) {
          pos.getElement(idx ? idx.getScalar(t + k) : t + k, p)
          tri.push(
            m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
          )
        }
        const ax = tri[3] - tri[0], ay = tri[4] - tri[1], az = tri[5] - tri[2]
        const bx = tri[6] - tri[0], by = tri[7] - tri[1], bz = tri[8] - tri[2]
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx
        const len = Math.hypot(nx, ny, nz)
        if (len > 0 && Math.abs(ny) / len > 0.5) target.add(tri)
      }
    }
  }
}
if (ground.count === 0) unknownUp.add('no ground material matched: check GROUND in this script')

const heightmaps = []
for (const zone of manifest.zones.filter((z) => z.heightmapUrl)) {
  heightmaps.push(JSON.parse(readFileSync(join(PUBLIC, zone.heightmapUrl), 'utf8')).heightmap)
}

/**
 * Standing on a deck, or on the 1 m heightmap cell that ramps up to its edge (the grid smears a deck over its
 * neighbour cell, which plays as a step): fine. A raised walk height with no deck that close is a climb into the void.
 */
function stepsOntoDeck(x, z, walk) {
  if (decks.heightsAt(x, z).some((h) => Math.abs(h - walk) <= TOLERANCE)) return true
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (decks.heightsAt(x + dx, z + dz).some((h) => h >= walk - TOLERANCE)) return true
  }
  return false
}

let failed = false
for (const zone of zones) {
  const b = zone.bounds
  const clusters = new Map()
  let samples = 0
  let onGround = 0
  let maxRelief = 0
  for (let x = Math.ceil(b.minX) + 0.5; x < b.maxX; x += 1) {
    for (let z = Math.ceil(b.minZ) + 0.5; z < b.maxZ; z += 1) {
      samples++
      const walk = terrainHeightIn(heightmaps, x, z)
      const tops = ground.heightsAt(x, z)
      const top = tops.length ? Math.max(...tops) : null
      if (top !== null) onGround++
      maxRelief = Math.max(maxRelief, top ?? 0)
      let kind = null
      let err = 0
      if (top !== null && top - walk > TOLERANCE) {
        kind = 'sunk'
        err = top - walk
      } else if (walk - (top ?? 0) > TOLERANCE && !stepsOntoDeck(x, z, walk)) {
        kind = 'floating'
        err = walk - (top ?? 0)
      }
      if (!kind) continue
      const key = `${kind}:${Math.floor(x / CLUSTER)},${Math.floor(z / CLUSTER)}`
      const c = clusters.get(key) ?? { kind, n: 0, err: 0, x, z, walk, top, overGrid: heightmaps.some((h) => heightmapAt(h, x, z) !== null) }
      c.n++
      if (err > c.err) Object.assign(c, { err, x, z, walk, top })
      clusters.set(key, c)
    }
  }
  const found = [...clusters.values()].sort((a, b2) => b2.err - a.err)
  const points = found.reduce((s, c) => s + c.n, 0)
  console.log(
    `${found.length ? 'FAIL' : 'ok  '} ${zone.key.padEnd(14)} ${samples} samples, ground drawn on ${Math.round((100 * onGround) / samples)} %,`
      + ` highest ground ${maxRelief.toFixed(2)} m${found.length ? `, ${points} bad points in ${found.length} spots` : ''}`,
  )
  for (const c of found.slice(0, 12)) {
    const ground = c.top === null ? 'no ground drawn' : `ground ${c.top.toFixed(2)}`
    console.log(`     ${c.kind.padEnd(8)} at (${c.x.toFixed(1)}, ${c.z.toFixed(1)}): walk ${c.walk.toFixed(2)}, ${ground}, off by ${c.err.toFixed(2)} m`
      + ` (${c.n} pts${c.overGrid ? '' : ', no heightmap here'})`)
  }
  if (found.length > 12) console.log(`     ... ${found.length - 12} more spots`)
  failed ||= found.length > 0
}
for (const msg of unknownUp) console.log(`warn ${msg}`)
console.log(failed ? '\nTopography check FAILED: fix the relief or the heightmap (docs/ASSETS_STYLE_GUIDE.md "Relief").' : '\nTopography check passed.')
process.exit(failed ? 1 : 0)
