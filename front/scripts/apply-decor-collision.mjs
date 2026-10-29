import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DECOR = join(FRONT, 'public/assets/decor')
const CELL = 0.1
const BODY_BAND_MIN_Y = 0.15
const BODY_BAND_MAX_Y = 1.9
const round4 = (n) => Math.round(n * 10000) / 10000

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

function transform(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]
}

function bodyBandSamples(doc) {
  const samples = []
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh()
    if (!mesh) continue
    const m = node.getWorldMatrix()
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION').getArray()
      const idx = prim.getIndices()?.getArray() ?? Array.from({ length: pos.length / 3 }, (_, i) => i)
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => transform(m, pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 1], pos[idx[t + k] * 3 + 2]))
        const span = Math.max(Math.hypot(b[0] - a[0], b[2] - a[2], b[1] - a[1]), Math.hypot(c[0] - a[0], c[2] - a[2], c[1] - a[1]), Math.hypot(c[0] - b[0], c[2] - b[2], c[1] - b[1]))
        const steps = Math.max(1, Math.ceil(span / (CELL / 3)))
        for (let i = 0; i <= steps; i++) {
          for (let j = 0; j <= steps - i; j++) {
            const u = i / steps
            const v = j / steps
            const w = 1 - u - v
            const y = a[1] * w + b[1] * u + c[1] * v
            if (y < BODY_BAND_MIN_Y || y > BODY_BAND_MAX_Y) continue
            samples.push([a[0] * w + b[0] * u + c[0] * v, y, a[2] * w + b[2] * u + c[2] * v])
          }
        }
      }
    }
  }
  return samples
}

function occupancyGrid(samples) {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const [x, , z] of samples) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const nx = Math.floor((maxX - minX) / CELL) + 1
  const nz = Math.floor((maxZ - minZ) / CELL) + 1
  const top = Array.from({ length: nx }, () => new Array(nz).fill(-1))
  for (const [x, y, z] of samples) {
    const i = Math.min(nx - 1, Math.floor((x - minX) / CELL))
    const k = Math.min(nz - 1, Math.floor((z - minZ) / CELL))
    top[i][k] = Math.max(top[i][k], y)
  }
  fillEnclosedCells(top, nx, nz)
  return { minX, minZ, nx, nz, top }
}

function fillEnclosedCells(top, nx, nz) {
  const outside = Array.from({ length: nx }, () => new Array(nz).fill(false))
  const queue = []
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      if ((i === 0 || k === 0 || i === nx - 1 || k === nz - 1) && top[i][k] < 0) {
        outside[i][k] = true
        queue.push([i, k])
      }
    }
  }
  while (queue.length > 0) {
    const [i, k] = queue.pop()
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di
      const b = k + dk
      if (a < 0 || b < 0 || a >= nx || b >= nz || outside[a][b] || top[a][b] >= 0) continue
      outside[a][b] = true
      queue.push([a, b])
    }
  }
  const tallest = Math.max(...top.flat())
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      if (top[i][k] < 0 && !outside[i][k]) top[i][k] = tallest
    }
  }
}

function largestRectangleTouching(grid, covered) {
  const { nx, nz, top } = grid
  let best = null
  for (let i0 = 0; i0 < nx; i0++) {
    for (let k0 = 0; k0 < nz; k0++) {
      if (top[i0][k0] < 0) continue
      let kMax = nz
      for (let i1 = i0; i1 < nx && top[i1][k0] >= 0; i1++) {
        let k1 = k0
        while (k1 < kMax && top[i1][k1] >= 0) k1++
        kMax = k1
        const area = (i1 - i0 + 1) * (kMax - k0)
        if (best && area <= best.area) continue
        let touchesUncovered = false
        for (let i = i0; i <= i1 && !touchesUncovered; i++) {
          for (let k = k0; k < kMax; k++) {
            if (!covered[i][k]) {
              touchesUncovered = true
              break
            }
          }
        }
        if (touchesUncovered) best = { i0, i1, k0, k1: kMax - 1, area }
      }
    }
  }
  return best
}

function footprintBoxes(grid) {
  const { minX, minZ, nx, top } = grid
  const covered = Array.from({ length: nx }, (_, i) => top[i].map((y) => y < 0))
  const boxes = []
  for (let rect = largestRectangleTouching(grid, covered); rect; rect = largestRectangleTouching(grid, covered)) {
    let height = 0
    for (let i = rect.i0; i <= rect.i1; i++) {
      for (let k = rect.k0; k <= rect.k1; k++) {
        covered[i][k] = true
        height = Math.max(height, top[i][k])
      }
    }
    const x0 = minX + rect.i0 * CELL
    const x1 = minX + (rect.i1 + 1) * CELL
    const z0 = minZ + rect.k0 * CELL
    const z1 = minZ + (rect.k1 + 1) * CELL
    boxes.push({
      name: `COL_Decor_${boxes.length}`,
      cx: round4((x0 + x1) / 2),
      cy: round4(height / 2),
      cz: round4((z0 + z1) / 2),
      hx: round4((x1 - x0) / 2),
      hy: round4(height / 2),
      hz: round4((z1 - z0) / 2),
      qx: 0,
      qy: 0,
      qz: 0,
      qw: 1,
    })
  }
  return boxes
}

for (const key of readdirSync(DECOR).sort()) {
  const model = join(DECOR, key, 'model.glb')
  if (!existsSync(model)) continue
  const samples = bodyBandSamples(await io.read(model))
  const cuboids = samples.length > 0 ? footprintBoxes(occupancyGrid(samples)) : []
  writeFileSync(join(DECOR, key, 'collision.json'), JSON.stringify({ version: 1, source: `decor/${key}/model.glb`, mode: 'footprint', cuboids }))
  console.log(`${key}: ${cuboids.length} boxes`)
}
