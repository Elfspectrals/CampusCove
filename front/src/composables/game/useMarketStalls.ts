import { shallowRef, watch } from 'vue'
import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import type { MaterialLook, Vec3 } from '../../game/mallTemplates/mallTemplate.ts'
import { createPropObject, instancedCopies, modelSize } from '../../game/mallTemplates/templateProps'
import { CONTAINER_MODELS, STALL_MODELS, copiesFloor, copiesSpace, copiesThatFit, slotOrigin, stallLook, stallLookKey, type StallLook } from '../../game/market/marketStalls.ts'
import { slotCopies } from '../../game/shelves/shelves.ts'
import { configureRoomMeshShadows, normalizeRoomMaterials } from '../../game/sceneLighting'
import type { MarketLotView, MarketSnapshot } from '../../types/gameRealtime'

const VARIANTS_URL = '/assets/variants.json'

export interface MarketStallAnchor {
  stallNo: number
  anchor: THREE.Group
}

type CanopyLooks = Record<string, Record<string, MaterialLook>>

export interface MarketStallsDeps {
  stalls: () => readonly MarketStallAnchor[]
}

function placement(position: readonly number[], yaw: number, tipped: boolean): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(position), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tipped ? Math.PI / 2 : 0)), new THREE.Vector3(1, 1, 1))
}

export function useMarketStalls(deps: MarketStallsDeps) {
  const market = shallowRef<MarketSnapshot | null>(null)
  const shownKeys = new Map<number, string>()
  let canopyLooks: Promise<CanopyLooks> | null = null

  function canopies(): Promise<CanopyLooks> {
    canopyLooks ??= fetch(VARIANTS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`${VARIANTS_URL}: ${res.status}`)
        return res.json() as Promise<{ items: Record<string, CanopyLooks> }>
      })
      .then((variants) => {
        const looks = variants.items[STALL_MODELS.taken]
        if (!looks) throw new Error(`${VARIANTS_URL}: no ${STALL_MODELS.taken} variants`)
        return looks
      })
    return canopyLooks
  }

  const canopyHexes = shallowRef<Record<string, string>>({})
  canopies()
    .then((looks) => {
      canopyHexes.value = Object.fromEntries(Object.entries(looks).map(([key, materials]) => [key, Object.values(materials)[0]?.color ?? '#ffffff']))
    })
    .catch((error) => console.error('[market] canopy colours failed to load', error))

  async function lotObjects(lot: MarketLotView): Promise<THREE.Object3D[]> {
    const origin = slotOrigin(lot.slot)
    const objects: THREE.Object3D[] = []
    if (lot.container !== 'flat') {
      const container = await createPropObject({ id: `lot_${lot.lot_id}_container`, kind: 'decor', key: CONTAINER_MODELS[lot.container], position: origin, yaw: 0, scale: [1, 1, 1] })
      container.position.fromArray(origin)
      objects.push(container)
    }
    if (!lot.model_glb) return objects
    const size = await modelSize(lot.model_glb)
    const { box } = copiesSpace(lot.container)
    const count = copiesThatFit(lot.container, size, lot.quantity)
    const base = new THREE.Matrix4().makeTranslation(origin[0], origin[1] + copiesFloor(lot.container, count), origin[2])
    const copies = count > 0 ? slotCopies(box, size, count, 'messy', `lot#${lot.lot_id}`) : [{ position: [0, 0, 0] as Vec3, yaw: 0, tipped: false }]
    const parts = await instancedCopies(lot.model_glb, copies.map((c) => base.clone().multiply(placement(c.position, c.yaw, c.tipped))))
    for (const part of parts) part.userData.sharedMaterials = true
    return [...objects, ...parts]
  }

  async function stallObject(look: StallLook): Promise<THREE.Group> {
    const group = new THREE.Group()
    const materials = look.canopy ? (await canopies())[look.canopy] : undefined
    if (look.canopy && !materials) throw new Error(`no canopy colour ${look.canopy} in ${VARIANTS_URL}`)
    group.add(await createPropObject({ id: 'stall', kind: 'decor', key: STALL_MODELS[look.state], position: [0, 0, 0], yaw: 0, scale: [1, 1, 1], ...(materials ? { materials } : {}) }))
    for (const objects of await Promise.all(look.lots.map(lotObjects))) group.add(...objects)
    configureRoomMeshShadows(group)
    normalizeRoomMaterials(group, 'city')
    return group
  }

  async function show({ stallNo, anchor }: MarketStallAnchor): Promise<void> {
    const look = stallLook(market.value, stallNo)
    const key = stallLookKey(look)
    if (shownKeys.get(stallNo) === key) return
    shownKeys.set(stallNo, key)
    const next = await stallObject(look)
    if (shownKeys.get(stallNo) !== key) return disposeObject3D(next)
    for (const child of [...anchor.children]) {
      anchor.remove(child)
      disposeObject3D(child)
    }
    anchor.add(next)
  }

  function refresh(): void {
    for (const stall of deps.stalls()) {
      show(stall).catch((error) => console.error(`[market] stall ${stall.stallNo} failed to show`, error))
    }
  }

  function onSync(snapshot: MarketSnapshot): void {
    market.value = snapshot
    refresh()
  }

  watch(deps.stalls, refresh)

  return { market, canopyHexes, handlers: { onSync } }
}
