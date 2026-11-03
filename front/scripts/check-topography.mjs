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
//   conflict two zone heightmaps cover the same point with different heights (the game keeps the higher one)
// Exit code 1 when anything is found. Docs: docs/ASSETS_STYLE_GUIDE.md "Relief".
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MathUtils, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { heightmapAt, terrainHeightIn } from '../src/game/town/terrainHeight.ts'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(FRONT, 'public')

/** Materials players stand on outdoors. Upper mall floors are inside a building (buildingFloorAt), not terrain. */
const GROUND = /Grass|Meadow|Hill|Sand|PondBed|Path|Paving|Avenue|Asphalt|Cobble|Street|MallFloor$|SoftFloor|OrchardRows|Flagstone|CreekBank|Lawn/
/** Walkable structures above the ground (jetty, bridges, gazebo floor): the walk height may sit on them. */
const DECK = /Plank|Deck|Bridge|Step/
/**
 * A deck counts only up to this height above the ground under it: higher upward faces of a deck material are
 * furniture (pub tables are TW_PubDeck at 0.93 m), and the 1 m ramp up to a deck edge may not rise more than this.
 */
const MAX_STEP = 0.75
const TOLERANCE = 0.15
const CLUSTER = 6

const manifest = JSON.parse(readFileSync(join(PUBLIC, 'assets/world.manifest.json'), 'utf8'))
const only = process.argv.slice(2)
const unknown = only.filter((key) => !manifest.zones.some((z) => z.key === key && z.modelUrl))
if (unknown.length) {
  console.error(`Unknown zone ${unknown.join(', ')}. Zones: ${manifest.zones.filter((z) => z.modelUrl).map((z) => z.key).join(', ')}`)
  process.exit(2)
}
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

/** Column-major 4x4 product a * b. */
function mul(a, b) {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}

/** World matrices of a node: one, or one per instance when optimize instanced it (EXT_mesh_gpu_instancing). */
function nodeMatrices(node) {
  const world = node.getWorldMatrix()
  const inst = node.getExtension('EXT_mesh_gpu_instancing')
  if (!inst) return [world]
  const [t, r, s] = ['TRANSLATION', 'ROTATION', 'SCALE'].map((k) => inst.getAttribute(k))
  const count = (t ?? r ?? s)?.getCount() ?? 0
  return Array.from({ length: count }, (_, i) => mul(world, MathUtils.compose(
    t ? t.getElement(i, []) : [0, 0, 0], r ? r.getElement(i, []) : [0, 0, 0, 1], s ? s.getElement(i, []) : [1, 1, 1], new Array(16))))
}

for (const zone of zones) {
  const doc = await io.read(join(PUBLIC, zone.modelUrl))
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    for (const m of nodeMatrices(node)) for (const prim of mesh.listPrimitives()) {
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

const gridZones = manifest.zones.filter((z) => z.heightmapUrl)
  .map((z) => ({ key: z.key, map: JSON.parse(readFileSync(join(PUBLIC, z.heightmapUrl), 'utf8')).heightmap }))
const heightmaps = gridZones.map((g) => g.map)

function groundAt(x, z) {
  const tops = ground.heightsAt(x, z)
  return tops.length ? Math.max(...tops) : null
}

/** Deck surfaces a player can stand on at (x, z): at most MAX_STEP above the ground there (not table tops). */
function decksAt(x, z) {
  const floor = groundAt(x, z) ?? 0
  return decks.heightsAt(x, z).filter((h) => h - floor <= MAX_STEP)
}

/**
 * Standing on a deck, or on the 1 m heightmap cell that ramps up to its edge (the grid smears a deck over its
 * neighbour cell, which plays as a step no higher than MAX_STEP): fine. Anything else raised is a climb into the void.
 */
function stepsOntoDeck(x, z, walk, top) {
  if (decksAt(x, z).some((h) => Math.abs(h - walk) <= TOLERANCE)) return true
  if (walk - (top ?? 0) > MAX_STEP) return false
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    if (decksAt(x + dx, z + dz).some((h) => h >= walk - TOLERANCE)) return true
  }
  return false
}

/** Two zone grids covering the same point must agree, or the higher one silently wins in the game. */
function gridConflict(x, z) {
  const values = gridZones.map((g) => ({ key: g.key, h: heightmapAt(g.map, x, z) })).filter((v) => v.h !== null)
  if (values.length < 2) return null
  values.sort((a, b) => a.h - b.h)
  const spread = values.at(-1).h - values[0].h
  return spread > TOLERANCE ? { spread, keys: values.map((v) => v.key).join(' / ') } : null
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
      const top = groundAt(x, z)
      if (top !== null) onGround++
      maxRelief = Math.max(maxRelief, top ?? 0)
      let kind = null
      let err = 0
      const conflict = gridConflict(x, z)
      if (conflict) {
        kind = `conflict ${conflict.keys}`
        err = conflict.spread
      } else if (top !== null && top - walk > TOLERANCE) {
        kind = 'sunk'
        err = top - walk
      } else if (walk - (top ?? 0) > TOLERANCE && !stepsOntoDeck(x, z, walk, top)) {
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
