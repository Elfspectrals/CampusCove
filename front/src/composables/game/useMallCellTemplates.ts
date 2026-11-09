import { onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { disposeAvatarAnimations, updateAvatarAnimation } from '../../avatar/glbCharacter'
import { decorModelUrl } from '../../game/assets/catalog'
import { fetchCollisionFile, setPropBlocker, type CollisionCuboidJson } from '../../game/collision/worldCollision'
import {
  CELL_HEIGHT,
  cellArea,
  cellPlacement,
  itemModelUrl,
  templateStoreLayout,
  templateVendor,
  type DecorProp,
  type ItemProp,
  type LightProp,
  type MallCell,
  type MannequinProp,
  type NpcProp,
  type Vec3,
} from '../../game/mallTemplates/mallTemplate.ts'
import { isConsumableCode } from '../../game/assets/catalog'
import { fetchFilledCells, type FilledCell } from '../../game/mallTemplates/mallTemplateFiles'
import { createPropObject, disposeLookMaps, modelSize, npcColors, placeProp } from '../../game/mallTemplates/templateProps'
import { createSurfacePanels, disposeSurfacePanels } from '../../game/mallTemplates/templateSurfaces'
import { configureRoomMeshShadows, normalizeRoomMaterials } from '../../game/sceneLighting'
import type { WorldManifest } from '../../game/world/worldManifest'
import { useFurnitureStore, type FurnitureStoreDeps } from './useFurnitureStore'

const NPC_HALF_EXTENTS = { hx: 0.3, hy: 0.9, hz: 0.3 }
const LIGHT_REACH = 8

interface LitCell {
  cell: MallCell
  group: THREE.Group
  lights: LightProp[]
}

function createLightPool(cells: readonly LitCell[]): { points: THREE.PointLight[]; spots: THREE.SpotLight[] } {
  const most = (kind: LightProp['light']) => Math.max(0, ...cells.map((c) => c.lights.filter((l) => l.light === kind).length))
  const points = Array.from({ length: most('point') }, () => new THREE.PointLight(0xffffff, 0, 1, 2))
  const spots = Array.from({ length: most('spot') }, () => new THREE.SpotLight(0xffffff, 0, 1, Math.PI / 6, 0.35, 2))
  return { points, spots }
}

function distanceToCell(cell: MallCell, at: { x: number; y: number; z: number }): number {
  const { minX, maxX, minZ, maxZ } = cell.bounds
  const dx = Math.max(minX - at.x, 0, at.x - maxX)
  const dz = Math.max(minZ - at.z, 0, at.z - maxZ)
  return Math.abs(at.y - cell.front.y) > CELL_HEIGHT ? Infinity : Math.hypot(dx, dz)
}

type CellStore = ReturnType<typeof useFurnitureStore>

export interface CellStoreEntry {
  key: string
  brand: string
  store: CellStore
}

export interface MallCellTemplatesDeps {
  getScene: () => THREE.Scene | undefined
  storeDeps: Omit<FurnitureStoreDeps, 'inStore' | 'store'>
  addStore: (entry: CellStoreEntry) => void
}

function cellStoreKey(cellId: string): string {
  return `mallcell_${cellId}`
}

function insideCell(cell: MallCell, at: { x: number; y: number; z: number }): boolean {
  const { minX, maxX, minZ, maxZ } = cell.bounds
  return at.x >= minX && at.x <= maxX && at.z >= minZ && at.z <= maxZ && at.y >= cell.front.y - 1 && at.y <= cell.front.y + CELL_HEIGHT
}

function blockerKey(cellId: string, propId: string, index: number): string {
  return `mallcell:${cellId}:${propId}#${index}`
}

function worldCuboids(object: THREE.Object3D, local: CollisionCuboidJson[]): CollisionCuboidJson[] {
  object.updateWorldMatrix(true, false)
  const scale = object.getWorldScale(new THREE.Vector3())
  const q = object.getWorldQuaternion(new THREE.Quaternion())
  return local.map((c) => {
    const center = new THREE.Vector3(c.cx, c.cy, c.cz).applyMatrix4(object.matrixWorld)
    const own = new THREE.Quaternion(c.qx, c.qy, c.qz, c.qw).premultiply(q)
    return { name: c.name, cx: center.x, cy: center.y, cz: center.z, hx: c.hx * scale.x, hy: c.hy * scale.y, hz: c.hz * scale.z, qx: own.x, qy: own.y, qz: own.z, qw: own.w }
  })
}

export function useMallCellTemplates(deps: MallCellTemplatesDeps) {
  const root = new THREE.Group()
  root.name = 'MallCellTemplates'
  const npcs: THREE.Object3D[] = []
  const blockers: string[] = []
  const filledCells: MallCell[] = []
  const litCells: LitCell[] = []
  let pool: ReturnType<typeof createLightPool> = { points: [], spots: [] }
  let litCell: LitCell | null = null
  const currentStoreKey = ref<string | null>(null)
  let loaded = false
  let disposed = false

  function block(key: string, cuboid: CollisionCuboidJson): void {
    setPropBlocker(key, cuboid)
    blockers.push(key)
  }

  async function addModel(cellId: string, group: THREE.Group, prop: DecorProp | ItemProp): Promise<void> {
    const solid = prop.kind === 'decor' || !isConsumableCode(prop.code)
    const [object, collision] = await Promise.all([
      createPropObject(prop),
      solid ? fetchCollisionFile(decorModelUrl(prop.key).replace(/model\.glb$/, 'collision.json')) : null,
    ])
    if (disposed) return disposeObject3D(object)
    configureRoomMeshShadows(object)
    normalizeRoomMaterials(object, 'city')
    placeProp(object, prop)
    group.add(object)
    if (collision) worldCuboids(object, collision.cuboids).forEach((c, i) => block(blockerKey(cellId, prop.id, i), c))
  }

  async function addFigure(cellId: string, group: THREE.Group, prop: NpcProp | MannequinProp, store: CellStore | null): Promise<void> {
    const object = await createPropObject(prop)
    if (disposed) {
      disposeAvatarAnimations(object)
      return disposeObject3D(object)
    }
    placeProp(object, prop)
    group.add(object)
    if (prop.kind === 'npc') npcs.push(object)
    else disposeAvatarAnimations(object)
    if (prop.kind === 'mannequin') store?.bindFigure(prop.id, object)
    const feet = object.getWorldPosition(new THREE.Vector3())
    const { hx, hy, hz } = NPC_HALF_EXTENTS
    block(blockerKey(cellId, prop.id, 0), { cx: feet.x, cy: feet.y + hy * prop.scale, cz: feet.z, hx: hx * prop.scale, hy: hy * prop.scale, hz: hz * prop.scale, qx: 0, qy: 0, qz: 0, qw: 1 })
  }

  async function fillCell({ cell, template }: FilledCell): Promise<void> {
    const group = new THREE.Group()
    group.name = `MallCell_${cell.id}_${template.key}`
    const placement = cellPlacement(cell)
    group.position.fromArray(placement.position)
    group.rotation.y = placement.yaw
    root.add(group)
    group.updateWorldMatrix(true, false)
    const opened = await Promise.allSettled([openCellStore({ cell, template }, group)])
    const store = opened[0].status === 'fulfilled' ? opened[0].value : null
    const lights = template.props.filter((p): p is LightProp => p.kind === 'light')
    if (lights.length) litCells.push({ cell, group, lights })
    const surfaces = createSurfacePanels(template, cellArea(cell)).then((panels) => {
      if (disposed) return disposeSurfacePanels(panels)
      configureRoomMeshShadows(panels)
      normalizeRoomMaterials(panels, 'city')
      group.add(panels)
    })
    const loads = template.props.flatMap((prop) => {
      if (prop.kind === 'decor' || (prop.kind === 'item' && !prop.forSale)) return [addModel(cell.id, group, prop)]
      if (prop.kind === 'mannequin' || (prop.kind === 'npc' && !(prop.vendor && store))) return [addFigure(cell.id, group, prop, store)]
      return []
    })
    const failures = [...opened, ...(await Promise.allSettled([...loads, surfaces]))].filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    for (const failure of failures) console.error(`[mall] ${template.key} in ${cell.id}: a prop failed to load`, failure.reason)
  }

  async function openCellStore({ cell, template }: FilledCell, group: THREE.Group): Promise<CellStore | null> {
    const items = template.props.filter((p): p is ItemProp => p.kind === 'item' && p.forSale)
    const vendor = templateVendor(template)
    const sizes = new Map<string, Vec3>(await Promise.all(items.map(async (item) => [item.id, await modelSize(itemModelUrl(item))] as [string, Vec3])))
    if (disposed) return null
    const layout = templateStoreLayout(template, sizes)
    if (layout.displays.length === 0) return null
    const key = cellStoreKey(cell.id)
    const store = useFurnitureStore({
      ...deps.storeDeps,
      inStore: () => currentStoreKey.value === key,
      store: {
        key,
        layout,
        modelUrl: (display) => itemModelUrl(display),
        priceTags: false,
        ...(vendor ? { clerkColors: npcColors(vendor), clerkOutfit: vendor.outfit, clerkBrighten: false } : {}),
      },
    })
    filledCells.push(cell)
    deps.addStore({ key, brand: template.name, store })
    await store.attach(group)
    return store
  }

  async function onTownLoaded(manifest: WorldManifest): Promise<void> {
    const scene = deps.getScene()
    const mall = manifest.zones.find((zone) => zone.key === 'mall')
    if (loaded || !scene || !mall?.layoutUrl) return
    loaded = true
    scene.add(root)
    root.updateWorldMatrix(true, false)
    const filled = await fetchFilledCells(mall.layoutUrl)
    if (disposed) return
    await Promise.all(filled.map(fillCell))
    if (disposed || litCells.length === 0) return
    pool = createLightPool(litCells)
    root.add(...pool.points, ...pool.spots, ...pool.spots.map((s) => s.target))
  }

  function lightCell(next: LitCell | null): void {
    litCell = next
    for (const light of [...pool.points, ...pool.spots]) light.intensity = 0
    if (!next) return
    next.group.updateWorldMatrix(true, false)
    let point = 0
    let spot = 0
    for (const prop of next.lights) {
      const at = next.group.localToWorld(new THREE.Vector3().fromArray(prop.position))
      const light = prop.light === 'point' ? pool.points[point++]! : pool.spots[spot++]!
      light.position.copy(at)
      light.color.set(prop.color)
      light.intensity = prop.intensity
      light.distance = prop.range
      if (light instanceof THREE.SpotLight) {
        light.angle = prop.angle ?? light.angle
        const pitch = prop.pitch ?? 0
        const aim = new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch)).applyAxisAngle(new THREE.Vector3(0, 1, 0), prop.yaw)
        light.target.position.copy(next.group.localToWorld(new THREE.Vector3().fromArray(prop.position).add(aim)))
        light.target.updateMatrixWorld()
      }
    }
  }

  function tick(dt: number, at: { x: number; y: number; z: number }): void {
    for (const npc of npcs) updateAvatarAnimation(npc, dt, 0)
    const inside = filledCells.find((cell) => insideCell(cell, at))
    currentStoreKey.value = inside ? cellStoreKey(inside.id) : null
    let nearest: LitCell | null = null
    let nearestDistance = LIGHT_REACH
    for (const lit of litCells) {
      const distance = distanceToCell(lit.cell, at)
      if (distance < nearestDistance) {
        nearest = lit
        nearestDistance = distance
      }
    }
    if (nearest !== litCell) lightCell(nearest)
  }

  onUnmounted(() => {
    disposed = true
    for (const npc of npcs) disposeAvatarAnimations(npc)
    for (const key of blockers) setPropBlocker(key, null)
    root.removeFromParent()
    disposeLookMaps(root)
    disposeObject3D(root)
  })

  return { onTownLoaded, tick, currentStoreKey }
}
