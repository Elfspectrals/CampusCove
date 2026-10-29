import * as THREE from 'three'
import { WEAR_BASE_MODEL_URL } from '../game/assets/catalog'
import { createGltfLoader } from '../game/gltfLoaderFactory'
import { attachAvatarAnimations, cloneCharacterWithUniqueMaterials, normalizeCharacterScale, setCharacterClips } from './glbCharacter'
import { hiddenRegions, tintHexFor, WEAR_SLOTS, type SlotHexes, type WearModels } from './modularCharacterLogic'

const templates = new Map<string, Promise<THREE.Group>>()

function loadTemplate(url: string, isBase: boolean): Promise<THREE.Group> {
  const cached = templates.get(url)
  if (cached) return cached
  const task = createGltfLoader()
    .loadAsync(url)
    .then((gltf) => {
      const root = gltf.scene as THREE.Group
      if (isBase) {
        setCharacterClips(root, gltf.animations)
        normalizeCharacterScale(root)
      }
      return root
    })
  task.catch(() => templates.delete(url))
  templates.set(url, task)
  return task
}

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = []
  root.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) out.push(obj as THREE.SkinnedMesh)
  })
  return out
}

function attachPiece(template: THREE.Group, parent: THREE.Object3D, bones: Map<string, THREE.Bone>): THREE.SkinnedMesh[] {
  return skinnedMeshes(template).map((src) => {
    const rebound = src.skeleton.bones.map((b) => {
      const bone = bones.get(b.name)
      if (!bone) throw new Error(`Wear piece bone ${b.name} is not in the base rig`)
      return bone
    })
    const mesh = new THREE.SkinnedMesh(src.geometry, src.material)
    mesh.name = src.name
    mesh.userData = { ...src.userData, sharedGeometry: true, sharedMaterials: true }
    mesh.frustumCulled = false
    mesh.castShadow = true
    parent.add(mesh)
    mesh.bind(new THREE.Skeleton(rebound, src.skeleton.boneInverses), src.bindMatrix)
    return mesh
  })
}

function tint(mesh: THREE.Mesh, colors: SlotHexes, defaults: SlotHexes): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  if (!materials.some((m) => tintHexFor(m.name, colors, defaults))) return
  const own = materials.map((m) => {
    const copy = m.clone()
    const hex = tintHexFor(m.name, colors, defaults)
    if (hex && copy instanceof THREE.MeshStandardMaterial) copy.color.set(hex)
    return copy
  })
  mesh.material = Array.isArray(mesh.material) ? own : own[0]!
  mesh.userData.sharedMaterials = false
}

export async function createModularCharacter(models: WearModels, colors: SlotHexes, defaults: SlotHexes): Promise<THREE.Group> {
  const pieceUrls = WEAR_SLOTS.map((slot) => models[slot]).filter((url): url is string => url !== null)
  const [base, ...pieces] = await Promise.all([loadTemplate(WEAR_BASE_MODEL_URL, true), ...pieceUrls.map((url) => loadTemplate(url, false))])
  const instance = cloneCharacterWithUniqueMaterials(base!)
  const body = skinnedMeshes(instance)
  const parent = body[0]?.parent
  if (!parent) throw new Error('The base body has no skinned mesh')
  const bones = new Map(body[0]!.skeleton.bones.map((b) => [b.name, b]))
  const worn = pieces.flatMap((piece) => attachPiece(piece, parent, bones))
  const hidden = hiddenRegions(worn.map((m) => m.userData.hides as string | undefined))
  for (const mesh of body) mesh.visible = !hidden.has(mesh.userData.region as string)
  for (const mesh of [...body, ...worn]) tint(mesh, colors, defaults)
  attachAvatarAnimations(instance)
  return instance
}
