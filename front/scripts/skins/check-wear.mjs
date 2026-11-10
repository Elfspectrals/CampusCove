import { statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP, KHRDracoMeshCompression, KHRMaterialsClearcoat, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const WEAR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'public', 'assets', 'wear')
const REGIONS = ['head', 'chest', 'hips', 'upper_arms', 'forearms', 'hands', 'thighs', 'shins', 'feet']
const PIECES = {
  hair: ['basic', 'short', 'long', 'curly', 'buzz', 'ponytail'],
  head_accessory: ['gamer', 'studio', 'cat_ear', 'neon', 'pilot', 'straw_hat'],
  top: ['basic', 'tee', 'tank', 'hoodie', 'varsity', 'sweater', 'track_jacket', 'jersey', 'sports_bra', 'plaid_shirt', 'farm_apron', 'newcomer'],
  bottom: ['basic', 'jeans', 'joggers', 'cargo', 'shorts', 'skirt', 'track_pants', 'basketball_shorts', 'leggings', 'dungarees', 'newcomer'],
  shoes: ['basic', 'sneakers', 'high_tops', 'boots', 'slides', 'runners', 'newcomer'],
}
/** Body fits (front/scripts/skins/fit.py): m_normal is model.glb, the others model_<fit>.glb, for the base and these slots. */
const FITS = ['m_slim', 'm_normal', 'm_broad', 'f_slim', 'f_normal', 'f_broad']
const FITTED_SLOTS = ['top', 'bottom']
const FACE_COUNT = 6
const REQUIRED_CLIPS = ['Idle', 'Walk', 'Run']
const MAX_PIECE_TRIS = 3_000
/** Body plus the one face shown at a time. */
const MAX_BASE_TRIS = 8_000

const io = new NodeIO()
  .registerExtensions([EXTTextureWebP, KHRDracoMeshCompression, KHRMaterialsClearcoat, KHRMaterialsEmissiveStrength])
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

let failed = false
const fail = (key, msg) => { failed = true; console.error(`✖ ${key}: ${msg}`) }
const fileOf = (fit) => (fit === 'm_normal' ? 'model.glb' : `model_${fit}.glb`)

function meshTriangles(mesh) {
  let tris = 0
  for (const prim of mesh.listPrimitives()) {
    const idx = prim.getIndices()
    tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3
  }
  return Math.round(tris)
}

const triangles = (root) => root.listMeshes().reduce((sum, mesh) => sum + meshTriangles(mesh), 0)

function meshNodes(root) {
  return root.listNodes().filter((n) => n.getMesh() && n.getSkin())
}

/** Bone names in skin order + their inverse bind matrices: two files with the same signature share one rig and rest pose. */
function rigSignature(root) {
  const skin = root.listSkins()[0]
  if (!skin) return null
  const names = skin.listJoints().map((j) => j.getName())
  const ibm = skin.getInverseBindMatrices()
  const mats = ibm ? Array.from(ibm.getArray(), (v) => v.toFixed(4)) : []
  return JSON.stringify([names, mats])
}

let referenceRig = null
let baseBones = null
for (const fit of FITS) {
  const id = `base/${fileOf(fit)}`
  const root = (await io.read(join(WEAR, 'base', fileOf(fit)))).getRoot()
  const rig = rigSignature(root)
  if (fit === 'm_normal') {
    referenceRig = rig
    baseBones = new Set(root.listSkins().flatMap((s) => s.listJoints().map((j) => j.getName())))
  }
  const clips = root.listAnimations().map((a) => a.getName())
  for (const clip of REQUIRED_CLIPS) if (!clips.includes(clip)) fail(id, `missing clip "${clip}"`)
  const nodes = meshNodes(root)
  const regions = nodes.map((n) => n.getExtras().region)
  for (const region of REGIONS) if (!regions.includes(region)) fail(id, `no skinned mesh tagged region "${region}"`)
  const faces = nodes.filter((n) => n.getExtras().region === 'face')
  const faceIds = faces.map((n) => Number(n.getExtras().face)).sort((a, b) => a - b)
  if (faceIds.join() !== Array.from({ length: FACE_COUNT }, (_, i) => i + 1).join()) fail(id, `faces ${faceIds.join(',')}, expected 1..${FACE_COUNT}`)
  const faceTris = faces.map((n) => meshTriangles(n.getMesh()))
  const shown = triangles(root) - faceTris.reduce((a, b) => a + b, 0) + Math.max(0, ...faceTris)
  if (shown > MAX_BASE_TRIS) fail(id, `${shown} triangles with one face (budget ${MAX_BASE_TRIS})`)
  let minY = Infinity
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) minY = Math.min(minY, prim.getAttribute('POSITION').getMin([])[1])
  if (Math.abs(minY) > 0.05) fail(id, `feet are not at y = 0 (min y ${minY.toFixed(3)})`)
  console.log(`✔ ${id}: ${shown} tris with one face, clips ${clips.join('/')}`)
}

for (const fit of FITS) {
  const root = (await io.read(join(WEAR, 'base', fileOf(fit)))).getRoot()
  if (rigSignature(root) !== referenceRig) fail(`base/${fileOf(fit)}`, 'rig differs from base/model.glb (same bones, order and rest pose required, so clips play the same)')
}

for (const [slot, keys] of Object.entries(PIECES)) {
  for (const key of keys) {
    const fits = FITTED_SLOTS.includes(slot) ? FITS : ['m_normal']
    for (const fit of fits) {
      const id = `${slot}/${key}/${fileOf(fit)}`
      try {
        statSync(join(WEAR, slot, key, 'preview.png'))
        // the game loads the first-person arms of whatever top is worn (catalog.ts wearTopFpArmsUrl)
        if (slot === 'top') statSync(join(WEAR, slot, key, 'fp_arms.glb'))
        const root = (await io.read(join(WEAR, slot, key, fileOf(fit)))).getRoot()
        const nodes = meshNodes(root)
        if (nodes.length !== 1) fail(id, `expected one skinned mesh, found ${nodes.length}`)
        const extras = nodes[0]?.getExtras() ?? {}
        if (extras.slot !== slot) fail(id, `extras.slot is "${extras.slot}"`)
        for (const hidden of String(extras.hides ?? '').split(',').filter(Boolean)) if (!REGIONS.includes(hidden)) fail(id, `hides unknown region "${hidden}"`)
        for (const joint of root.listSkins().flatMap((s) => s.listJoints())) if (!baseBones.has(joint.getName())) fail(id, `bone "${joint.getName()}" is not in the base rig`)
        if (root.listAnimations().length > 0) fail(id, 'pieces must not carry animations (they follow the base skeleton)')
        const tris = triangles(root)
        if (tris > MAX_PIECE_TRIS) fail(id, `${tris} triangles (budget ${MAX_PIECE_TRIS})`)
        if (fit === 'm_normal') console.log(`✔ ${slot}/${key}: ${tris} tris, hides ${extras.hides || 'nothing'}${fits.length > 1 ? `, ${fits.length} fits` : ''}`)
      } catch (error) {
        fail(id, error instanceof Error ? error.message : String(error))
      }
    }
  }
}
process.exit(failed ? 1 : 0)
