import { onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { disposeAvatarAnimations, updateAvatarAnimation } from '../../avatar/glbCharacter'
import { decorModelUrl, isConsumableCode } from '../../game/assets/catalog'
import { fetchCollisionFile, setPropBlocker } from '../../game/collision/worldCollision'
import { itemModelUrl, templateVendor, type ItemProp, type MannequinProp, type NpcProp, type Vec3 } from '../../game/mallTemplates/mallTemplate.ts'
import { createPropObject, modelSize, npcColors, placeProp } from '../../game/mallTemplates/templateProps'
import { configureRoomMeshShadows, normalizeRoomMaterials } from '../../game/sceneLighting'
import type { WorldBounds, WorldManifest, WorldZone } from '../../game/world/worldManifest'
import { ZONE_DECOR_INDEX_URL, parseZoneDecor, parseZoneDecorIndex, runtimeProps, zoneDecorUrl, zoneStoreLayout, type ZoneDecor } from '../../game/zoneDecor/zoneDecor.ts'
import { worldCuboids, type CellStoreEntry } from './useMallCellTemplates'
import { useFurnitureStore, type FurnitureStoreDeps } from './useFurnitureStore'

const NPC_HALF_EXTENTS = { hx: 0.3, hy: 0.9, hz: 0.3 }

type ZoneStore = ReturnType<typeof useFurnitureStore>

interface DecoratedZone {
  zone: WorldZone
  decor: ZoneDecor
}

export interface ZoneDecorDeps {
  getScene: () => THREE.Scene | undefined
  storeDeps: Omit<FurnitureStoreDeps, 'inStore' | 'store'>
  addStore: (entry: CellStoreEntry) => void
  insideOtherStore: () => boolean
}

function zoneStoreKey(zone: string): string {
  return `zone_${zone}`
}

function insideZone(bounds: WorldBounds, at: { x: number; z: number }): boolean {
  return at.x >= bounds.minX && at.x <= bounds.maxX && at.z >= bounds.minZ && at.z <= bounds.maxZ
}

function area(bounds: WorldBounds): number {
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
      const zone = manifest.zones.find((z) => z.key === key)
      if (!zone) throw new Error(`${ZONE_DECOR_INDEX_URL}: zone ${key} is not in the world manifest`)
      return { zone, decor: parseZoneDecor(await fetchJson(zoneDecorUrl(key)), zone, null) }
    }),
  )
  for (const result of results) if (result.status === 'rejected') console.error('[zones] a zone decor failed to load', result.reason)
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
}

export function useZoneDecor(deps: ZoneDecorDeps) {
  const root = new THREE.Group()
  root.name = 'ZoneDecor'
  const npcs: THREE.Object3D[] = []
  const blockers: string[] = []
  const storeZones: WorldZone[] = []
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
      isConsumableCode(item.code) ? null : fetchCollisionFile(decorModelUrl(item.key).replace(/model\.glb$/, 'collision.json')),
    ])
    if (disposed) return disposeObject3D(object)
    configureRoomMeshShadows(object)
    normalizeRoomMaterials(object, 'city')
    placeProp(object, item)
    group.add(object)
    if (collision) worldCuboids(object, collision.cuboids).forEach((c, i) => block(blockerKey(zone, item.id, i), c))
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
    const [x, y, z] = prop.position
    const { hx, hy, hz } = NPC_HALF_EXTENTS
    const [sx, sy, sz] = prop.scale
    block(blockerKey(zone, prop.id, 0), { cx: x, cy: y + hy * sy, cz: z, hx: hx * Math.max(sx, sz), hy: hy * sy, hz: hz * Math.max(sx, sz), qx: 0, qy: 0, qz: 0, qw: 1 })
  }

  async function openZoneStore({ zone, decor }: DecoratedZone, group: THREE.Group): Promise<ZoneStore | null> {
    const vendor = templateVendor({ version: 1, key: decor.zone, name: decor.name, preset: { width: 0, depth: 0 }, props: decor.props })
    const items = decor.props.filter((p): p is ItemProp => p.kind === 'item' && p.forSale)
    const sizes = new Map<string, Vec3>(await Promise.all(items.map(async (item) => [item.id, await modelSize(itemModelUrl(item))] as [string, Vec3])))
    if (disposed) return null
    const layout = zoneStoreLayout(decor, zone.bounds, sizes)
    if (layout.displays.length === 0) return null
    const key = zoneStoreKey(zone.key)
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
    await store.attach(group)
    storeZones.push(zone)
    storeZones.sort((a, b) => area(a.bounds) - area(b.bounds))
    deps.addStore({ key, brand: decor.name, store })
    return store
  }

  async function fillZone(decorated: DecoratedZone): Promise<void> {
    const { zone } = decorated
    const group = new THREE.Group()
    group.name = `ZoneDecor_${zone.key}`
    root.add(group)
    group.updateWorldMatrix(true, false)
    const opened = await Promise.allSettled([openZoneStore(decorated, group)])
    const store = opened[0].status === 'fulfilled' ? opened[0].value : null
    const loads = runtimeProps(decorated.decor).flatMap((prop) => {
      if (prop.kind === 'item') return prop.forSale ? [] : [addItem(zone.key, group, prop)]
      if (prop.kind === 'npc' && prop.vendor && store) return []
      return [addFigure(zone.key, group, prop, store)]
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

  function tick(dt: number, at: { x: number; y: number; z: number }): void {
    for (const npc of npcs) updateAvatarAnimation(npc, dt, 0)
    const inside = deps.insideOtherStore() ? undefined : storeZones.find((zone) => insideZone(zone.bounds, at))
    currentStoreKey.value = inside ? zoneStoreKey(inside.key) : null
  }

  onUnmounted(() => {
    disposed = true
    for (const npc of npcs) disposeAvatarAnimations(npc)
    for (const key of blockers) setPropBlocker(key, null)
    root.removeFromParent()
    disposeObject3D(root)
  })

  return { onTownLoaded, tick, currentStoreKey }
}
