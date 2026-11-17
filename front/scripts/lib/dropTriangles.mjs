export function dropTriangles(node, shouldDrop) {
  const mesh = node.getMesh()
  if (!mesh) return 0
  const m = node.getWorldMatrix()
  let dropped = 0
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION').getArray()
    const idxAcc = prim.getIndices()
    if (!idxAcc) continue
    const idx = idxAcc.getArray()
    const keep = []
    for (let t = 0; t + 2 < idx.length; t += 3) {
      let cx = 0
      let cy = 0
      let cz = 0
      for (let k = 0; k < 3; k++) {
        const i = idx[t + k] * 3
        const x = pos[i]
        const y = pos[i + 1]
        const z = pos[i + 2]
        cx += m[0] * x + m[4] * y + m[8] * z + m[12]
        cy += m[1] * x + m[5] * y + m[9] * z + m[13]
        cz += m[2] * x + m[6] * y + m[10] * z + m[14]
      }
      if (shouldDrop(cx / 3, cy / 3, cz / 3)) {
        dropped++
        continue
      }
      keep.push(idx[t], idx[t + 1], idx[t + 2])
    }
    if (keep.length !== idx.length) idxAcc.setArray(new idx.constructor(keep))
  }
  return dropped
}
