import { statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { KHRDracoMeshCompression, KHRMaterialsClearcoat, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const WEAR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'public', 'assets', 'wear')
const REGIONS = ['head', 'chest', 'hips', 'upper_arms', 'forearms', 'hands', 'thighs', 'shins', 'feet']
const PIECES = {
  hair: ['basic', 'short', 'long', 'curly', 'buzz', 'ponytail'],
  head_accessory: ['gamer', 'studio', 'cat_ear', 'neon', 'pilot'],
  top: ['basic', 'tee', 'tank', 'hoodie', 'varsity', 'sweater', 'track_jacket', 'jersey', 'sports_bra'],
  bottom: ['basic', 'jeans', 'joggers', 'cargo', 'shorts', 'skirt', 'track_pants', 'basketball_shorts', 'leggings'],
  shoes: ['basic', 'sneakers', 'high_tops', 'boots', 'slides', 'runners'],
}
const REQUIRED_CLIPS = ['Idle', 'Walk', 'Run']
const MAX_PIECE_TRIS = 3_000
const MAX_BASE_TRIS = 8_000

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression, KHRMaterialsClearcoat, KHRMaterialsEmissiveStrength])
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

let failed = false
const fail = (key, msg) => { failed = true; console.error(`✖ ${key}: ${msg}`) }

function triangles(root) {
  let tris = 0
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices()
      tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3
    }
  }
  return Math.round(tris)
}

function meshNodes(root) {
  return root.listNodes().filter((n) => n.getMesh() && n.getSkin())
}

const base = (await io.read(join(WEAR, 'base', 'model.glb'))).getRoot()
const baseBones = new Set(base.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName())))
const clips = base.listAnimations().map((a) => a.getName())
for (const clip of REQUIRED_CLIPS) if (!clips.includes(clip)) fail('base', `missing clip "${clip}"`)
const regions = meshNodes(base).map((n) => n.getExtras().region)
for (const region of REGIONS) if (!regions.includes(region)) fail('base', `no skinned mesh tagged region "${region}"`)
if (triangles(base) > MAX_BASE_TRIS) fail('base', `${triangles(base)} triangles (budget ${MAX_BASE_TRIS})`)
let minY = Infinity
for (const mesh of base.listMeshes()) for (const prim of mesh.listPrimitives()) minY = Math.min(minY, prim.getAttribute('POSITION').getMin([])[1])
if (Math.abs(minY) > 0.05) fail('base', `feet are not at y = 0 (min y ${minY.toFixed(3)})`)
console.log(`✔ base: ${triangles(base)} tris, ${baseBones.size} bones, clips ${clips.join('/')}`)

for (const [slot, keys] of Object.entries(PIECES)) {
  for (const key of keys) {
    const id = `${slot}/${key}`
    try {
      statSync(join(WEAR, slot, key, 'preview.png'))
      const root = (await io.read(join(WEAR, slot, key, 'model.glb'))).getRoot()
      const nodes = meshNodes(root)
      if (nodes.length !== 1) fail(id, `expected one skinned mesh, found ${nodes.length}`)
      const extras = nodes[0]?.getExtras() ?? {}
      if (extras.slot !== slot) fail(id, `extras.slot is "${extras.slot}"`)
      for (const hidden of String(extras.hides ?? '').split(',').filter(Boolean)) if (!REGIONS.includes(hidden)) fail(id, `hides unknown region "${hidden}"`)
      for (const joint of root.listSkins().flatMap((s) => s.listJoints())) if (!baseBones.has(joint.getName())) fail(id, `bone "${joint.getName()}" is not in the base rig`)
      if (root.listAnimations().length > 0) fail(id, 'pieces must not carry animations (they follow the base skeleton)')
      const tris = triangles(root)
      if (tris > MAX_PIECE_TRIS) fail(id, `${tris} triangles (budget ${MAX_PIECE_TRIS})`)
      console.log(`✔ ${id}: ${tris} tris, hides ${extras.hides || 'nothing'}`)
    } catch (error) {
      fail(id, error instanceof Error ? error.message : String(error))
    }
  }
}
process.exit(failed ? 1 : 0)
