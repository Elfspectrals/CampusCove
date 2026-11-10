import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { DEFAULT_SLOT_COLORS } from '../../api/characterCosmetics'
import { setAvatarSeated } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import type { SlotHexes } from '../../avatar/modularCharacterLogic'
import { decorModelUrl } from '../assets/catalog'
import { createGltfLoader } from '../gltfLoaderFactory'
import { outfitModels } from '../store/storeClerk'
import { applyLook, type OwnParts } from './templateSurfaces'
import { CROPS_URL, fieldPlantsLocal, parseCrops, type CropTable } from '../crops/crops.ts'
import { ANIMALS_URL, ANIMAL_CLIPS, animalModelUrl, parseAnimals, type AnimalClip, type AnimalTable } from '../animals/animals.ts'
import { BUILDINGS_URL, buildingPreviewKey, parseBuildings, type BuildingTable } from '../buildings/buildings.ts'
import { itemModelUrl, parseDecorParts, type AnimalProp, type BuildingProp, type DecorProp, type FieldProp, type MaskedParts, type LightProp, type MannequinProp, type NpcProp, type TemplateProp, type Vec3 } from './mallTemplate.ts'

const STACK_GAP = 0.02
const SOIL_HEIGHT = 0.03
const SOIL_COLOR = 0x6e4b32
const PEN_COLOR = 0xe8c26a
const PEN_LIFT = 0.05
let cropTable: Promise<CropTable> | null = null
let animalTable: Promise<AnimalTable> | null = null
let buildingTable: Promise<BuildingTable> | null = null
const BUILDING_PREVIEWS_URL = '/__editor/buildings'
const animalModels = new Map<string, Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }>>()
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
  if (prop.kind === 'field') return JSON.stringify(['field', prop.id, prop.crop, prop.size, prop.pattern])
  if (prop.kind === 'animal') return JSON.stringify(['animal', prop.animal, prop.size])
  if (prop.kind === 'building') return JSON.stringify(['building', buildingPreviewKey(prop)])
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

export function crops(): Promise<CropTable> {
  if (!cropTable) {
    cropTable = fetch(CROPS_URL).then(async (response) => {
      if (!response.ok) throw new Error(`${CROPS_URL}: HTTP ${response.status}`)
      return parseCrops(await response.json())
    })
    cropTable.catch(() => (cropTable = null))
  }
  return cropTable
}

async function createField(prop: FieldProp): Promise<THREE.Group> {
  const crop = (await crops())[prop.crop]
  if (!crop) throw new Error(`no crop ${prop.crop} in ${CROPS_URL}`)
  const plant = await modelTemplate(`/assets/${crop.plant}`)
  const group = new THREE.Group()
  const [width, depth] = prop.size
  const soil = new THREE.Mesh(new THREE.BoxGeometry(width, SOIL_HEIGHT, depth), new THREE.MeshStandardMaterial({ color: SOIL_COLOR, roughness: 1 }))
  soil.position.y = SOIL_HEIGHT / 2
  group.add(soil)
  for (const [x, , z, yaw] of fieldPlantsLocal(prop, crop)) {
    const copy = markShared(plant.clone(true))
    copy.position.set(x, SOIL_HEIGHT, z)
    copy.rotation.y = yaw
    group.add(copy)
  }
  return group
}

export function animals(): Promise<AnimalTable> {
  if (!animalTable) {
    animalTable = fetch(ANIMALS_URL).then(async (response) => {
      if (!response.ok) throw new Error(`${ANIMALS_URL}: HTTP ${response.status}`)
      return parseAnimals(await response.json())
    })
    animalTable.catch(() => (animalTable = null))
  }
  return animalTable
}

function animalModel(key: string): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  let model = animalModels.get(key)
  if (!model) {
    const url = animalModelUrl(key)
    model = loader.loadAsync(url).then((gltf) => {
      const missing = ANIMAL_CLIPS.filter((name) => !gltf.animations.some((clip) => clip.name === name))
      if (missing.length) throw new Error(`${url}: missing clips ${missing.join(', ')}, run build_animals.py`)
      return { scene: gltf.scene, clips: gltf.animations }
    })
    model.catch(() => animalModels.delete(key))
    animalModels.set(key, model)
  }
  return model
}

export interface AnimalRig {
  object: THREE.Object3D
  mixer: THREE.AnimationMixer
  actions: Record<AnimalClip, THREE.AnimationAction>
}

async function cloneAnimal(key: string): Promise<THREE.Object3D> {
  const object = markShared(cloneSkinned((await animalModel(key)).scene))
  object.traverse((child) => {
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) child.frustumCulled = false
  })
  return object
}

export async function createAnimal(key: string): Promise<AnimalRig> {
  const { clips } = await animalModel(key)
  const object = await cloneAnimal(key)
  const mixer = new THREE.AnimationMixer(object)
  const actions = Object.fromEntries(ANIMAL_CLIPS.map((name) => [name, mixer.clipAction(clips.find((clip) => clip.name === name)!)])) as Record<AnimalClip, THREE.AnimationAction>
  return { object, mixer, actions }
}

async function createAnimalPen(prop: AnimalProp): Promise<THREE.Group> {
  const object = await cloneAnimal(prop.animal)
  const [width, depth] = prop.size
  const pen = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: PEN_COLOR }))
  pen.position.y = PEN_LIFT
  pen.raycast = () => {}
  const group = new THREE.Group()
  group.add(pen, object)
  return group
}

export function buildings(): Promise<BuildingTable> {
  if (!buildingTable) {
    buildingTable = fetch(BUILDINGS_URL).then(async (response) => {
      if (!response.ok) throw new Error(`${BUILDINGS_URL}: HTTP ${response.status}`)
      return parseBuildings(await response.json())
    })
    buildingTable.catch(() => (buildingTable = null))
  }
  return buildingTable
}

function buildingMassing(prop: BuildingProp): THREE.Group {
  const [width, depth] = prop.size
  const group = new THREE.Group()
  const walls = new THREE.Mesh(new THREE.BoxGeometry(width, prop.height, depth), new THREE.MeshStandardMaterial({ color: prop.colors.walls, roughness: 0.9 }))
  walls.position.y = prop.height / 2
  const span = prop.ridge === 'x' ? depth : width
  const length = prop.ridge === 'x' ? width : depth
  const profile = new THREE.Shape([new THREE.Vector2(-span / 2, 0), new THREE.Vector2(span / 2, 0), new THREE.Vector2(0, prop.roof)])
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(profile, { depth: length, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: prop.colors.roof, roughness: 0.8 }))
  roof.position.set(prop.ridge === 'x' ? -width / 2 : 0, prop.height, prop.ridge === 'x' ? 0 : -depth / 2)
  if (prop.ridge === 'x') roof.rotation.y = Math.PI / 2
  group.add(walls, roof)
  return group
}

async function createBuilding(prop: BuildingProp): Promise<THREE.Object3D> {
  const url = `${BUILDING_PREVIEWS_URL}/${buildingPreviewKey(prop)}.glb`
  const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
  if (!response.ok) return buildingMassing(prop)
  return (await loader.loadAsync(url)).scene
}

export async function createPropObject(prop: TemplateProp): Promise<THREE.Object3D> {
  if (prop.kind === 'field') return createField(prop)
  if (prop.kind === 'building') return createBuilding(prop)
  if (prop.kind === 'animal') return createAnimalPen(prop)
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
