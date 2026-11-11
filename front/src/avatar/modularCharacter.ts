import * as THREE from 'three'
import { WEAR_BASE_MODEL_URL } from '../game/assets/catalog'
import { createGltfLoader } from '../game/gltfLoaderFactory'
import { bodyUrlFor, DEFAULT_LOOK, pieceUrlFor, type CharacterLook } from './characterLook'
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

/**
 * glTF node extras (region, face, slot, hides). A node with several materials loads as a Group of one SkinnedMesh per
 * material, and the extras land on that Group, not on the meshes: read them from whichever carries them.
 */
function nodeExtras(mesh: THREE.Object3D): Record<string, unknown> {
  const own = mesh.userData
  if ('region' in own || 'slot' in own) return own
  return mesh.parent?.userData ?? {}
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
    mesh.userData = { ...nodeExtras(src), ...src.userData, sharedGeometry: true, sharedMaterials: true }
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

/**
 * Builds a player on the body of `look` (sex x build fit, docs/CHARACTER.md): the body and the tops / bottoms of that
 * fit, and only the chosen face. No look = the reference body with face 1 (store dummies, clerks, players who have not
 * made a character yet).
 */
export async function createModularCharacter(models: WearModels, colors: SlotHexes, defaults: SlotHexes, look: CharacterLook | null = null): Promise<THREE.Group> {
  const pieceUrls = WEAR_SLOTS.flatMap((slot) => (models[slot] ? [pieceUrlFor(slot, models[slot], look)] : []))
  const [base, ...pieces] = await Promise.all([loadTemplate(bodyUrlFor(WEAR_BASE_MODEL_URL, look), true), ...pieceUrls.map((url) => loadTemplate(url, false))])
  const instance = cloneCharacterWithUniqueMaterials(base!)
  const body = skinnedMeshes(instance)
  const parent = body[0]?.parent
  if (!parent) throw new Error('The base body has no skinned mesh')
  const bones = new Map(body[0]!.skeleton.bones.map((b) => [b.name, b]))
  const worn = pieces.flatMap((piece) => attachPiece(piece, parent, bones))
  const hidden = hiddenRegions(worn.map((m) => m.userData.hides as string | undefined))
  const face = (look ?? DEFAULT_LOOK).face
  for (const mesh of body) {
    const extras = nodeExtras(mesh)
    const region = extras.region as string
    mesh.visible = region === 'face' ? extras.face === face : !hidden.has(region)
  }
  for (const mesh of [...body, ...worn]) tint(mesh, colors, defaults)
  attachAvatarAnimations(instance)
  return instance
}
