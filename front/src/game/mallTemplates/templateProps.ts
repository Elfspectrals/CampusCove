import * as THREE from 'three'
import { DEFAULT_SLOT_COLORS } from '../../api/characterCosmetics'
import { setAvatarSeated } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import type { SlotHexes } from '../../avatar/modularCharacterLogic'
import { decorModelUrl } from '../assets/catalog'
import { createGltfLoader } from '../gltfLoaderFactory'
import { outfitModels } from '../store/storeClerk'
import { applyLook, type OwnParts } from './templateSurfaces'
import { itemModelUrl, parseDecorParts, type DecorProp, type MaskedParts, type LightProp, type MannequinProp, type NpcProp, type TemplateProp, type Vec3 } from './mallTemplate.ts'

const STACK_GAP = 0.02
const loader = createGltfLoader()
const modelTemplates = new Map<string, Promise<THREE.Object3D>>()
const decorPartFiles = new Map<string, Promise<Record<string, MaskedParts>>>()

export function decorParts(key: string): Promise<Record<string, MaskedParts>> {
  let parts = decorPartFiles.get(key)
  if (!parts) {
    const url = `/assets/decor/${key}/parts.json`
    parts = fetch(url).then(async (response) => {
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error(`${url}: missing, run make texture-parts`)
      return parseDecorParts(await response.json(), key)
    })
    parts.catch(() => decorPartFiles.delete(key))
    decorPartFiles.set(key, parts)
  }
  return parts
}

function propModelUrl(prop: TemplateProp): string | null {
  if (prop.kind === 'decor') return decorModelUrl(prop.key)
  if (prop.kind === 'item') return itemModelUrl(prop)
  return null
}

export function propSignature(prop: TemplateProp): string {
  if (prop.kind === 'npc') return JSON.stringify(['npc', prop.body, prop.outfit, prop.pose])
  if (prop.kind === 'mannequin') return JSON.stringify(['mannequin', prop.body, prop.outfit])
  if (prop.kind === 'light') return JSON.stringify(['light', prop.light, prop.color, prop.intensity, prop.range, prop.angle, prop.pitch])
  return JSON.stringify([prop.kind, propModelUrl(prop), prop.kind === 'item' ? prop.stack : null, prop.kind === 'decor' ? (prop.materials ?? null) : null])
}

function modelTemplate(url: string): Promise<THREE.Object3D> {
  let template = modelTemplates.get(url)
  if (!template) {
    template = loader.loadAsync(url).then((gltf) => gltf.scene)
    template.catch(() => modelTemplates.delete(url))
    modelTemplates.set(url, template)
  }
  return template
}

export async function modelSize(url: string): Promise<Vec3> {
  const size = new THREE.Box3().setFromObject(await modelTemplate(url)).getSize(new THREE.Vector3())
  return [size.x, size.y, size.z]
}

export function npcColors(npc: NpcProp | MannequinProp): SlotHexes {
  const colors: SlotHexes = { ...DEFAULT_SLOT_COLORS, body: npc.body }
  for (const piece of npc.outfit) colors[piece.slot] = piece.color
  return colors
}

function createMannequin(mannequin: MannequinProp): Promise<THREE.Object3D> {
  return createModularCharacter(outfitModels(mannequin.outfit), npcColors(mannequin), DEFAULT_SLOT_COLORS)
}

async function createNpc(npc: NpcProp): Promise<THREE.Object3D> {
  const character = await createModularCharacter(outfitModels(npc.outfit), npcColors(npc), DEFAULT_SLOT_COLORS)
  if (!setAvatarSeated(character, npc.pose === 'sit') && npc.pose === 'sit') throw new Error('the avatar has no Sit clip')
  return character
}

function stackModels(model: THREE.Object3D, stack: [number, number]): THREE.Object3D {
  const [columns, rows] = stack
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const group = new THREE.Group()
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const copy = model.clone(true)
      copy.position.set((c - (columns - 1) / 2) * (size.x + STACK_GAP), 0, (r - (rows - 1) / 2) * (size.z + STACK_GAP))
      group.add(copy)
    }
  }
  return group
}

function markShared(model: THREE.Object3D): THREE.Object3D {
  model.traverse((obj) => {
    obj.userData.sharedGeometry = true
    obj.userData.sharedMaterials = true
  })
  return model
}

function createLightObject(prop: LightProp): THREE.Group {
  const group = new THREE.Group()
  if (prop.light === 'point') {
    group.add(new THREE.PointLight(prop.color, prop.intensity, prop.range, 2))
    return group
  }
  const spot = new THREE.SpotLight(prop.color, prop.intensity, prop.range, prop.angle, 0.35, 2)
  spot.target.position.set(0, -Math.sin(prop.pitch ?? 0), -Math.cos(prop.pitch ?? 0))
  group.add(spot, spot.target)
  return group
}

export interface MaterialSlot {
  name: string
  texturable: boolean
}

const MIN_UV_SPAN = 0.01

function metresPerUv(model: THREE.Object3D, name: string): number | null {
  let metres = 0
  let span = 0
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material]
    const uv = obj.geometry.getAttribute('uv')
    if (!uv || !materials.some((m) => m.name === name)) return
    obj.geometry.computeBoundingBox()
    const size = obj.geometry.boundingBox!.getSize(new THREE.Vector3())
    const uvBox = new THREE.Box2().setFromPoints(Array.from({ length: uv.count }, (_, i) => new THREE.Vector2(uv.getX(i), uv.getY(i))))
    const uvSize = uvBox.getSize(new THREE.Vector2())
    metres = Math.max(metres, size.x, size.y, size.z)
    span = Math.max(span, uvSize.x, uvSize.y)
  })
  return span > MIN_UV_SPAN && metres > 0 ? metres / span : null
}

export function materialSlotsOf(object: THREE.Object3D): MaterialSlot[] {
  const names = new Set<string>()
  object.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) if (material.name) names.add(material.name)
  })
  return [...names].sort().map((name) => ({ name, texturable: metresPerUv(object, name) !== null }))
}

export function disposeLookMaps(object: THREE.Object3D): void {
  object.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if (material.userData.lookMap) (material as THREE.MeshStandardMaterial).map?.dispose()
    }
  })
}

async function applyMaterialLooks(model: THREE.Object3D, key: string, looks: NonNullable<DecorProp['materials']>): Promise<void> {
  const own = await decorParts(key)
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  const pending: Promise<void>[] = []
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const swap = (material: THREE.Material): THREE.Material => {
      const look = looks[material.name]
      if (!look || !(material instanceof THREE.MeshStandardMaterial)) return material
      let copy = copies.get(material)
      if (!copy) {
        copy = material.clone()
        copies.set(material, copy)
        const tile = look.texture || look.material ? metresPerUv(model, material.name) : 1
        if (tile === null && look.texture) throw new Error(`${material.name} has no texture coordinates to take ${look.texture}`)
        copy.userData.lookMap = Boolean(look.texture || look.parts || look.material)
        copy.userData.flatOnly = tile === null
        const parts = own[material.name]
        const ownParts: OwnParts | undefined = parts ? { maskUrl: `/assets/decor/${key}/${parts.mask}`, parts: parts.parts } : undefined
        pending.push(applyLook(copy, look, [tile ?? 1, tile ?? 1], ownParts))
      }
      obj.userData.sharedMaterials = false
      return copy
    }
    obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material)
  })
  await Promise.all(pending)
}

export async function createPropObject(prop: TemplateProp): Promise<THREE.Object3D> {
  if (prop.kind === 'light') return createLightObject(prop)
  if (prop.kind === 'npc') return createNpc(prop)
  if (prop.kind === 'mannequin') return createMannequin(prop)
  const model = markShared((await modelTemplate(propModelUrl(prop)!)).clone(true))
  if (prop.kind === 'decor' && prop.materials) await applyMaterialLooks(model, prop.key, prop.materials)
  return prop.kind === 'item' && prop.stack ? stackModels(model, prop.stack) : model
}

export function placeProp(object: THREE.Object3D, prop: TemplateProp): void {
  object.position.fromArray(prop.position)
  object.rotation.set(0, prop.yaw, 0)
  object.scale.fromArray(prop.scale)
}
