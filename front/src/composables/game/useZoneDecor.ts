import { onUnmounted, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import type { Room } from '@colyseus/sdk'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { disposeAvatarAnimations, updateAvatarAnimation } from '../../avatar/glbCharacter'
import { decorModelUrl, isConsumableCode, isToolCode } from '../../game/assets/catalog'
import { fetchCollisionFile, setPropBlocker } from '../../game/collision/worldCollision'
import { ANIMALS_URL, animalPose, type AnimalClip, type AnimalDef } from '../../game/animals/animals.ts'
import { itemModelUrl, type AnimalProp, type ItemProp, type MannequinProp, type NpcProp, type ShelfProp, type StaffRole, type Vec3 } from '../../game/mallTemplates/mallTemplate.ts'
import { lighterStock, shelfUnits } from '../../game/shelves/shelves.ts'
import { getGraphicsQuality } from '../../game/graphicsQuality'
import { animals, createAnimal, createPropObject, modelSize, npcColors, placeProp, type AnimalRig } from '../../game/mallTemplates/templateProps'
import { configureRoomMeshShadows, normalizeRoomMaterials } from '../../game/sceneLighting'
import { INTERIOR_HIDE_DISTANCE, INTERIOR_SHOW_DISTANCE } from '../../game/town/openHouses'
import type { WorldBounds, WorldManifest } from '../../game/world/worldManifest'
import { ZONE_DECOR_INDEX_URL, areaSeller, areaStoreLayout, parseZoneDecor, parseZoneDecorIndex, runtimeProps, zoneDecorUrl, zonePrices, zoneRefOf, zoneShown, type SaleArea, type ZoneDecor, type ZoneRef } from '../../game/zoneDecor/zoneDecor.ts'
import type { ZoneCheckoutDonePayload, ZoneCheckoutErrorPayload } from '../../types/gameRealtime'
import { worldCuboids, type CellStoreEntry } from './useMallCellTemplates'
import { useFurnitureStore, type FurnitureStoreDeps } from './useFurnitureStore'
import type { ZoneBuyer } from './useZoneBuyers'

const NPC_HALF_EXTENTS = { hx: 0.3, hy: 0.9, hz: 0.3 }
const ANIMAL_CROSSFADE_S = 0.4
const CHECKOUT_TIMEOUT_MS = 10_000

type ZoneStore = ReturnType<typeof useFurnitureStore>

interface Wanderer {
  prop: AnimalProp
  def: AnimalDef
  rig: AnimalRig
  clip: AnimalClip | null
}

interface DecoratedZone {
  zone: ZoneRef
  decor: ZoneDecor
}

export interface ZoneDecorDeps {
  getScene: () => THREE.Scene | undefined
  storeDeps: Omit<FurnitureStoreDeps, 'inStore' | 'store'>
  addStore: (entry: CellStoreEntry) => void
  insideOtherStore: () => boolean
  getGameRoom: () => Room | null
  onStaff: (role: StaffRole, npc: THREE.Object3D) => void
  npcSpeed?: (npc: THREE.Object3D) => number
}

interface StoreArea {
  key: string
  bounds: WorldBounds
}

function areaStoreKey(zone: string, area: SaleArea): string {
  return `zone_${zone}_${area.id}`
}

function insideZone(bounds: WorldBounds, at: { x: number; z: number }): boolean {
  return at.x >= bounds.minX && at.x <= bounds.maxX && at.z >= bounds.minZ && at.z <= bounds.maxZ
}

function surface(bounds: WorldBounds): number {
  return (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ)
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

async function fetchDecoratedZones(manifest: WorldManifest): Promise<DecoratedZone[]> {
  const index = parseZoneDecorIndex(await fetchJson(ZONE_DECOR_INDEX_URL))
  const results = await Promise.allSettled(
    index.zones.map(async (key) => {
      const raw = await fetchJson(zoneDecorUrl(key))
      const zone = zoneRefOf(key, raw, manifest.zones)
      return { zone, decor: parseZoneDecor(raw, zone, null, null, null) }
    }),
  )
  for (const result of results) if (result.status === 'rejected') console.error('[zones] a zone decor failed to load', result.reason)
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

export function useZoneDecor(deps: ZoneDecorDeps) {
  const root = new THREE.Group()
  root.name = 'ZoneDecor'
  const npcs: THREE.Object3D[] = []
  const herd: Wanderer[] = []
  const buyers = shallowRef<ZoneBuyer[]>([])
  const atms = shallowRef<Vec3[]>([])
  const blockers: string[] = []
  const storeAreas: StoreArea[] = []
  const zoneGroups: Array<{ group: THREE.Group; bounds: WorldBounds }> = []
  const currentStoreKey = ref<string | null>(null)
  let loaded = false
  let disposed = false

  function block(key: string, cuboid: Parameters<typeof setPropBlocker>[1]): void {
    setPropBlocker(key, cuboid)
    blockers.push(key)
  }

  function blockerKey(zone: string, propId: string, index: number): string {
    return `zone:${zone}:${propId}#${index}`
  }

  async function addItem(zone: string, group: THREE.Group, item: ItemProp): Promise<void> {
    const [object, collision] = await Promise.all([
      createPropObject(item),
      isConsumableCode(item.code) || isToolCode(item.code) ? null : fetchCollisionFile(decorModelUrl(item.key).replace(/model\.glb$/, 'collision.json')),
    ])
    if (disposed) return disposeObject3D(object)
    configureRoomMeshShadows(object)
    normalizeRoomMaterials(object, 'city')
    placeProp(object, item)
    group.add(object)
    if (collision) worldCuboids(object, collision.cuboids).forEach((c, i) => block(blockerKey(zone, item.id, i), c))
  }

  async function blockSoldItem(zone: string, item: ItemProp): Promise<void> {
    if (isConsumableCode(item.code) || isToolCode(item.code)) return
    const collision = await fetchCollisionFile(decorModelUrl(item.key).replace(/model\.glb$/, 'collision.json'))
    if (disposed || !collision) return
    const spot = new THREE.Object3D()
    placeProp(spot, item)
    worldCuboids(spot, collision.cuboids).forEach((c, i) => block(blockerKey(zone, item.id, i), c))
  }

  async function addFigure(zone: string, group: THREE.Group, prop: NpcProp | MannequinProp, store: ZoneStore | null): Promise<void> {
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
    if (prop.kind === 'npc' && prop.role) deps.onStaff(prop.role, object)
    const [x, y, z] = prop.position
    const { hx, hy, hz } = NPC_HALF_EXTENTS
    const [sx, sy, sz] = prop.scale
    block(blockerKey(zone, prop.id, 0), { cx: x, cy: y + hy * sy, cz: z, hx: hx * Math.max(sx, sz), hy: hy * sy, hz: hz * Math.max(sx, sz), qx: 0, qy: 0, qz: 0, qw: 1 })
  }

  async function addShelf(zone: string, group: THREE.Group, shelf: ShelfProp, store: ZoneStore | null): Promise<void> {
    const object = await createPropObject(getGraphicsQuality() === 'low' ? lighterStock(shelf) : shelf)
    if (disposed) return disposeObject3D(object)
    configureRoomMeshShadows(object)
    normalizeRoomMaterials(object, 'city')
    placeProp(object, shelf)
    group.add(object)
    object.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && Array.isArray(obj.userData.shelfSlots)) store?.bindShelfGoods(shelf.id, obj)
    })
    const units = shelfUnits(shelf).map(({ center: [cx, cy, cz], size: [w, h, d] }) => ({ cx, cy, cz, hx: w / 2, hy: h / 2, hz: d / 2, qx: 0, qy: 0, qz: 0, qw: 1 }))
    worldCuboids(object, units).forEach((c, i) => block(blockerKey(zone, shelf.id, i), c))
  }

  async function addAnimal(group: THREE.Group, prop: AnimalProp): Promise<void> {
    const def = (await animals())[prop.animal]
    if (!def) throw new Error(`${ANIMALS_URL}: no animal ${prop.animal}`)
    const rig = await createAnimal(prop.animal)
    if (disposed) return disposeObject3D(rig.object)
    configureRoomMeshShadows(rig.object)
    normalizeRoomMaterials(rig.object, 'city')
    group.add(rig.object)
    herd.push({ prop, def, rig, clip: null })
  }

  function wander(dt: number): void {
    const seconds = Date.now() / 1000
    for (const animal of herd) {
      if (!animal.rig.object.parent?.visible) continue
      const pose = animalPose(animal.prop, animal.def, seconds)
      animal.rig.object.position.set(pose.x, animal.prop.position[1], pose.z)
      animal.rig.object.rotation.y = pose.yaw
      if (pose.clip !== animal.clip) {
        const next = animal.rig.actions[pose.clip].reset().play()
        if (animal.clip) animal.rig.actions[animal.clip].crossFadeTo(next, ANIMAL_CROSSFADE_S, false)
        animal.clip = pose.clip
      }
      animal.rig.mixer.update(dt)
    }
  }

  let checkoutRequests = 0

  function zoneCheckout(zone: string, items: number[]): Promise<void> {
    const room = deps.getGameRoom()
    if (!room) return Promise.reject(new Error('Not connected to the game server.'))
    const request = ++checkoutRequests
    return new Promise((resolve, reject) => {
      const stop = () => {
        offDone()
        offError()
        clearTimeout(timer)
      }
      const offDone = room.onMessage('zone_checkout_done', (data: ZoneCheckoutDonePayload) => {
        if (data.request !== request) return
        stop()
        applyCachedBalanceAfterPurchase('cash', data.balance_after)
        resolve()
      })
      const offError = room.onMessage('zone_checkout_error', (data: ZoneCheckoutErrorPayload) => {
        if (data.request !== request) return
        stop()
        reject(new Error(data.message))
      })
      const timer = setTimeout(() => {
        stop()
        reject(new Error('The cashier did not answer. Check your coins and inventory before paying again.'))
      }, CHECKOUT_TIMEOUT_MS)
      room.send('zone_checkout', { zone, items, request })
    })
  }

  async function openAreaStore({ zone, decor }: DecoratedZone, area: SaleArea, group: THREE.Group): Promise<ZoneStore | null> {
    const vendor = areaSeller(decor, area)
    const items = decor.props.filter((p): p is ItemProp => p.kind === 'item' && p.forSale && insideZone(area.bounds, { x: p.position[0], z: p.position[2] }))
    const sizes = new Map<string, Vec3>(await Promise.all(items.map(async (item) => [item.id, await modelSize(itemModelUrl(item))] as [string, Vec3])))
    if (disposed) return null
    const layout = areaStoreLayout(decor, area, sizes)
    if (layout.displays.length === 0) return null
    const key = areaStoreKey(zone.key, area)
    const store = useFurnitureStore({
      ...deps.storeDeps,
      inStore: () => currentStoreKey.value === key,
      store: {
        key,
        layout,
        modelUrl: (display) => itemModelUrl(display),
        priceTags: area.priceTags ?? false,
        coinPrices: new Map(Object.entries(zonePrices(decor))),
        checkout: (items) => zoneCheckout(zone.key, items),
        clerkColors: npcColors(vendor),
        clerkOutfit: vendor.outfit,
        clerkBrighten: false,
      },
    })
    await store.attach(group)
    storeAreas.push({ key, bounds: area.bounds })
    storeAreas.sort((a, b) => surface(a.bounds) - surface(b.bounds))
    deps.addStore({ key, brand: area.name, store })
    return store
  }

  async function fillZone(decorated: DecoratedZone): Promise<void> {
    const { zone } = decorated
    const group = new THREE.Group()
    group.name = `ZoneDecor_${zone.key}`
    group.visible = false
    zoneGroups.push({ group, bounds: zone.bounds })
    root.add(group)
    group.updateWorldMatrix(true, false)
    const npcAt = (id: string) => decorated.decor.props.find((p) => p.kind === 'npc' && p.id === id)!.position
    buyers.value = [...buyers.value, ...decorated.decor.areas.filter((a) => a.role === 'buyer').map((area) => ({ zone: zone.key, area, position: npcAt(area.npc) }))]
    atms.value = [...atms.value, ...decorated.decor.props.filter((p) => p.kind === 'item' && p.key === 'atm').map((p) => p.position)]
    const sellers = decorated.decor.areas.filter((a) => a.role === 'seller')
    const opened = await Promise.allSettled(sellers.map((a) => openAreaStore(decorated, a, group)))
    const storeOf = new Map(sellers.flatMap((a, i) => {
      const result = opened[i]!
      return result.status === 'fulfilled' && result.value ? [[a, result.value] as const] : []
    }))
    const storeAt = (position: Vec3): ZoneStore | null => [...storeOf].find(([a]) => insideZone(a.bounds, { x: position[0], z: position[2] }))?.[1] ?? null
    const loads = runtimeProps(decorated.decor).flatMap((prop) => {
      if (prop.kind === 'item') return [prop.forSale ? blockSoldItem(zone.key, prop) : addItem(zone.key, group, prop)]
      if (prop.kind === 'npc' && [...storeOf.keys()].some((a) => a.npc === prop.id)) return []
      if (prop.kind === 'animal') return [addAnimal(group, prop)]
      if (prop.kind === 'shelf') return [addShelf(zone.key, group, prop, storeAt(prop.position))]
      return [addFigure(zone.key, group, prop, storeAt(prop.position))]
    })
    const failures = [...opened, ...(await Promise.allSettled(loads))].filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    for (const failure of failures) console.error(`[zones] ${zone.key}: a prop failed to load`, failure.reason)
  }

  async function onTownLoaded(manifest: WorldManifest): Promise<void> {
    const scene = deps.getScene()
    if (loaded || !scene) return
    loaded = true
    scene.add(root)
    root.updateWorldMatrix(true, false)
    const decorated = await fetchDecoratedZones(manifest)
    if (disposed) return
    await Promise.all(decorated.map(fillZone))
  }

  function cullZones(at: { x: number; z: number }): void {
    for (const { group, bounds } of zoneGroups) group.visible = zoneShown(bounds, at, group.visible, INTERIOR_SHOW_DISTANCE, INTERIOR_HIDE_DISTANCE)
  }

  function tick(dt: number, at: { x: number; y: number; z: number }): void {
    cullZones(at)
    for (const npc of npcs) if (npc.parent?.visible) updateAvatarAnimation(npc, dt, deps.npcSpeed?.(npc) ?? 0)
    wander(dt)
    const inside = deps.insideOtherStore() ? undefined : storeAreas.find((a) => insideZone(a.bounds, at))
    currentStoreKey.value = inside?.key ?? null
  }

  onUnmounted(() => {
    disposed = true
    for (const npc of npcs) disposeAvatarAnimations(npc)
    for (const animal of herd) {
      animal.rig.mixer.stopAllAction()
      animal.rig.mixer.uncacheRoot(animal.rig.object)
    }
    for (const key of blockers) setPropBlocker(key, null)
    root.removeFromParent()
    disposeObject3D(root)
  })

  return { onTownLoaded, tick, currentStoreKey, buyers, atms }
}
