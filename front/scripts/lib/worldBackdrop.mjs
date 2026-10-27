// Fits the town backdrop to the world bounds: re-centres and resizes the skyline ring (Sky_Ring) and the ground disc
// (Ground) of town.glb so the whole walkable world stays inside them. Idempotent: each run rescales from the current
// mesh extents. Used by apply-store.mjs and apply-world-bounds.mjs.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'

const SKY_MARGIN = 10
const GROUND_OVERLAP = 5

/**
 * @param {string} townGlb path to public/assets/town/town.glb (rewritten in place)
 * @param {{ minX: number, maxX: number, minZ: number, maxZ: number }} bounds world bounds
 * @returns {Promise<{ skyRadius: number, groundRadius: number, cx: number, cz: number }>}
 */
export async function fitTownBackdrop(townGlb, bounds) {
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
  reshapeDisc('Ground', skyRadius + GROUND_OVERLAP)
  await io.write(townGlb, doc)
  return { skyRadius, groundRadius: skyRadius + GROUND_OVERLAP, cx: worldCx, cz: worldCz }
}
