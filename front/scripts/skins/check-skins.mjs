// Sanity check of the premium skin GLBs committed in public/assets/skins (run: npm run skins:check).
// Fails when a model is missing, too heavy, not rigged, or lacks the Idle / Walk / Run clips the game plays.
import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { KHRDracoMeshCompression, KHRMaterialsClearcoat, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const FRONT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SKINS = ['neon_ronin', 'street_luxe', 'astral_oracle']
const REQUIRED_CLIPS = ['Idle', 'Walk', 'Run']
const MAX_BYTES = 5 * 1024 * 1024
const MAX_TRIS = 30_000
const MIN_HEIGHT = 1.7
const MAX_HEIGHT = 2.1

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression, KHRMaterialsClearcoat, KHRMaterialsEmissiveStrength])
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })

let failed = false
const fail = (key, msg) => { failed = true; console.error(`✖ ${key}: ${msg}`) }

for (const key of SKINS) {
  const dir = join(FRONT, 'public', 'assets', 'skins', key)
  const glb = join(dir, 'model.glb')
  try {
    const bytes = statSync(glb).size
    if (bytes > MAX_BYTES) fail(key, `model.glb is ${(bytes / 1048576).toFixed(1)} MB (max 5 MB)`)
    statSync(join(dir, 'preview.png'))
    readFileSync(glb)
    const root = (await io.read(glb)).getRoot()
    const names = root.listAnimations().map((a) => a.getName())
    for (const clip of REQUIRED_CLIPS) if (!names.includes(clip)) fail(key, `missing clip "${clip}" (has: ${names.join(', ') || 'none'})`)
    if (root.listSkins().length === 0) fail(key, 'no skin / skeleton (model is not rigged)')
    let tris = 0
    let minY = Infinity
    let maxY = -Infinity
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices()
        tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3
        const pos = prim.getAttribute('POSITION')
        minY = Math.min(minY, pos.getMin([])[1])
        maxY = Math.max(maxY, pos.getMax([])[1])
      }
    }
    if (tris > MAX_TRIS) fail(key, `${Math.round(tris)} triangles (budget ${MAX_TRIS})`)
    const h = maxY - minY
    if (h < MIN_HEIGHT || h > MAX_HEIGHT) fail(key, `height ${h.toFixed(2)} m outside ${MIN_HEIGHT}-${MAX_HEIGHT} m (skins are scaled to a shared height)`)
    if (Math.abs(minY) > 0.05) fail(key, `feet are not at y = 0 (min y ${minY.toFixed(3)})`)
    console.log(`✔ ${key}: ${Math.round(tris)} tris, ${h.toFixed(2)} m, clips ${names.join('/')}`)
  } catch (error) {
    fail(key, error instanceof Error ? error.message : String(error))
  }
}
process.exit(failed ? 1 : 0)
