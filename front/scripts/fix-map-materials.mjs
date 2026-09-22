// Repairs materials that Unreal's glTF exporter failed to bake (flat magenta,
// no texture) by borrowing the full material definition from a sibling of the
// same family (e.g. MI_Trees_SM_Tree_4 -> another MI_Trees_SM_Tree_* that has
// a baseColorTexture). Falls back to a flat foliage green.
// Input:  map-src/LobbyMap/LobbyMap.gltf
// Output: map-src/LobbyMap/LobbyMap.fixed.gltf (same folder, external URIs keep working)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const mapDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'map-src', 'LobbyMap')
const inputPath = join(mapDir, 'LobbyMap.gltf')
const outputPath = join(mapDir, 'LobbyMap.fixed.gltf')

const gltf = JSON.parse(readFileSync(inputPath, 'utf8'))
const materials = gltf.materials ?? []

const FALLBACK_GREEN = [0.18, 0.35, 0.16, 1]

function isBrokenMagenta(mat) {
  const pbr = mat.pbrMetallicRoughness
  if (!pbr || pbr.baseColorTexture) return false
  const f = pbr.baseColorFactor
  return !!f && f[0] > 0.8 && f[1] < 0.3 && f[2] > 0.8
}

function familyPrefix(name) {
  // Strip a trailing instance number: "MI_Leaf_Thuja_SM_Thuja_96" -> "MI_Leaf_Thuja_SM_Thuja_"
  return name.replace(/\d+$/, '')
}

let fixed = 0
let fallback = 0
for (const mat of materials) {
  if (!isBrokenMagenta(mat)) continue
  const prefix = familyPrefix(mat.name ?? '')
  const donor =
    prefix.length > 3
      ? materials.find(
          (m) =>
            m !== mat &&
            m.name?.startsWith(prefix) &&
            m.pbrMetallicRoughness?.baseColorTexture,
        )
      : undefined
  if (donor) {
    const { name } = mat
    for (const key of Object.keys(mat)) delete mat[key]
    Object.assign(mat, structuredClone(donor), { name })
    console.log(`fixed  ${name}  <-  ${donor.name}`)
    fixed++
  } else {
    mat.pbrMetallicRoughness.baseColorFactor = FALLBACK_GREEN
    console.log(`fallback green  ${mat.name}`)
    fallback++
  }
}

writeFileSync(outputPath, JSON.stringify(gltf))
console.log(`done: ${fixed} borrowed from siblings, ${fallback} fallback green -> ${outputPath}`)
