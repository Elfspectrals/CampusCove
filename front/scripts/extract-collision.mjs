// Collision sidecar from a Blender collision source (*.colsrc.glb, see scripts/optimize-assets.mjs).
//
//   node scripts/extract-collision.mjs path/to/interior.colsrc.glb
//   → path/to/interior.colsrc.collision.json
//
// Every authored collision mesh (named COL_ / UCX_ / Collision*) becomes a world-space cuboid in the
// player's walking band. Clusters of seats / small props whose tabletop has no collision box get a
// synthetic platform so the player cannot walk through the furniture.
import { writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const WALK_BAND_MIN_Y = 0.25
const WALK_BAND_MAX_Y = 2.0
const MIN_HALF = 0.01
/** Authored collision meshes (Blender/UE). Looser size filters. */
const AUTH_NAME_RE = /(?:^|_|:|\s)(col_|ucx_|collision)/i
const THIN_WALL_HALF = 0.35
const MAX_THIN_WALL_LENGTH = 20
const MAX_AUTH_HALF = 40
const MAX_PLATFORM_HALF = 2.0
/** Horizontal span above this → treat as map (add border walls). */
const MAP_SPAN_THRESHOLD = 8
/** Seat / prop clustering for missing tabletops & counters. */
const CLUSTER_LINK_DIST = 1.8
const PROP_LINK_DIST = 1.1
const PLATFORM_PAD = 0.2
const PLATFORM_CY = 0.85
const PLATFORM_HY = 0.45
/** Tiny tabletop props with broken mega-bounds (UE merged meshes). */
const inputArg = process.argv[2]
if (!inputArg) {
  console.error('Usage: node scripts/extract-collision.mjs <path/to/model.glb>')
  process.exit(1)
}

const inputPath = resolve(process.cwd(), inputArg)
if (!existsSync(inputPath)) {
  console.error(`Not found: ${inputPath}`)
  process.exit(1)
}

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

function mat4Multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3]
    }
  }
  return out
}

function mat4FromTRS(t, q, s) {
  const [x, y, z, w] = q
  const [sx, sy, sz] = s
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2
  return [
    (1 - (yy + zz)) * sx,
    (xy + wz) * sx,
    (xz - wy) * sx,
    0,
    (xy - wz) * sy,
    (1 - (xx + zz)) * sy,
    (yz + wx) * sy,
    0,
    (xz + wy) * sz,
    (yz - wx) * sz,
    (1 - (xx + yy)) * sz,
    0,
    t[0],
    t[1],
    t[2],
    1,
  ]
}

function mat4Decompose(m) {
  const sx = Math.hypot(m[0], m[1], m[2]) || 1
  const sy = Math.hypot(m[4], m[5], m[6]) || 1
  const sz = Math.hypot(m[8], m[9], m[10]) || 1
  const t = [m[12], m[13], m[14]]
  const r00 = m[0] / sx
  const r01 = m[1] / sx
  const r02 = m[2] / sx
  const r10 = m[4] / sy
  const r11 = m[5] / sy
  const r12 = m[6] / sy
  const r20 = m[8] / sz
  const r21 = m[9] / sz
  const r22 = m[10] / sz
  const trace = r00 + r11 + r22
  let qx
  let qy
  let qz
  let qw
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    qw = 0.25 * s
    qx = (r12 - r21) / s
    qy = (r20 - r02) / s
    qz = (r01 - r10) / s
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2
    qw = (r12 - r21) / s
    qx = 0.25 * s
    qy = (r01 + r10) / s
    qz = (r20 + r02) / s
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2
    qw = (r20 - r02) / s
    qx = (r01 + r10) / s
    qy = 0.25 * s
    qz = (r12 + r21) / s
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2
    qw = (r01 - r10) / s
    qx = (r20 + r02) / s
    qy = (r12 + r21) / s
    qz = 0.25 * s
  }
  return { t, q: [qx, qy, qz, qw], s: [sx, sy, sz] }
}

function nodeLocalMatrix(node) {
  const t = node.getTranslation() ?? [0, 0, 0]
  const r = node.getRotation() ?? [0, 0, 0, 1]
  const s = node.getScale() ?? [1, 1, 1]
  return mat4FromTRS(t, r, s)
}

function buildParentMap(doc) {
  const parent = new Map()
  for (const node of doc.getRoot().listNodes()) {
    for (const child of node.listChildren()) {
      parent.set(child, node)
    }
  }
  return parent
}

function worldMatrixFor(node, parentMap) {
  const chain = []
  let cur = node
  while (cur) {
    chain.unshift(cur)
    cur = parentMap.get(cur)
  }
  let m = mat4Identity()
  for (const n of chain) {
    m = mat4Multiply(m, nodeLocalMatrix(n))
  }
  return m
}

/** Full local AABB from all mesh vertices (not Y-clipped). */
function aabbFromPositions(positions) {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let found = false
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
    found = true
  }
  if (!found) return null
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    half: [
      Math.max((maxX - minX) / 2, MIN_HALF),
      Math.max((maxY - minY) / 2, MIN_HALF),
      Math.max((maxZ - minZ) / 2, MIN_HALF),
    ],
  }
}

function isAuthoredName(name) {
  return !!name && AUTH_NAME_RE.test(name)
}

function round4(n) {
  return Math.round(n * 10000) / 10000
}

function horizSpan(c) {
  return Math.max(c.hx, c.hz)
}

function coversPoint(c, x, z, margin = 0) {
  return Math.abs(x - c.cx) <= c.hx + margin && Math.abs(z - c.cz) <= c.hz + margin
}

function isThinWallCuboid(c) {
  const horizMax = Math.max(c.hx, c.hz)
  const horizMin = Math.min(c.hx, c.hz)
  // Must be long-and-thin (wall), not a small square prop
  return horizMin <= THIN_WALL_HALF && horizMax >= 0.8 && horizMax <= MAX_THIN_WALL_LENGTH
}

function areaCoveredBySolid(cuboids, minX, maxX, minZ, maxZ) {
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const needHx = (maxX - minX) / 2
  const needHz = (maxZ - minZ) / 2
  return cuboids.some((c) => {
    if (/^Synth_/i.test(c.name || '')) return false
    if (c.hy < 0.3) return false
    if (horizSpan(c) < 0.55) return false
    return (
      coversPoint(c, cx, cz) &&
      c.hx >= needHx * 0.55 &&
      c.hz >= needHz * 0.55
    )
  })
}

function pushCuboid(cuboids, name, worldMat, localCenter, localHalf) {
  const { t, q, s } = mat4Decompose(worldMat)
  let hx = Math.max(Math.abs(localHalf[0] * s[0]), MIN_HALF)
  let hy = Math.max(Math.abs(localHalf[1] * s[1]), MIN_HALF)
  let hz = Math.max(Math.abs(localHalf[2] * s[2]), MIN_HALF)
  const offset = [localCenter[0] * s[0], localCenter[1] * s[1], localCenter[2] * s[2]]
  const [qx, qy, qz, qw] = q
  const ix = qw * offset[0] + qy * offset[2] - qz * offset[1]
  const iy = qw * offset[1] + qz * offset[0] - qx * offset[2]
  const iz = qw * offset[2] + qx * offset[1] - qy * offset[0]
  const iw = -qx * offset[0] - qy * offset[1] - qz * offset[2]
  const ox = ix * qw + iw * -qx + iy * -qz - iz * -qy
  const oy = iy * qw + iw * -qy + iz * -qx - ix * -qz
  const oz = iz * qw + iw * -qz + ix * -qy - iy * -qx
  const cx = t[0] + ox
  let cy = t[1] + oy
  const cz = t[2] + oz
  let top = cy + hy
  let bottom = cy - hy
  if (top < WALK_BAND_MIN_Y || bottom > WALK_BAND_MAX_Y) return false

  // Clamp absurd vertical extents so KCC stays stable
  if (hy > 4) {
    const mid = Math.min(Math.max(cy, 0.9), 1.2)
    hy = Math.min(hy, 2.2)
    cy = mid
    top = cy + hy
    bottom = cy - hy
  }

  const horizMax = Math.max(hx, hz)
  const horizMin = Math.min(hx, hz)
  const isThinWall = horizMin <= THIN_WALL_HALF && horizMax >= 0.8 && horizMax <= MAX_THIN_WALL_LENGTH
  const isReasonableProp = horizMax <= MAX_AUTH_HALF
  if (!isThinWall && !isReasonableProp) return false
  if (hx > 80 || hz > 80) return false

  cuboids.push({
    name: name || 'mesh',
    cx: round4(cx),
    cy: round4(cy),
    cz: round4(cz),
    hx: round4(hx),
    hy: round4(hy),
    hz: round4(hz),
    qx: round4(qx),
    qy: round4(qy),
    qz: round4(qz),
    qw: round4(qw),
  })
  return true
}

function meshAabb(mesh) {
  let best = null
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    if (!pos) continue
    const arr = pos.getArray()
    if (!arr) continue
    const box = aabbFromPositions(arr)
    if (!box) continue
    if (!best) {
      best = box
      continue
    }
    const min = [
      Math.min(best.center[0] - best.half[0], box.center[0] - box.half[0]),
      Math.min(best.center[1] - best.half[1], box.center[1] - box.half[1]),
      Math.min(best.center[2] - best.half[2], box.center[2] - box.half[2]),
    ]
    const max = [
      Math.max(best.center[0] + best.half[0], box.center[0] + box.half[0]),
      Math.max(best.center[1] + best.half[1], box.center[1] + box.half[1]),
      Math.max(best.center[2] + best.half[2], box.center[2] + box.half[2]),
    ]
    best = {
      center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      half: [
        Math.max((max[0] - min[0]) / 2, MIN_HALF),
        Math.max((max[1] - min[1]) / 2, MIN_HALF),
        Math.max((max[2] - min[2]) / 2, MIN_HALF),
      ],
    }
  }
  return best
}

function isSeatNamed(c) {
  if (/^Synth_/i.test(c.name || '')) return false
  return /chair|sofa|stool|bench|couch/i.test(c.name || '')
}

function isSurfaceMarker(c) {
  if (/^Synth_/i.test(c.name || '')) return false
  if (isSeatNamed(c)) return false
  if (isThinWallCuboid(c)) return false
  const hm = horizSpan(c)
  return hm > 0.03 && hm < 0.55
}

function clusterIndices(items, linkDist) {
  const n = items.length
  const parent = Array.from({ length: n }, (_, i) => i)
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  function unite(a, b) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = items[i]
      const b = items[j]
      const dx = Math.abs(a.cx - b.cx) - a.hx - b.hx
      const dz = Math.abs(a.cz - b.cz) - a.hz - b.hz
      const gap = Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
      if (gap <= linkDist) unite(i, j)
    }
  }
  const groups = new Map()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(items[i])
  }
  return [...groups.values()]
}

function pushPlatform(cuboids, members, name) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of members) {
    minX = Math.min(minX, p.cx - p.hx)
    maxX = Math.max(maxX, p.cx + p.hx)
    minZ = Math.min(minZ, p.cz - p.hz)
    maxZ = Math.max(maxZ, p.cz + p.hz)
  }
  const shrink = members.every(isSeatNamed) ? 0.12 : 0
  const w = Math.max(maxX - minX, 0.01)
  const d = Math.max(maxZ - minZ, 0.01)
  minX = minX + w * shrink - PLATFORM_PAD
  maxX = maxX - w * shrink + PLATFORM_PAD
  minZ = minZ + d * shrink - PLATFORM_PAD
  maxZ = maxZ - d * shrink + PLATFORM_PAD
  if (maxX - minX < 0.8) {
    const mid = (minX + maxX) / 2
    minX = mid - 0.4
    maxX = mid + 0.4
  }
  if (maxZ - minZ < 0.8) {
    const mid = (minZ + maxZ) / 2
    minZ = mid - 0.4
    maxZ = mid + 0.4
  }
  let hx = (maxX - minX) / 2
  let hz = (maxZ - minZ) / 2
  if (hx > MAX_PLATFORM_HALF || hz > MAX_PLATFORM_HALF) {
    hx = Math.min(hx, MAX_PLATFORM_HALF)
    hz = Math.min(hz, MAX_PLATFORM_HALF)
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    minX = cx - hx
    maxX = cx + hx
    minZ = cz - hz
    maxZ = cz + hz
  }
  if (areaCoveredBySolid(cuboids, minX, maxX, minZ, maxZ)) return false
  cuboids.push({
    name,
    cx: round4((minX + maxX) / 2),
    cy: PLATFORM_CY,
    cz: round4((minZ + maxZ) / 2),
    hx: round4(hx),
    hy: PLATFORM_HY,
    hz: round4(hz),
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
  })
  return true
}

/**
 * When tabletops / counters are missing from the GLB, build solid platforms from
 * seat clusters and dense prop clusters. Generic — not per-asset hacks.
 */
function synthesizeFurniturePlatforms(cuboids) {
  let added = 0
  const seats = cuboids.filter(isSeatNamed)
  for (const group of clusterIndices(seats, CLUSTER_LINK_DIST)) {
    if (group.length < 2) continue
    if (pushPlatform(cuboids, group, `Synth_SeatCluster_${added}`)) added++
  }

  const props = cuboids.filter(isSurfaceMarker)
  for (const group of clusterIndices(props, PROP_LINK_DIST)) {
    if (group.length < 3) continue
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of group) {
      minX = Math.min(minX, p.cx - p.hx)
      maxX = Math.max(maxX, p.cx + p.hx)
      minZ = Math.min(minZ, p.cz - p.hz)
      maxZ = Math.max(maxZ, p.cz + p.hz)
    }
    const span = Math.hypot(maxX - minX, maxZ - minZ)
    if (span < 0.7) continue
    if (pushPlatform(cuboids, group, `Synth_PropCluster_${added}`)) added++
  }
  return added
}

const decoderModule = await draco3d.createDecoderModule()
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': decoderModule })

const doc = await io.read(inputPath)
const parentMap = buildParentMap(doc)
const cuboids = []
let skipped = 0

for (const node of doc.getRoot().listNodes()) {
  const name = node.getName() || ''
  const mesh = node.getMesh()
  if (!mesh) continue
  const meshName = mesh.getName() || ''
  const footprint = isAuthoredName(name) || isAuthoredName(meshName) ? meshAabb(mesh) : null
  if (!footprint) {
    skipped++
    continue
  }

  const label = name || meshName || 'collision'
  const worldBase = worldMatrixFor(node, parentMap)
  const before = cuboids.length
  const instancing = node.getExtension('EXT_mesh_gpu_instancing')
  if (instancing) {
    const attr = instancing.getAttribute('TRANSLATION')
    const rotAttr = instancing.getAttribute('ROTATION')
    const scaleAttr = instancing.getAttribute('SCALE')
    const count = attr ? attr.getCount() : 0
    for (let i = 0; i < count; i++) {
      const t = attr ? attr.getElement(i, []) : [0, 0, 0]
      const r = rotAttr ? rotAttr.getElement(i, []) : [0, 0, 0, 1]
      const sc = scaleAttr ? scaleAttr.getElement(i, []) : [1, 1, 1]
      const world = mat4Multiply(worldBase, mat4FromTRS(t, r, sc))
      pushCuboid(cuboids, label, world, footprint.center, footprint.half)
    }
  } else {
    pushCuboid(cuboids, label, worldBase, footprint.center, footprint.half)
  }
  if (cuboids.length === before) skipped++
}

const authoredCount = cuboids.length
const synthAdded = synthesizeFurniturePlatforms(cuboids)

let minX = Infinity
let minZ = Infinity
let maxX = -Infinity
let maxZ = -Infinity
for (const c of cuboids) {
  minX = Math.min(minX, c.cx - c.hx)
  maxX = Math.max(maxX, c.cx + c.hx)
  minZ = Math.min(minZ, c.cz - c.hz)
  maxZ = Math.max(maxZ, c.cz + c.hz)
}
const spanX = Number.isFinite(minX) ? maxX - minX : 0
const spanZ = Number.isFinite(minZ) ? maxZ - minZ : 0
const borders = spanX >= MAP_SPAN_THRESHOLD || spanZ >= MAP_SPAN_THRESHOLD

const out = {
  version: 3,
  source: basename(inputPath),
  mode: authoredCount > 0 ? 'hybrid' : 'auto',
  borders,
  bounds: borders
    ? { minX: round4(minX), maxX: round4(maxX), minZ: round4(minZ), maxZ: round4(maxZ) }
    : null,
  cuboids,
  trimeshes: [],
}

const outPath = join(dirname(inputPath), `${basename(inputPath, extname(inputPath))}.collision.json`)
writeFileSync(outPath, JSON.stringify(out))
console.log(
  `collision: ${cuboids.length} cuboids (authored=${authoredCount}, synth=${synthAdded}), skipped=${skipped}, borders=${borders} → ${outPath}`,
)
