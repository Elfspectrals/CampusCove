import { computed, ref, shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import type { CosmeticColors } from '../../api/characterCosmetics'
import { checkoutShopBasket, fetchItemShopCatalog, type ShopItem } from '../../api/itemShop'
import { COVE_HOME, decorModelUrl, type StoreDisplay, type StoreLayout } from '../../game/assets/catalog'
import { createGltfLoader } from '../../game/gltfLoaderFactory'
import { configureRoomMeshShadows } from '../../game/sceneLighting'
import { freshDisplayGroup } from '../../game/store/displayGroup'
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
  /** World position of the prompt: the price tag, or just above the model in a store without tags. */
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
  /** IKEA-style price tag next to each display (Cove Home); the mall stores show the model alone. Default true. */
  priceTags?: boolean
}

const COVE_HOME_SPEC: FurnitureStoreSpec = { key: COVE_HOME.key, interiorLayoutUrl: COVE_HOME.interiorLayoutUrl, modelUrl: (display) => decorModelUrl(display.key) }

/** Furthest (XZ, metres) an item can be picked from, and the widest angle off the crosshair. */
const PICK_DISTANCE = 4.2
const PICK_ANGLE = 0.32
const CLOSE_DISTANCE = 1.6
const CLOSE_ANGLE = 0.7
/** Stores without tags: the crosshair may miss a small item by this much (radians) if nothing hides it. */
const AIM_SLACK = 0.09
/** Seconds between two raycasts of the aim (the interior meshes are big merged nodes). */
const AIM_INTERVAL = 0.08
/** A hit this close before an item's middle still counts as the item (its own shelf, the copy next to it). */
const SEE_THROUGH_SLACK = 0.15
const COUNTER_REACH = 2.2
const STACK_GAP = 0.02
const PROMPT_LIFT = 0.18
const HIGHLIGHT = new THREE.Color(0x3a3a2a)

interface DisplayRuntime {
  display: StoreDisplay
  tag: ReturnType<typeof createPriceTag> | null
  /** Look-at point (middle of the model), world space. */
  center: THREE.Vector3
  tagPosition: [number, number, number]
  /** The display's own material copies (shared by its stacked copies), lit up while it is aimed at. */
  materials: THREE.MeshStandardMaterial[]
}

function prettyName(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Raycasts do not skip hidden nodes (the Sky_ and door nodes an interior hides in the open world). */
function isShown(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o && o !== root; o = o.parent) if (!o.visible) return false
  return true
}

/** Glass (a bakery sneeze guard, fridge doors) is aimed through, like the player sees through it. */
function isSeeThrough(obj: THREE.Object3D): boolean {
  if (!(obj instanceof THREE.Mesh)) return false
  const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material]
  return materials.every((m) => m.transparent && m.opacity < 0.6)
}

/** Own copies of the model's materials so lighting one display up leaves the same GLB elsewhere untouched. */
function ownMaterials(model: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const copies = new Map<THREE.Material, THREE.Material>()
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const swap = (m: THREE.Material) => {
      let copy = copies.get(m)
      if (!copy) {
        copy = m.clone()
        copies.set(m, copy)
      }
      return copy
    }
    obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material)
  })
  const lit = [...copies.values()].filter((m): m is THREE.MeshStandardMaterial => m instanceof THREE.MeshStandardMaterial)
  for (const m of lit) m.userData.baseEmissive = m.emissive.clone()
  return lit
}

/**
 * A store selling from display spots: puts every model of the store layout on its spot (decor pieces at Cove Home
 * and the mall's furniture stores, foods at GreenCart and Candy Cloud), and tracks which item the player is
 * looking at so a click buys it (Cove Home) or puts it in the basket (stores with a counter). Cove Home draws an
 * IKEA-style price tag next to each piece; the mall stores show the model alone, its name and price come up in the
 * item card while it is aimed at.
 */
export function useFurnitureStore(deps: FurnitureStoreDeps) {
  const loader = createGltfLoader()
  const store = deps.store ?? COVE_HOME_SPEC
  const withTags = store.priceTags ?? true
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
  let aimClock = AIM_INTERVAL
  const forward = new THREE.Vector3()
  const toItem = new THREE.Vector3()
  const counter = new THREE.Vector3()
  const projection = new THREE.Vector3()
  const eye = new THREE.Vector3()
  const raycaster = new THREE.Raycaster()

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
  async function placeModel(group: THREE.Group, rt: DisplayRuntime, index: number): Promise<void> {
    const { display } = rt
    try {
      const gltf = await loader.loadAsync(store.modelUrl(display))
      rt.materials = ownMaterials(gltf.scene)
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
          model.userData.storeDisplay = index
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
      for (const rt of runtimes) rt.tag?.update(tagContent(rt.display))
      return
    }
    attachedTo = group
    runtimes.length = 0
    const displays = freshDisplayGroup(group, 'StoreDisplays')
    group.updateWorldMatrix(true, true)
    if (storeLayout.clerk && clerk) void clerk.attach(group, displays, storeLayout.clerk)
    for (const display of storeLayout.displays) {
      const [x, y, z] = display.position
      const center = new THREE.Vector3(x, y + display.size[1] / 2, z).applyMatrix4(group.matrixWorld)
      let tag: DisplayRuntime['tag'] = null
      let tagPosition: [number, number, number]
      if (withTags) {
        tag = createPriceTag(tagContent(display))
        tag.object.position.fromArray(display.tag.position)
        tag.object.rotation.y = display.tag.yaw
        displays.add(tag.object)
        displays.updateWorldMatrix(true, true)
        tagPosition = tag.object.getWorldPosition(new THREE.Vector3()).toArray()
      } else {
        tagPosition = new THREE.Vector3(x, y + display.size[1] + PROMPT_LIFT, z).applyMatrix4(group.matrixWorld).toArray()
      }
      runtimes.push({ display, tag, center, tagPosition, materials: [] })
    }
    await Promise.all(runtimes.map((rt, i) => placeModel(displays, rt, i)))
  }

  function setTarget(next: DisplayRuntime | null): void {
    const current = target.value?.display
    if ((next?.display ?? null) === (current ?? null)) return
    for (const rt of runtimes) {
      rt.tag?.object.scale.setScalar(rt === next ? 1.18 : 1)
      for (const m of rt.materials) {
        m.emissive.copy(m.userData.baseEmissive as THREE.Color)
        if (rt === next) m.emissive.add(HIGHLIGHT)
      }
    }
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

  /** The display whose model the first thing hit along `direction` belongs to (shelves and walls hide what is behind). */
  function firstHitAlong(direction: THREE.Vector3): { display: DisplayRuntime | null; distance: number } {
    if (!attachedTo) return { display: null, distance: Infinity }
    raycaster.set(eye, direction)
    raycaster.far = PICK_DISTANCE + 1
    const hit = raycaster.intersectObject(attachedTo, true).find((h) => isShown(h.object, attachedTo!) && !isSeeThrough(h.object))
    if (!hit) return { display: null, distance: Infinity }
    for (let obj: THREE.Object3D | null = hit.object; obj; obj = obj.parent) {
      const index = obj.userData.storeDisplay
      if (typeof index === 'number') return { display: runtimes[index] ?? null, distance: hit.distance }
    }
    return { display: null, distance: hit.distance }
  }

  /** Stores without tags: the model under the crosshair, else a model just next to it that nothing hides. */
  function aimedModel(camera: THREE.Camera): DisplayRuntime | null {
    camera.getWorldPosition(eye)
    const direct = firstHitAlong(forward).display
    if (direct) return Math.hypot(direct.center.x - eye.x, direct.center.z - eye.z) <= PICK_DISTANCE ? direct : null
    let best: DisplayRuntime | null = null
    let bestAngle = AIM_SLACK
    for (const rt of runtimes) {
      if (Math.hypot(rt.center.x - eye.x, rt.center.z - eye.z) > PICK_DISTANCE) continue
      const angle = forward.angleTo(toItem.subVectors(rt.center, eye))
      if (angle < bestAngle) {
        bestAngle = angle
        best = rt
      }
    }
    if (!best) return null
    // visible when the ray towards it meets the item itself, or nothing before it (its middle can fall between
    // two stacked copies); a shelf or a wall in front hides it
    const reach = toItem.subVectors(best.center, eye).length()
    const hit = firstHitAlong(toItem.normalize())
    return hit.display === best || hit.distance >= reach - SEE_THROUGH_SLACK ? best : null
  }

  /** Stores with tags (Cove Home, big furniture): the display closest to the crosshair within reach. */
  function nearestToCrosshair(): DisplayRuntime | null {
    const { x, y, z } = deps.myPosition
    let best: DisplayRuntime | null = null
    let bestScore = Infinity
    for (const rt of runtimes) {
      const dx = rt.center.x - x
      const dz = rt.center.z - z
      const dist = Math.hypot(dx, dz)
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
    return best
  }

  /** Every frame: the display the player aims at, and the department around the player. */
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
    if (withTags) setTarget(nearestToCrosshair())
    else {
      aimClock += dt
      if (aimClock >= AIM_INTERVAL) {
        aimClock = 0
        setTarget(aimedModel(camera))
      }
    }
    const { x, z } = deps.myPosition
    let nearest: DisplayRuntime | null = null
    let nearestDist = Infinity
    for (const rt of runtimes) {
      const dist = Math.hypot(rt.center.x - x, rt.center.z - z)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = rt
      }
    }
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

