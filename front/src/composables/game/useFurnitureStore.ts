import { computed, ref, shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import type { CosmeticColors } from '../../api/characterCosmetics'
import { checkoutShopBasket, fetchItemShopCatalog, type ShopItem } from '../../api/itemShop'
import { COVE_HOME, decorModelUrl, type StoreDisplay, type StoreLayout } from '../../game/assets/catalog'
import { createGltfLoader } from '../../game/gltfLoaderFactory'
import { configureRoomMeshShadows } from '../../game/sceneLighting'
import { createPriceTag, type PriceTagContent } from '../../game/store/priceTag'
import { createStoreClerk } from '../../game/store/storeClerk'
import { openHouseInterior } from '../../game/town/openHouses'
import type { ScreenPrompt } from './useInteractionTargets'

/** The item the player is looking at in the store. */
export interface StoreTarget {
  display: StoreDisplay
  /** Shop listing for `display.code`; null when the item is not on sale. */
  item: ShopItem | null
  name: string
  departmentLabel: string
  coins: number | null
  /** The item is already in the basket (stores with a counter); a click puts it back. */
  inBasket: boolean
  /** World position of the price tag (prompt anchor). */
  tagPosition: [number, number, number]
}

export interface FurnitureStoreDeps {
  /** True while the player is inside this store. */
  inStore: () => boolean
  getCamera: () => THREE.Camera | undefined
  myPosition: { x: number; y: number; z: number }
  /** The store this instance serves; Cove Home (decor models) when omitted. */
  store?: FurnitureStoreSpec
  /** Stores with a counter draw the "Pay" prompt on the canvas and refresh the inventory after paying. */
  canvasRef?: Ref<HTMLCanvasElement | null>
  promptsHidden?: () => boolean
  onPurchased?: () => void
}

interface FurnitureStoreSpec {
  key: string
  interiorLayoutUrl: string
  /** GLB shown on the display spot (a decor piece, a food item...). */
  modelUrl: (display: StoreDisplay) => string
  /** Uniform colours of the cashier; a store whose layout has a `counter` sells through a basket paid there. */
  clerkColors?: CosmeticColors
}

const COVE_HOME_SPEC: FurnitureStoreSpec = { key: COVE_HOME.key, interiorLayoutUrl: COVE_HOME.interiorLayoutUrl, modelUrl: (display) => decorModelUrl(display.key) }

/** Furthest (XZ, metres) an item can be picked from, and the widest angle off the crosshair. */
const PICK_DISTANCE = 4.2
const PICK_ANGLE = 0.32
const CLOSE_DISTANCE = 1.6
const CLOSE_ANGLE = 0.7
const COUNTER_REACH = 2.2
const STACK_GAP = 0.02

interface DisplayRuntime {
  display: StoreDisplay
  tag: ReturnType<typeof createPriceTag>
  /** Look-at point (middle of the model), world space. */
  center: THREE.Vector3
  tagPosition: [number, number, number]
}

function prettyName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Cove Home showroom: puts every furniture model of the store layout on its display spot (the models are the
 * same decor GLBs that get placed in houses), draws an IKEA-style price tag next to each one from the live shop
 * catalogue, and tracks which item the player is looking at so a click can buy it.
 */
export function useFurnitureStore(deps: FurnitureStoreDeps) {
  const loader = createGltfLoader()
  const store = deps.store ?? COVE_HOME_SPEC
  const layout = shallowRef<StoreLayout | null>(null)
  const catalogByCode = shallowRef<Map<string, ShopItem>>(new Map())
  const target = shallowRef<StoreTarget | null>(null)
  const currentDepartment = ref<string | null>(null)
  const basket = ref<ShopItem[]>([])
  const checkoutOpen = ref(false)
  const paying = ref(false)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const counterPrompt = ref<ScreenPrompt | null>(null)
  const basketTotal = computed(() => basket.value.reduce((sum, item) => sum + (coinsPrice(item) ?? 0), 0))
  const hasCounter = computed(() => layout.value?.counter !== undefined)
  const clerk = store.clerkColors ? createStoreClerk(store.key, store.clerkColors) : null
  const runtimes: DisplayRuntime[] = []
  let attachedTo: THREE.Group | null = null
  let attachToken = 0
  let wasInStore = false
  const forward = new THREE.Vector3()
  const toItem = new THREE.Vector3()
  const counter = new THREE.Vector3()
  const projection = new THREE.Vector3()

  const departmentLabels = computed(() => new Map((layout.value?.departments ?? []).map((d) => [d.id, d.label])))

  async function loadLayout(): Promise<StoreLayout> {
    if (layout.value) return layout.value
    const res = await fetch(store.interiorLayoutUrl)
    if (!res.ok) throw new Error(`Could not load the store layout (${res.status})`)
    layout.value = (await res.json()) as StoreLayout
    return layout.value
  }

  async function refreshCatalog(): Promise<void> {
    try {
      const { items } = await fetchItemShopCatalog()
      catalogByCode.value = new Map(items.map((item) => [item.code, item]))
    } catch (error) {
      console.warn('[store] catalogue failed to load, tags show no prices', error)
    }
  }

  function coinsPrice(item: ShopItem | null): number | null {
    return item?.options.find((o) => o.currency === 'coins')?.price ?? null
  }

  function tagContent(display: StoreDisplay): PriceTagContent {
    const item = catalogByCode.value.get(display.code) ?? null
    return {
      name: item?.name ?? prettyName(display.key),
      department: departmentLabels.value.get(display.department) ?? display.department,
      description: display.description,
      price: coinsPrice(item),
    }
  }

  /** The model on its spot; a `stack` lines up copies in a grid so small goods read as a filled shelf. */
  async function placeModel(group: THREE.Group, display: StoreDisplay): Promise<void> {
    try {
      const gltf = await loader.loadAsync(store.modelUrl(display))
      const [cols, rows] = display.stack ?? [1, 1]
      const [w, , d] = display.size
      const [px, py, pz] = display.position
      const cos = Math.cos(display.yaw)
      const sin = Math.sin(display.yaw)
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const model = i === 0 && j === 0 ? gltf.scene : gltf.scene.clone()
          const ox = (i - (cols - 1) / 2) * (w + STACK_GAP)
          const oz = (j - (rows - 1) / 2) * (d + STACK_GAP)
          model.name = `StoreDisplay_${display.key}`
          model.position.set(px + ox * cos + oz * sin, py, pz - ox * sin + oz * cos)
          model.rotation.y = display.yaw
          configureRoomMeshShadows(model)
          group.add(model)
        }
      }
    } catch (error) {
      console.warn('[store] display model failed to load', display.key, error)
    }
  }

  /**
   * Called when the store interior is in the scene. The interior group is cached and reused between visits, so
   * the models are added once; the price tags are redrawn on every visit with the current catalogue.
   */
  async function attach(group: THREE.Group): Promise<void> {
    const token = ++attachToken
    const [storeLayout] = await Promise.all([loadLayout(), refreshCatalog()])
    if (token !== attachToken) return
    if (attachedTo === group) {
      for (const rt of runtimes) rt.tag.update(tagContent(rt.display))
      return
    }
    attachedTo = group
    const displays = new THREE.Group()
    displays.name = 'StoreDisplays'
    group.add(displays)
    const tags: ReturnType<typeof createPriceTag>[] = []
    for (const display of storeLayout.displays) {
      const tag = createPriceTag(tagContent(display))
      tags.push(tag)
      tag.object.position.fromArray(display.tag.position)
      tag.object.rotation.y = display.tag.yaw
      displays.add(tag.object)
    }
    group.updateWorldMatrix(true, true)
    if (storeLayout.clerk && clerk) void clerk.attach(group, displays, storeLayout.clerk)
    storeLayout.displays.forEach((display, i) => {
      const [x, y, z] = display.position
      const tag = tags[i]!
      runtimes.push({
        display,
        tag,
        center: new THREE.Vector3(x, y + display.size[1] / 2, z).applyMatrix4(group.matrixWorld),
        tagPosition: tag.object.getWorldPosition(new THREE.Vector3()).toArray(),
      })
    })
    await Promise.all(storeLayout.displays.map((d) => placeModel(displays, d)))
  }

  function setTarget(next: DisplayRuntime | null): void {
    const current = target.value?.display
    if ((next?.display ?? null) === (current ?? null)) return
    for (const rt of runtimes) rt.tag.object.scale.setScalar(rt === next ? 1.18 : 1)
    if (!next) {
      target.value = null
      return
    }
    const item = catalogByCode.value.get(next.display.code) ?? null
    target.value = {
      display: next.display,
      item,
      name: item?.name ?? prettyName(next.display.key),
      departmentLabel: departmentLabels.value.get(next.display.department) ?? next.display.department,
      coins: coinsPrice(item),
      inBasket: item ? inBasket(item) : false,
      tagPosition: next.tagPosition,
    }
  }

  function inBasket(item: ShopItem): boolean {
    return basket.value.some((b) => b.item_def_id === item.item_def_id)
  }

  /**
   * Click on a display in a store with a counter: the item goes into the basket, a second click puts it back
   * (one of each, like the clothing stores: POST /shop/checkout refuses the same item twice).
   */
  function toggleTarget(): void {
    const current = target.value
    if (!current) return
    if (!current.item || current.coins === null) {
      feedback.value = { kind: 'error', text: `${current.name} is not on sale yet.` }
      return
    }
    if (inBasket(current.item)) {
      removeFromBasket(current.item)
      feedback.value = { kind: 'success', text: `${current.name} put back.` }
    } else {
      basket.value = [...basket.value, current.item]
      feedback.value = { kind: 'success', text: `${current.name} is in your basket. Pay at the counter.` }
    }
    target.value = { ...current, inBasket: inBasket(current.item) }
  }

  function removeFromBasket(item: ShopItem): void {
    basket.value = basket.value.filter((b) => b.item_def_id !== item.item_def_id)
  }

  function counterPosition(): THREE.Vector3 | null {
    const interior = openHouseInterior(store.key)
    if (!interior || !layout.value?.counter) return null
    interior.updateWorldMatrix(true, false)
    return counter.fromArray(layout.value.counter).applyMatrix4(interior.matrixWorld)
  }

  function isNearCounter(): boolean {
    const at = counterPosition()
    return at !== null && Math.hypot(at.x - deps.myPosition.x, at.z - deps.myPosition.z) <= COUNTER_REACH
  }

  function tryOpenCheckout(): boolean {
    if (!deps.inStore() || !isNearCounter()) return false
    if (document.pointerLockElement) document.exitPointerLock()
    checkoutOpen.value = true
    return true
  }

  async function pay(): Promise<void> {
    if (paying.value || basket.value.length === 0) return
    paying.value = true
    try {
      await checkoutShopBasket(basket.value.map((item) => item.shop_catalog_item_id))
      feedback.value = { kind: 'success', text: 'Paid! Your items are in your inventory.' }
      basket.value = []
      checkoutOpen.value = false
      deps.onPurchased?.()
      await refreshCatalog()
    } catch (e) {
      feedback.value = { kind: 'error', text: e instanceof Error ? e.message : 'Payment failed.' }
    } finally {
      paying.value = false
    }
  }

  /** The "Pay" prompt over the cashier (or the counter) while the player stands at the counter. */
  function updatePrompt(): void {
    const at = deps.inStore() && !deps.promptsHidden?.() && !checkoutOpen.value && isNearCounter() ? (clerk?.present ? clerk.head : counter) : null
    const camera = deps.getCamera()
    const canvas = deps.canvasRef?.value
    if (!at || !camera || !canvas || projection.copy(at).project(camera).z > 1) {
      counterPrompt.value = null
      return
    }
    const rect = canvas.getBoundingClientRect()
    counterPrompt.value = {
      x: (projection.x * 0.5 + 0.5) * rect.width,
      y: (-projection.y * 0.5 + 0.5) * rect.height,
      action: 'Pay',
      detail: basket.value.length > 0 ? `Cashier · ${basket.value.length} item(s) · ${basketTotal.value} coins` : 'Cashier · basket is empty',
    }
  }

  /** Every frame: the display closest to the crosshair within reach, and the department around the player. */
  function update(dt = 0): void {
    const inside = deps.inStore()
    if (wasInStore && !inside) {
      basket.value = []
      checkoutOpen.value = false
    }
    wasInStore = inside
    clerk?.update(dt, inside, deps.myPosition)
    const camera = deps.getCamera()
    if (!inside || !camera || runtimes.length === 0) {
      if (target.value) setTarget(null)
      currentDepartment.value = null
      return
    }
    camera.getWorldDirection(forward)
    const { x, y, z } = deps.myPosition
    let best: DisplayRuntime | null = null
    let bestScore = Infinity
    let nearest: DisplayRuntime | null = null
    let nearestDist = Infinity
    for (const rt of runtimes) {
      const dx = rt.center.x - x
      const dz = rt.center.z - z
      const dist = Math.hypot(dx, dz)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = rt
      }
      if (dist > PICK_DISTANCE) continue
      toItem.set(dx, rt.center.y - y, dz).normalize()
      const angle = forward.angleTo(toItem)
      const limit = dist < CLOSE_DISTANCE ? CLOSE_ANGLE : PICK_ANGLE
      if (angle > limit) continue
      const score = angle + dist * 0.04
      if (score < bestScore) {
        bestScore = score
        best = rt
      }
    }
    setTarget(best)
    const dep = nearest && nearestDist < 8 ? nearest.display.department : null
    currentDepartment.value = dep ? departmentLabels.value.get(dep) ?? dep : null
  }

  return {
    target: target as Readonly<Ref<StoreTarget | null>>,
    currentDepartment,
    hasCounter,
    basket,
    basketTotal,
    checkoutOpen,
    paying,
    feedback,
    counterPrompt,
    attach,
    update,
    updatePrompt,
    toggleTarget,
    removeFromBasket,
    tryOpenCheckout,
    pay,
    closeCheckout: () => {
      checkoutOpen.value = false
    },
  }
}
