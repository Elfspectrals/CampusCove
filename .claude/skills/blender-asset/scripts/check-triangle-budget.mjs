import { readFileSync } from 'node:fs'

const BUDGETS = {
  furniture: 600,
  'house-exterior': 1100,
  'house-interior': 5200,
  'work-interior': 12000,
  'work-exterior': 2500,
  skin: 30000,
}

const [, , glbPath, kind] = process.argv
if (!glbPath || !(kind in BUDGETS)) {
  console.error(`Usage: node check-triangle-budget.mjs <file.glb> <${Object.keys(BUDGETS).join('|')}>`)
  process.exit(2)
}

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const buffer = readFileSync(glbPath)
if (buffer.readUInt32LE(0) !== GLB_MAGIC) {
  console.error(`${glbPath} is not a GLB file`)
  process.exit(2)
}

const jsonLength = buffer.readUInt32LE(12)
if (buffer.readUInt32LE(16) !== JSON_CHUNK) {
  console.error(`${glbPath}: first chunk is not JSON`)
  process.exit(2)
}
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))

const TRIANGLES_MODE = 4
let triangles = 0
for (const mesh of gltf.meshes ?? []) {
  for (const primitive of mesh.primitives) {
    const mode = primitive.mode ?? TRIANGLES_MODE
    if (mode !== TRIANGLES_MODE) continue
    const count = primitive.indices !== undefined
      ? gltf.accessors[primitive.indices].count
      : gltf.accessors[primitive.attributes.POSITION].count
    triangles += count / 3
  }
}

const budget = BUDGETS[kind]
console.log(`${glbPath}: ${triangles} triangles, budget ${budget} (${kind})`)
if (triangles > budget) {
  console.error(`FAIL: ${triangles - budget} triangles over budget`)
  process.exit(1)
}
console.log('OK')
