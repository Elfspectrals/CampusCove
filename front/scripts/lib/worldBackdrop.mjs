// Fits the town backdrop to the world bounds: re-centres and resizes the skyline ring (Sky_Ring) and the ground disc
// (Ground) of town.glb so the whole walkable world stays inside them, then rebuilds the Ground's top and bottom caps
// from their rim with a hole for each manifest zone that sets `groundHole` (docs/OPEN_WORLD.md, "Trous dans le sol").
// Idempotent: each run rescales from the current mesh extents and rebuilds the caps from the rim alone.
// Used by apply-store.mjs and apply-world-bounds.mjs.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { ShapeUtils, Vector2 } from 'three'

const SKY_MARGIN = 10
const GROUND_OVERLAP = 5
const HOLE_RIM_CLEARANCE = 1
const GROUND_TOP_Y = -0.024
const DRACO_POSITION_BITS = 14

/**
 * @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} Rect
 */

/**
 * The `groundHole` rectangles of the manifest zones, checked: finite, not empty, not overlapping each other.
 * @param {{ zones: { key: string, groundHole?: Rect }[] }} manifest
 * @returns {{ key: string, rect: Rect }[]}
 */
export function groundHoles(manifest) {
  const holes = []
  for (const zone of manifest.zones) {
    if (zone.groundHole === undefined) continue
    const r = zone.groundHole
    if (![r?.minX, r?.maxX, r?.minZ, r?.maxZ].every(Number.isFinite) || r.minX >= r.maxX || r.minZ >= r.maxZ) {
      throw new Error(`world.manifest.json: invalid groundHole of ${zone.key} ${JSON.stringify(r)}`)
    }
    for (const other of holes) {
      const o = other.rect
      if (r.minX < o.maxX && o.minX < r.maxX && r.minZ < o.maxZ && o.minZ < r.maxZ) {
        throw new Error(`world.manifest.json: groundHole of ${zone.key} overlaps the one of ${other.key}`)
      }
    }
    holes.push({ key: zone.key, rect: { minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ } })
  }
  return holes
}

/**
 * @param {string} townGlb path to public/assets/town/town.glb (rewritten in place)
 * @param {{ bounds: Rect, zones: { key: string, groundHole?: Rect }[] }} manifest world manifest (bounds and ground holes)
 * @returns {Promise<{ skyRadius: number, groundRadius: number, cx: number, cz: number, holes: number }>}
 */
export async function fitTownBackdrop(townGlb, manifest) {
  const { bounds } = manifest
  const holes = groundHoles(manifest)
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    })
  const doc = await io.read(townGlb)
  const worldCx = (bounds.minX + bounds.maxX) / 2
  const worldCz = (bounds.minZ + bounds.maxZ) / 2
  const skyRadius = Math.hypot(bounds.maxX - worldCx, bounds.maxZ - worldCz) + SKY_MARGIN

  function reshapeDisc(name, radius) {
    const node = doc.getRoot().listNodes().find((n) => n.getName() === name)
    if (!node?.getMesh()) throw new Error(`town.glb has no ${name} mesh`)
    const [tx, , tz] = node.getTranslation()
    const cx = worldCx - tx
    const cz = worldCz - tz
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      const uv = prim.getAttribute('TEXCOORD_0')
      const v = [0, 0, 0]
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v)
        minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2])
      }
      const oldCx = (minX + maxX) / 2
      const oldCz = (minZ + maxZ) / 2
      const scale = radius / ((maxX - minX) / 2)
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v)
        pos.setElement(i, [cx + (v[0] - oldCx) * scale, v[1], cz + (v[2] - oldCz) * scale])
      }
      if (uv) {
        const t = [0, 0]
        for (let i = 0; i < uv.getCount(); i++) {
          uv.getElement(i, t)
          uv.setElement(i, name === 'Sky_Ring' ? [t[0] * scale, t[1]] : [t[0] * scale, t[1] * scale])
        }
      }
    }
  }

  reshapeDisc('Sky_Ring', skyRadius)
  const groundRadius = skyRadius + GROUND_OVERLAP
  reshapeDisc('Ground', groundRadius)
  rebuildGroundCaps(doc, holes, { cx: worldCx, cz: worldCz, radius: groundRadius })
  pinGroundTop(doc)
  await io.write(townGlb, doc)
  const top = groundTopY(await io.read(townGlb))
  if (Math.abs(top - GROUND_TOP_Y) > 0.001) throw new Error(`town.glb Ground: top at y ${top.toFixed(4)} after compression, expected ${GROUND_TOP_Y}`)
  return { skyRadius, groundRadius, cx: worldCx, cz: worldCz, holes: holes.length }
}

/**
 * Replaces the Ground's flat caps (top, facing +y, and bottom, facing -y) with a triangulation of their rim points
 * minus the hole rectangles. The sides are kept. The caps' UVs follow the same linear mapping as the rim points.
 */
function rebuildGroundCaps(doc, holes, disc) {
  const node = doc.getRoot().listNodes().find((n) => n.getName() === 'Ground')
  const [tx, , tz] = node.getTranslation()
  const localHoles = holes.map(({ key, rect }) => {
    const local = { minX: rect.minX - tx, maxX: rect.maxX - tx, minZ: rect.minZ - tz, maxZ: rect.maxZ - tz }
    const corners = [[rect.minX, rect.minZ], [rect.maxX, rect.minZ], [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ]]
    if (corners.some(([x, z]) => Math.hypot(x - disc.cx, z - disc.cz) > disc.radius - HOLE_RIM_CLEARANCE)) {
      throw new Error(`groundHole of ${key} reaches the rim of the Ground disc (radius ${disc.radius.toFixed(1)})`)
    }
    return local
  })
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const nor = prim.getAttribute('NORMAL')
    const uv = prim.getAttribute('TEXCOORD_0')
    if (!nor || !uv) throw new Error('town.glb Ground: expected NORMAL and TEXCOORD_0 to rebuild its caps')
    const idx = prim.getIndices().getArray()
    const count = pos.getCount()
    const P = [], N = [], T = []
    const v = [0, 0, 0]
    const t = [0, 0]
    for (let i = 0; i < count; i++) {
      P.push([...pos.getElement(i, v)])
      N.push([...nor.getElement(i, v)])
      T.push([...uv.getElement(i, t)])
    }
    const capOf = (i) => (N[i][1] > 0.99 ? 1 : N[i][1] < -0.99 ? -1 : 0)
    const sideTris = []
    for (let k = 0; k + 2 < idx.length; k += 3) {
      if (capOf(idx[k]) === 0 || capOf(idx[k]) !== capOf(idx[k + 1]) || capOf(idx[k]) !== capOf(idx[k + 2])) sideTris.push(idx[k], idx[k + 1], idx[k + 2])
    }
    const spot = (i) => `${P[i][0].toFixed(3)},${P[i][1].toFixed(3)},${P[i][2].toFixed(3)}`
    const sideSpots = new Set(sideTris.map(spot))
    const outP = [], outN = [], outT = [], outIdx = []
    const remap = new Map()
    const keep = (i) => {
      if (!remap.has(i)) {
        remap.set(i, outP.length)
        outP.push(P[i]); outN.push(N[i]); outT.push(T[i])
      }
      return remap.get(i)
    }
    for (const i of sideTris) outIdx.push(keep(i))
    for (const side of [1, -1]) {
      const capIdx = [...new Set([...idx].filter((i) => capOf(i) === side))]
      if (capIdx.length < 3) throw new Error(`town.glb Ground: no ${side > 0 ? 'top' : 'bottom'} cap found`)
      const rim = capIdx.filter((i) => sideSpots.has(spot(i)))
      if (rim.length < 3) throw new Error(`town.glb Ground: the ${side > 0 ? 'top' : 'bottom'} cap has no rim on the disc sides`)
      const ccx = rim.reduce((a, i) => a + P[i][0], 0) / rim.length
      const ccz = rim.reduce((a, i) => a + P[i][2], 0) / rim.length
      rim.sort((a, b) => Math.atan2(P[a][2] - ccz, P[a][0] - ccx) - Math.atan2(P[b][2] - ccz, P[b][0] - ccx))
      const y = P[rim[0]][1]
      const uvMap = linearUv(rim.map((i) => [P[i][0], P[i][2], T[i]]))
      const ring = rim.map((i) => keep(i))
      const contour = rim.map((i) => new Vector2(P[i][0], P[i][2]))
      const holeRings = localHoles.map((h) => [[h.minX, h.minZ], [h.minX, h.maxZ], [h.maxX, h.maxZ], [h.maxX, h.minZ]].map(([x, z]) => {
        outP.push([x, y, z]); outN.push([0, side, 0]); outT.push(uvMap(x, z))
        return outP.length - 1
      }))
      const holePts = localHoles.map((h) => [[h.minX, h.minZ], [h.minX, h.maxZ], [h.maxX, h.maxZ], [h.maxX, h.minZ]].map(([x, z]) => new Vector2(x, z)))
      const all = [...ring, ...holeRings.flat()]
      const allPts = [...contour, ...holePts.flat()]
      for (const [a, b, c] of ShapeUtils.triangulateShape(contour, holePts)) {
        const [i, j, k] = [all[a], all[b], all[c]]
        const cross = (allPts[b].x - allPts[a].x) * (allPts[c].y - allPts[a].y) - (allPts[b].y - allPts[a].y) * (allPts[c].x - allPts[a].x)
        const facesUp = cross < 0
        outIdx.push(...(facesUp === (side > 0) ? [i, j, k] : [i, k, j]))
      }
    }
    pos.setArray(new Float32Array(outP.flat()))
    nor.setArray(new Float32Array(outN.flat()))
    uv.setArray(new Float32Array(outT.flat()))
    prim.getIndices().setArray(outP.length > 65535 ? new Uint32Array(outIdx) : new Uint16Array(outIdx))
  }
}

/**
 * Draco quantizes positions on one grid for all three axes, a step of (largest extent) / (2^14 - 1): about 0.11 m
 * for a 930 m disc, so a 0.2 m thick slab gets its top rounded by up to 6 cm, above the 0.02 m lawns. The disc is made
 * exactly one quantization step thick (bottom at local 0, top at local `step`, both on the grid) and the node is
 * lowered so the top lands on GROUND_TOP_Y after compression.
 */
function pinGroundTop(doc) {
  const draco = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_draco_mesh_compression')
  if (!draco) throw new Error('town.glb: expected KHR_draco_mesh_compression')
  draco.setEncoderOptions({ quantizationBits: { POSITION: DRACO_POSITION_BITS } })
  const node = doc.getRoot().listNodes().find((n) => n.getName() === 'Ground')
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const v = [0, 0, 0]
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v)
      minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2])
    }
    const step = Math.max(maxX - minX, maxZ - minZ) / (2 ** DRACO_POSITION_BITS - 1)
    const mid = (minY + maxY) / 2
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v)
      pos.setElement(i, [v[0], v[1] > mid ? step : 0, v[2]])
    }
    const [tx, , tz] = node.getTranslation()
    node.setTranslation([tx, GROUND_TOP_Y - step, tz])
  }
}

function groundTopY(doc) {
  const node = doc.getRoot().listNodes().find((n) => n.getName() === 'Ground')
  const pos = node.getMesh().listPrimitives()[0].getAttribute('POSITION')
  const v = [0, 0, 0]
  let top = -Infinity
  for (let i = 0; i < pos.getCount(); i++) top = Math.max(top, pos.getElement(i, v)[1])
  return top + node.getTranslation()[1]
}

/** Least-squares fit of uv = a x + b z + c over the rim points: the UV a new cap vertex at (x, z) gets. */
function linearUv(samples) {
  const fit = (k) => {
    let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, n = 0, sxu = 0, szu = 0, su = 0
    for (const [x, z, t] of samples) {
      sxx += x * x; sxz += x * z; szz += z * z; sx += x; sz += z; n += 1
      sxu += x * t[k]; szu += z * t[k]; su += t[k]
    }
    const m = [[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, n]]
    const r = [sxu, szu, su]
    const det = (q) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0])
    const d = det(m)
    if (Math.abs(d) <= 1e-12 * Math.abs(sxx * szz * n)) throw new Error('town.glb Ground: cannot fit the cap UVs on its rim')
    return [0, 1, 2].map((c) => det(m.map((row, ri) => row.map((val, ci) => (ci === c ? r[ri] : val)))) / d)
  }
  const [cu, cv] = [fit(0), fit(1)]
  return (x, z) => [cu[0] * x + cu[1] * z + cu[2], cv[0] * x + cv[1] * z + cv[2]]
}
