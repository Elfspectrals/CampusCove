import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOWN_GLB = join(FRONT, 'public/assets/town/town.glb')
const TOWN_COL = join(FRONT, 'public/assets/town/town.collision.json')
const UNROTATED_COLLIDER_RE = /^COL_Mailbox_/
const PLAZA_BENCH_COLLIDER_RE = /^COL_Bench_Plaza_/
const PLAZA_TOP_Y = 0.06
const BENCH_MAX_Y = 1.1
const BENCH_MARGIN = 0.05

const col = JSON.parse(readFileSync(TOWN_COL, 'utf8'))
let unrotated = 0
for (const c of col.cuboids) {
  if (!UNROTATED_COLLIDER_RE.test(c.name) || (c.qx === 0 && c.qy === 0 && c.qz === 0 && c.qw === 1)) continue
  Object.assign(c, { qx: 0, qy: 0, qz: 0, qw: 1 })
  unrotated++
}
writeFileSync(TOWN_COL, JSON.stringify(col))
console.log(`town.collision.json: ${unrotated} mailbox boxes aligned with their unrotated model`)

const benches = col.cuboids.filter((c) => PLAZA_BENCH_COLLIDER_RE.test(c.name))
if (benches.length === 0) throw new Error(`${TOWN_COL}: no COL_Bench_Plaza_* boxes to locate the plaza benches`)

function benchAt(x, y, z) {
  if (y > BENCH_MAX_Y) return null
  return benches.find((c) => {
    const yaw = 2 * Math.atan2(c.qy, c.qw)
    const dx = x - c.cx
    const dz = z - c.cz
    const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw)
    const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw)
    return Math.abs(lx) <= c.hx + BENCH_MARGIN && Math.abs(lz) <= c.hz + BENCH_MARGIN
  }) ?? null
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })
const doc = await io.read(TOWN_GLB)
const lifts = new Map()
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const m = node.getWorldMatrix()
  const upright = m[5] === 1 && [1, 4, 6, 9].every((i) => m[i] === 0)
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray()
    const hits = []
    for (let i = 0; i < pos.length; i += 3) {
      const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]]
      const bench = benchAt(m[0] * x + m[8] * z + m[12], y + m[13], m[2] * x + m[10] * z + m[14])
      if (bench) hits.push([i, bench])
    }
    if (hits.length === 0) continue
    if (!upright) throw new Error(`town.glb node ${node.getName()} is tilted or scaled on Y; plaza bench lift expects an upright node`)
    for (const [i, bench] of hits) {
      const lowest = Math.min(lifts.get(bench.name)?.lowest ?? Infinity, pos[i + 1] + m[13])
      lifts.set(bench.name, { lowest, verts: [...(lifts.get(bench.name)?.verts ?? []), [pos, i]] })
    }
  }
}
let lifted = 0
for (const [name, { lowest, verts }] of lifts) {
  const lift = PLAZA_TOP_Y - lowest
  if (lift < 0.01) continue
  for (const [pos, i] of verts) pos[i + 1] += lift
  console.log(`town.glb: ${name.replace('COL_', '')} raised by ${lift.toFixed(3)} m onto the plaza`)
  lifted++
}
if (lifted > 0) await io.write(TOWN_GLB, doc)
else console.log('town.glb: plaza benches already on the plaza')
