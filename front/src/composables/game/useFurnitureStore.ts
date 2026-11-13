import { computed, ref, shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import type { CosmeticColors } from '../../api/characterCosmetics'
import { fetchAccountInventory } from '../../api/inventory'
import { checkoutShopBasket, fetchItemShopCatalog, type ShopItem } from '../../api/itemShop'
import type { StoreDisplay, StoreLayout } from '../../game/assets/catalog'
import { createGltfLoader } from '../../game/gltfLoaderFactory'
import { instancedParts, stackPlacements } from '../../game/mallTemplates/templateProps'
import { configureRoomMeshShadows } from '../../game/sceneLighting'
import { freshDisplayGroup } from '../../game/store/displayGroup'
import { createStoreClerk, type ClerkPiece } from '../../game/store/storeClerk'
import type { CartItem } from '../../game/store/shopCart'
import { openHouseInterior } from '../../game/town/openHouses'
import type { ScreenPrompt } from './useInteractionTargets'
import type { CartPayer, ShopCart } from './useShopCart'

/** The item the player is looking at in the store. */
export interface StoreTarget {
  display: StoreDisplay
  /** Shop listing for `display.code`; null when the item is not on sale. */
  item: ShopItem | null
  name: string
  departmentLabel: string
  coins: number | null
  /** How many are in the cart from this store (stores with a counter); a click adds one more. */
  inCart: number
  owned: boolean
  /** World position of the prompt, just above the model. */
  promptPosition: [number, number, number]
}

export interface FurnitureStoreDeps {
  /** True while the player is inside this store. */
  inStore: () => boolean
  getCamera: () => THREE.Camera | undefined
  myPosition: { x: number; y: number; z: number }
  /** The store this instance serves; Cove Home (decor models) when omitted. */
  store: FurnitureStoreSpec
  /** Stores with a counter draw the "Pay" prompt on the canvas and refresh the inventory after paying. */
  canvasRef?: Ref<HTMLCanvasElement | null>
  /** The cart shared by every store with a counter; each store's lines are paid at its own cashier. */
  cart: ShopCart
  promptsHidden?: () => boolean
  onPurchased?: () => void
}

interface FurnitureStoreSpec {
  key: string
  /** Shop name in the cart. */
  name: string
  interiorLayoutUrl?: string
  layout?: StoreLayout
  clerkOutfit?: ClerkPiece[]
  clerkBrighten?: boolean
  /** GLB shown on the display spot (a decor piece, a food item...). */
  modelUrl: (display: StoreDisplay) => string
  /** Uniform colours of the cashier; a store whose layout has a `counter` sells through the cart, paid there. */
  clerkColors?: CosmeticColors
  coinPrices?: ReadonlyMap<string, number>
  checkout?: CartPayer
}

/** Furthest (XZ, metres) an item can be picked from. */
const PICK_DISTANCE = 4.2
/** The crosshair may miss a small item by this much (radians) if nothing hides it. */
const AIM_SLACK = 0.09
/** Seconds between two raycasts of the aim (the interior meshes are big merged nodes). */
const AIM_INTERVAL = 0.08
/** A hit this close before an item's middle still counts as the item (its own shelf, the copy next to it). */
const SEE_THROUGH_SLACK = 0.15
const COUNTER_REACH = 2.2
const PROMPT_LIFT = 0.18
const HIGHLIGHT = new THREE.Color(0x3a3a2a)
const INSTANCE_HIGHLIGHT = new THREE.Color(1.6, 1.6, 1.35)
const INSTANCE_PLAIN = new THREE.Color(1, 1, 1)

interface DisplayRuntime {
  display: StoreDisplay
  /** Look-at point (middle of the model), world space. */
  center: THREE.Vector3
  promptPosition: [number, number, number]
  /** The display's own material copies (shared by its stacked copies), lit up while it is aimed at. */
  materials: THREE.MeshStandardMaterial[]
  instances: Array<{ mesh: THREE.InstancedMesh; id: number }>
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
 * looking at so a click buys it (Cove Home) or adds one to the cart (stores with a counter). Cove Home draws an
 * IKEA-style price tag next to each piece; the mall stores show the model alone, its name and price come up in the
 * item card while it is aimed at.
 */
export function useFurnitureStore(deps: FurnitureStoreDeps) {
  const loader = createGltfLoader()
  const store = deps.store
  const layout = shallowRef<StoreLayout | null>(null)
  const catalogByCode = shallowRef<Map<string, ShopItem>>(new Map())
  const ownedCosmetics = shallowRef<Set<number>>(new Set())
  const target = shallowRef<StoreTarget | null>(null)
  const currentDepartment = ref<string | null>(null)
  const cart = deps.cart
  const counterPrompt = ref<ScreenPrompt | null>(null)
  const hasCounter = computed(() => layout.value?.counter !== undefined)
  const clerk = store.clerkColors ? createStoreClerk(store.key, store.clerkColors, { outfit: store.clerkOutfit, brighten: store.clerkBrighten }) : null
  const runtimes: DisplayRuntime[] = []
  let attachedTo: THREE.Group | null = null
  let attachToken = 0
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
    if (store.layout) {
      layout.value = store.layout
      return layout.value
    }
    if (!store.interiorLayoutUrl) throw new Error(`Store ${store.key} has neither a layout nor a layout URL`)
    const res = await fetch(store.interiorLayoutUrl)
    if (!res.ok) throw new Error(`Could not load the store layout (${res.status})`)
    layout.value = (await res.json()) as StoreLayout
    return layout.value
  }

  async function refreshCatalog(): Promise<void> {
    try {
      const sellsWear = store.layout?.displays.some((d) => d.figure) ?? false
      const [{ items }, cosmetics] = await Promise.all([
        fetchItemShopCatalog(),
        sellsWear ? fetchAccountInventory({ kind: 'cosmetic' }).catch((error: unknown) => console.warn('[store] owned clothes unknown', error)) : null,
      ])
      catalogByCode.value = new Map(items.map((item) => [item.code, withStorePrice(item)]))
      if (cosmetics) ownedCosmetics.value = new Set(cosmetics.items.map((row) => row.item.item_def_id))
    } catch (error) {
      console.warn('[store] catalogue failed to load, tags show no prices', error)
    }
  }

  function withStorePrice(item: ShopItem): ShopItem {
    const price = store.coinPrices?.get(item.code)
    if (price === undefined) return item
    return { ...item, options: item.options.map((option) => (option.currency === 'coins' ? { ...option, price } : option)) }
  }

  function coinsPrice(item: ShopItem | null): number | null {
    return item?.options.find((o) => o.currency === 'coins')?.price ?? null
  }

  /** The model on its spot; a `stack` lines up copies in a grid so small goods read as a filled shelf. */
  async function placeModel(group: THREE.Group, rt: DisplayRuntime, index: number): Promise<void> {
    const { display } = rt
    if (display.figure || display.shelfSlot) return
    try {
      const gltf = await loader.loadAsync(store.modelUrl(display))
      rt.materials = ownMaterials(gltf.scene)
      const [w, , d] = display.size
      const spot = new THREE.Group()
      spot.name = `StoreDisplay_${display.key}`
      spot.userData.storeDisplay = index
      spot.position.fromArray(display.position)
      spot.rotation.y = display.yaw
      const scale = new THREE.Matrix4().makeScale(...(display.scale ?? [1, 1, 1]))
      for (const part of instancedParts(gltf.scene, stackPlacements(display.stack ?? [1, 1], { x: w, z: d }).map((at) => at.multiply(scale)))) {
        part.userData.sharedGeometry = false
        part.userData.sharedMaterials = false
        spot.add(part)
      }
      configureRoomMeshShadows(spot)
      group.add(spot)
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
    if (attachedTo === group) return
    attachedTo = group
    runtimes.length = 0
    const displays = freshDisplayGroup(group, 'StoreDisplays')
    group.updateWorldMatrix(true, true)
    if (storeLayout.clerk && clerk) void clerk.attach(group, displays, storeLayout.clerk)
    for (const display of storeLayout.displays) {
      const [x, y, z] = display.position
      const center = new THREE.Vector3(x, y + display.size[1] / 2, z).applyMatrix4(group.matrixWorld)
      const promptPosition = new THREE.Vector3(x, y + display.size[1] + PROMPT_LIFT, z).applyMatrix4(group.matrixWorld).toArray()
      runtimes.push({ display, center, promptPosition, materials: [], instances: [] })
    }
    await Promise.all(runtimes.map((rt, i) => placeModel(displays, rt, i)))
  }

  function setTarget(next: DisplayRuntime | null): void {
    const current = target.value?.display
    if ((next?.display ?? null) === (current ?? null)) return
    for (const rt of runtimes) {
      for (const m of rt.materials) {
        m.emissive.copy(m.userData.baseEmissive as THREE.Color)
        if (rt === next) m.emissive.add(HIGHLIGHT)
      }
      for (const { mesh, id } of rt.instances) {
        mesh.setColorAt(id, rt === next ? INSTANCE_HIGHLIGHT : INSTANCE_PLAIN)
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
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
      inCart: item ? cart.quantityOf(store.key, item.shop_catalog_item_id) : 0,
      owned: item ? ownedCosmetics.value.has(item.item_def_id) : false,
      promptPosition: next.promptPosition,
    }
  }

  function cartItem(item: ShopItem): CartItem {
    return {
      shopCatalogItemId: item.shop_catalog_item_id,
      itemDefId: item.item_def_id,
      name: item.name,
      previewImage: item.preview_image,
      unitPrice: coinsPrice(item) ?? 0,
      oneAtATime: item.kind === 'cosmetic',
    }
  }

  function inCart(item: ShopItem): number {
    return cart.quantityOf(store.key, item.shop_catalog_item_id)
  }

  function bindFigure(propId: string, figure: THREE.Object3D): void {
    runtimes.forEach((rt, index) => {
      if (rt.display.figure?.prop !== propId) return
      const slotMaterial = new RegExp(`^W_${rt.display.figure.slot}_`)
      figure.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return
        const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material]
        if (!materials.some((m) => slotMaterial.test(m.name))) return
        obj.userData.storeDisplay = index
        obj.userData.sharedMaterials = false
        rt.materials.push(...ownMaterials(obj))
      })
    })
  }

  function bindShelfGoods(propId: string, goods: THREE.InstancedMesh): void {
    const slots = goods.userData.shelfSlots as string[]
    const displays = slots.map((slot) => {
      const index = runtimes.findIndex((rt) => rt.display.shelfSlot?.prop === propId && rt.display.shelfSlot.slot === slot)
      if (index === -1) throw new Error(`${store.key}: no display for shelf ${propId} slot ${slot}`)
      return index
    })
    goods.userData.instanceDisplays = displays
    displays.forEach((index, id) => runtimes[index]!.instances.push({ mesh: goods, id }))
  }

  /** Shift-click on a dressed mannequin: every piece of the look the player does not own or carry yet. */
  function addLook(current: StoreTarget): void {
    const look = current.display.figure?.prop
    const lookItems = runtimes
      .filter((rt) => rt.display.figure?.prop === look)
      .map((rt) => catalogByCode.value.get(rt.display.code))
      .filter((item): item is ShopItem => !!item && coinsPrice(item) !== null && !ownedCosmetics.value.has(item.item_def_id))
    const missing = lookItems.filter((item) => inCart(item) === 0)
    if (lookItems.length === 0) cart.notify({ kind: 'error', key: 'cart.lookOwned' })
    else if (missing.length === 0) cart.notify({ kind: 'error', key: 'cart.lookInCart' })
    else {
      for (const item of missing) cart.add(store.key, store.name, cartItem(item))
      cart.notify({ kind: 'success', key: 'cart.lookAdded', params: { names: missing.map((p) => p.name).join(', ') } })
    }
    target.value = { ...current, inCart: current.item ? inCart(current.item) : 0 }
  }

  /** Click on a display in a store with a counter: one more in the cart (Shift on a mannequin: the whole look). */
  function addTarget(wholeLook = false): void {
    const current = target.value
    if (!current) return
    if (wholeLook && current.display.figure) {
      addLook(current)
      return
    }
    if (!current.item || current.coins === null) {
      cart.notify({ kind: 'error', key: 'cart.notOnSale', params: { name: current.name } })
      return
    }
    if (current.owned) {
      cart.notify({ kind: 'error', key: 'cart.owned', params: { name: current.name } })
      return
    }
    const before = inCart(current.item)
    const now = cart.add(store.key, store.name, cartItem(current.item))
    if (now === before) cart.notify({ kind: 'error', key: before === 1 ? 'cart.onlyOne' : 'cart.lineFull', params: { name: current.name } })
    else cart.notify({ kind: 'success', key: 'cart.added', params: { name: current.name, n: now } })
    target.value = { ...current, inCart: now }
  }

  function counterPosition(): THREE.Vector3 | null {
    const interior = attachedTo ?? openHouseInterior(store.key)
    if (!interior || !layout.value?.counter) return null
    interior.updateWorldMatrix(true, false)
    return counter.fromArray(layout.value.counter).applyMatrix4(interior.matrixWorld)
  }

  function isNearCounter(): boolean {
    const at = counterPosition()
    return at !== null && Math.hypot(at.x - deps.myPosition.x, at.z - deps.myPosition.z) <= COUNTER_REACH
  }

  /** Use at the counter: the cart opens with this store's lines payable here. */
  function tryOpenCheckout(): boolean {
    if (!deps.inStore() || !isNearCounter()) return false
    cart.openAtCounter(store.key, pay)
    return true
  }

  async function pay(lines: Array<{ id: number; quantity: number }>, checkoutKey: string): Promise<void> {
    await (store.checkout ?? checkoutShopBasket)(lines, checkoutKey)
    deps.onPurchased?.()
    await refreshCatalog()
  }

  /** The "Pay" prompt over the cashier (or the counter) while the player stands at the counter. */
  function updatePrompt(): void {
    const near = deps.inStore() && isNearCounter()
    if (!near) cart.leaveCounter(store.key)
    const at = near && !deps.promptsHidden?.() && !cart.open.value ? (clerk?.present ? clerk.head : counter) : null
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
      detail: cart.shopCount(store.key) > 0 ? `Cashier · ${cart.shopCount(store.key)} in your cart · ${cart.shopTotal(store.key)} coins` : 'Cashier · open your cart',
    }
  }

  /** The display whose model the first thing hit along `direction` belongs to (shelves and walls hide what is behind). */
  function firstHitAlong(direction: THREE.Vector3): { display: DisplayRuntime | null; distance: number } {
    if (!attachedTo) return { display: null, distance: Infinity }
    raycaster.set(eye, direction)
    raycaster.far = PICK_DISTANCE + 1
    const hit = raycaster.intersectObject(attachedTo, true).find((h) => isShown(h.object, attachedTo!) && !isSeeThrough(h.object))
    if (!hit) return { display: null, distance: Infinity }
    const instanceDisplays = hit.object.userData.instanceDisplays as number[] | undefined
    if (instanceDisplays && hit.instanceId !== undefined) return { display: runtimes[instanceDisplays[hit.instanceId]!] ?? null, distance: hit.distance }
    for (let obj: THREE.Object3D | null = hit.object; obj; obj = obj.parent) {
      const index = obj.userData.storeDisplay
      if (typeof index === 'number') return { display: runtimes[index] ?? null, distance: hit.distance }
    }
    return { display: null, distance: hit.distance }
  }

  /** The model under the crosshair, else a model just next to it that nothing hides. */
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

  /** Every frame: the display the player aims at, and the department around the player. */
  function update(dt = 0): void {
    const inside = deps.inStore()
    clerk?.update(dt, inside, deps.myPosition)
    const camera = deps.getCamera()
    if (!inside || !camera || runtimes.length === 0) {
      if (target.value) setTarget(null)
      currentDepartment.value = null
      return
    }
    camera.getWorldDirection(forward)
    aimClock += dt
    if (aimClock >= AIM_INTERVAL) {
      aimClock = 0
      setTarget(aimedModel(camera))
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
    refreshOwned: refreshCatalog,
    target: target as Readonly<Ref<StoreTarget | null>>,
    currentDepartment,
    hasCounter,
    counterPrompt,
    attach,
    update,
    updatePrompt,
    addTarget,
    bindFigure,
    bindShelfGoods,
    tryOpenCheckout,
  }
}

