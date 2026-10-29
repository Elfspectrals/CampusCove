import { computed, ref, shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { DEFAULT_SLOT_COLORS, wearModelsFromLoadout, type CharacterCosmeticsState } from '../../api/characterCosmetics'
import { fetchAccountInventory } from '../../api/inventory'
import { checkoutShopBasket, fetchItemShopCatalog, type ShopItem } from '../../api/itemShop'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { updateAvatarAnimation } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { WEAR_SLOTS, wearSignature, type WearModels, type WearSlot } from '../../avatar/modularCharacterLogic'
import { COVE_THREADS } from '../../game/assets/catalog'
import { setPropBlocker } from '../../game/collision/worldCollision'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { openHouseInterior } from '../../game/town/openHouses'
import { createPriceTag, type PriceTagContent } from '../../game/store/priceTag'
import type { ScreenPrompt } from './useInteractionTargets'

type Vec3 = [number, number, number]

interface PieceRef {
  slot: WearSlot
  key: string
}

interface ThreadsDisplay extends PieceRef {
  department: string
  position: Vec3
  yaw: number
  center: Vec3
  tag: { position: Vec3; yaw: number }
}

interface ThreadsOutfit {
  pieces: PieceRef[]
  position: Vec3
  yaw: number
  center: Vec3
  tag: { position: Vec3; yaw: number }
}

interface ThreadsMirror {
  position: Vec3
  yaw: number
  size: [number, number]
}

interface ThreadsLayout {
  counter: Vec3
  clerk: { position: Vec3; yaw: number }
  departments: Array<{ id: string; label: string }>
  displays: ThreadsDisplay[]
  outfits: ThreadsOutfit[]
  mirror: ThreadsMirror
}

export interface ClothesTarget {
  items: ShopItem[]
  name: string
  coins: number | null
  inBasket: boolean
  owned: boolean
  tagPosition: Vec3
}

export interface ClothingStoreDeps {
  inStore: () => boolean
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  myPosition: { x: number; y: number; z: number }
  promptsHidden: () => boolean
  onPurchased: () => void
  getScene: () => THREE.Scene | undefined
  getFpHands: () => THREE.Object3D | null
  myOutfit: () => CharacterCosmeticsState | null
}

interface Runtime {
  pieces: PieceRef[]
  department: string | null
  tag: ReturnType<typeof createPriceTag>
  center: THREE.Vector3
  tagPosition: Vec3
}

const PICK_DISTANCE = 3.6
const PICK_ANGLE = 0.3
const COUNTER_REACH = 2.2
const SHOP_FILL = 0.45
const MIRROR_LAYER = 1
const MIRROR_RANGE = 12
const CLERK_OUTFIT: PieceRef[] = [
  { slot: 'hair', key: 'ponytail' },
  { slot: 'top', key: 'tee' },
  { slot: 'bottom', key: 'joggers' },
  { slot: 'shoes', key: 'sneakers' },
]
/** Store red (build_threads.py IN_ThreadsRed): the clerk wears the brand colour. */
const CLERK_COLORS = { ...DEFAULT_SLOT_COLORS, top: '#d8322b', bottom: '#3b3f4a' }
const CLERK_HEAD_HEIGHT = 2
/** The clerk turns towards a customer closer than this, never further than CLERK_MAX_TURN off the counter. */
const CLERK_NOTICE_RANGE = 6
const CLERK_MAX_TURN = 1.1
const CLERK_TURN_SPEED = 3

function wearModelUrl(slot: WearSlot, key: string): string {
  return `/assets/wear/${slot}/${key}/model.glb`
}

function outfitModels(pieces: PieceRef[]): WearModels {
  const models = {} as WearModels
  for (const slot of WEAR_SLOTS) models[slot] = null
  for (const piece of pieces) models[piece.slot] = wearModelUrl(piece.slot, piece.key)
  return models
}

function coinsPrice(item: ShopItem): number | null {
  return item.options.find((o) => o.currency === 'coins')?.price ?? null
}

function brightenForShop(character: THREE.Object3D): void {
  character.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const own = (Array.isArray(obj.material) ? obj.material : [obj.material]).map((m) => {
      const copy = m.clone()
      if (copy instanceof THREE.MeshStandardMaterial) {
        copy.emissive.copy(copy.color).multiplyScalar(SHOP_FILL)
        copy.emissiveMap = copy.map
      }
      return copy
    })
    obj.material = Array.isArray(obj.material) ? own : own[0]!
    obj.userData.sharedMaterials = false
  })
}

function hideBody(character: THREE.Object3D): void {
  character.traverse((obj) => {
    if (typeof obj.userData.region === 'string') obj.visible = false
  })
}

export function useClothingStore(deps: ClothingStoreDeps) {
  const layout = shallowRef<ThreadsLayout | null>(null)
  const itemByModel = shallowRef<Map<string, ShopItem>>(new Map())
  const owned = ref<Set<number>>(new Set())
  const basket = ref<ShopItem[]>([])
  const target = shallowRef<ClothesTarget | null>(null)
  const checkoutOpen = ref(false)
  const paying = ref(false)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const counterPrompt = ref<ScreenPrompt | null>(null)
  const basketTotal = computed(() => basket.value.reduce((sum, item) => sum + (coinsPrice(item) ?? 0), 0))
  const runtimes: Runtime[] = []
  const counter = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const toItem = new THREE.Vector3()
  const projection = new THREE.Vector3()
  let current: Runtime | null = null
  let attachedTo: THREE.Group | null = null
  let wasInStore = false
  let mirror: Reflector | null = null
  let clerk: THREE.Group | null = null
  let clerkYaw = 0
  const clerkHead = new THREE.Vector3()
  const toCustomer = new THREE.Vector3()
  const mirrorAt = new THREE.Vector3()
  let self: THREE.Group | null = null
  let selfOutfit = ''
  let selfLoading = false
  const lastSelf = new THREE.Vector3()

  function itemsOf(pieces: PieceRef[]): ShopItem[] {
    return pieces.flatMap((p) => {
      const item = itemByModel.value.get(wearModelUrl(p.slot, p.key))
      return item && coinsPrice(item) !== null ? [item] : []
    })
  }

  function inBasket(item: ShopItem): boolean {
    return basket.value.some((b) => b.item_def_id === item.item_def_id)
  }

  function describe(rt: Runtime): ClothesTarget {
    const items = itemsOf(rt.pieces)
    const buyable = items.filter((i) => !owned.value.has(i.item_def_id))
    const single = rt.pieces.length === 1
    return {
      items: buyable,
      name: single ? items[0]?.name ?? rt.pieces[0]!.key : 'Full look',
      coins: items.length === 0 ? null : buyable.reduce((sum, i) => sum + (coinsPrice(i) ?? 0), 0),
      inBasket: buyable.length > 0 && buyable.every(inBasket),
      owned: items.length > 0 && buyable.length === 0,
      tagPosition: rt.tagPosition,
    }
  }

  function tagContent(rt: Runtime): PriceTagContent {
    const t = describe(rt)
    const label = rt.department ? layout.value?.departments.find((d) => d.id === rt.department)?.label ?? rt.department : 'MANNEQUIN'
    const names = itemsOf(rt.pieces).map((i) => i.name).join(' · ')
    return {
      name: t.name,
      department: label,
      description: t.owned ? 'Already in your wardrobe.' : rt.pieces.length > 1 ? `${names}. Click to add the look to your basket.` : 'Click to put it in your basket, pay at the counter.',
      price: t.owned ? itemsOf(rt.pieces).reduce((sum, i) => sum + (coinsPrice(i) ?? 0), 0) : t.coins,
    }
  }

  async function refreshCatalogAndOwned(): Promise<void> {
    const [{ items }, inventory] = await Promise.all([fetchItemShopCatalog(), fetchAccountInventory({ kind: 'cosmetic' })])
    itemByModel.value = new Map(items.filter((i) => i.model_glb).map((i) => [new URL(i.model_glb!, window.location.origin).pathname, i]))
    owned.value = new Set(inventory.items.map((row) => row.item.item_def_id))
    for (const rt of runtimes) rt.tag.update(tagContent(rt))
  }

  function addRuntime(group: THREE.Group, displays: THREE.Group, pieces: PieceRef[], department: string | null, center: Vec3, tagAt: { position: Vec3; yaw: number }): void {
    const rt: Runtime = { pieces, department, tag: createPriceTag({ name: '', department: '', description: '', price: null }), center: new THREE.Vector3(), tagPosition: [0, 0, 0] }
    rt.tag.update(tagContent(rt))
    rt.tag.object.position.fromArray(tagAt.position)
    rt.tag.object.rotation.y = tagAt.yaw
    displays.add(rt.tag.object)
    rt.center.fromArray(center).applyMatrix4(group.matrixWorld)
    rt.tagPosition = rt.tag.object.getWorldPosition(new THREE.Vector3()).toArray()
    runtimes.push(rt)
  }

  async function place(displays: THREE.Group, pieces: PieceRef[], position: Vec3, yaw: number, bodyVisible: boolean): Promise<void> {
    const character = await createModularCharacter(outfitModels(pieces), DEFAULT_SLOT_COLORS, DEFAULT_SLOT_COLORS)
    if (!bodyVisible) hideBody(character)
    brightenForShop(character)
    character.position.fromArray(position)
    character.rotation.y = yaw
    displays.add(character)
  }

  async function attach(group: THREE.Group): Promise<void> {
    if (attachedTo === group) return
    attachedTo = group
    const res = await fetch(COVE_THREADS.interiorLayoutUrl)
    if (!res.ok) throw new Error(`Could not load the Cove Threads layout (${res.status})`)
    const loaded = (await res.json()) as ThreadsLayout
    layout.value = loaded
    await refreshCatalogAndOwned()
    const displays = new THREE.Group()
    displays.name = 'ThreadsDisplays'
    group.add(displays)
    group.updateWorldMatrix(true, true)
    addMirror(group, displays, loaded.mirror)
    void addClerk(group, displays, loaded.clerk)
    for (const d of loaded.displays) addRuntime(group, displays, [{ slot: d.slot, key: d.key }], d.department, d.center, d.tag)
    for (const o of loaded.outfits) addRuntime(group, displays, o.pieces, null, o.center, o.tag)
    await Promise.all([
      ...loaded.displays.map((d) => place(displays, [{ slot: d.slot, key: d.key }], d.position, d.yaw, false)),
      ...loaded.outfits.map((o) => place(displays, o.pieces, o.position, o.yaw, true)),
    ])
  }

  function addMirror(group: THREE.Group, displays: THREE.Group, spec: ThreadsMirror): void {
    const [w, h] = spec.size
    mirror = new Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: 512, textureHeight: 1024, color: 0xc8d0d4 })
    mirror.position.fromArray(spec.position)
    mirror.rotation.y = spec.yaw
    mirror.camera.layers.enable(MIRROR_LAYER)
    mirror.visible = false
    const renderReflection = mirror.onBeforeRender
    mirror.onBeforeRender = (...args) => {
      const hands = deps.getFpHands()
      const handsVisible = hands?.visible ?? false
      if (hands) hands.visible = false
      renderReflection(...args)
      if (hands) hands.visible = handsVisible
    }
    displays.add(mirror)
    mirrorAt.fromArray(spec.position).applyMatrix4(group.matrixWorld)
  }

  /** The shop assistant behind the till, like the clinic nurse: rings up the basket, blocks the way and watches customers. */
  async function addClerk(group: THREE.Group, displays: THREE.Group, spot: ThreadsLayout['clerk']): Promise<void> {
    const character = await createModularCharacter(outfitModels(CLERK_OUTFIT), CLERK_COLORS, DEFAULT_SLOT_COLORS)
    brightenForShop(character)
    character.name = 'ThreadsClerk'
    character.position.fromArray(spot.position)
    character.rotation.y = spot.yaw
    clerkYaw = spot.yaw
    displays.add(character)
    clerk = character
    group.updateWorldMatrix(true, true)
    clerkHead.set(spot.position[0], spot.position[1] + CLERK_HEAD_HEIGHT, spot.position[2]).applyMatrix4(group.matrixWorld)
    const feet = new THREE.Vector3().fromArray(spot.position).applyMatrix4(group.matrixWorld)
    const q = group.getWorldQuaternion(new THREE.Quaternion())
    setPropBlocker('threads_clerk', { cx: feet.x, cy: feet.y + 0.9, cz: feet.z, hx: 0.3, hy: 0.9, hz: 0.3, qx: q.x, qy: q.y, qz: q.z, qw: q.w })
  }

  function updateClerk(dt: number, inside: boolean): void {
    if (!clerk?.parent || !inside) return
    const customer = clerk.parent.worldToLocal(toCustomer.set(deps.myPosition.x, 0, deps.myPosition.z))
    const dx = customer.x - clerk.position.x
    const dz = customer.z - clerk.position.z
    let goal = clerkYaw
    if (Math.hypot(dx, dz) < CLERK_NOTICE_RANGE) {
      const offset = THREE.MathUtils.euclideanModulo(Math.atan2(dx, dz) - clerkYaw + Math.PI, Math.PI * 2) - Math.PI
      goal = clerkYaw + THREE.MathUtils.clamp(offset, -CLERK_MAX_TURN, CLERK_MAX_TURN)
    }
    clerk.rotation.y = THREE.MathUtils.damp(clerk.rotation.y, goal, CLERK_TURN_SPEED, dt)
    updateAvatarAnimation(clerk, dt, 0)
  }

  async function ensureSelf(): Promise<void> {
    const state = deps.myOutfit()
    const scene = deps.getScene()
    if (!state || !scene || selfLoading) return
    const models = wearModelsFromLoadout(state.slots)
    const signature = wearSignature(models, state.colors)
    if (signature === selfOutfit) return
    selfLoading = true
    try {
      const next = await createModularCharacter(models, state.colors, DEFAULT_SLOT_COLORS)
      next.traverse((obj) => obj.layers.set(MIRROR_LAYER))
      next.rotation.order = 'YXZ'
      if (self) {
        self.removeFromParent()
        disposeObject3D(self)
      }
      self = next
      selfOutfit = signature
      scene.add(self)
    } finally {
      selfLoading = false
    }
  }

  function updateMirror(dt: number, inside: boolean, camera: THREE.Camera | undefined): void {
    if (!mirror) return
    const { x, y, z } = deps.myPosition
    const near = inside && camera !== undefined && Math.hypot(mirrorAt.x - x, mirrorAt.z - z) < MIRROR_RANGE
    mirror.visible = near
    if (!near) {
      if (self) self.visible = false
      return
    }
    void ensureSelf()
    if (!self) return
    self.visible = true
    const speed = dt > 0 ? Math.hypot(x - lastSelf.x, z - lastSelf.z) / dt : 0
    lastSelf.set(x, 0, z)
    self.position.set(x, y - EYE_HEIGHT, z)
    self.rotation.y = camera.rotation.y + Math.PI
    updateAvatarAnimation(self, dt, speed)
  }

  function setTarget(next: Runtime | null): void {
    if (next !== current) for (const rt of runtimes) rt.tag.object.scale.setScalar(rt === next ? 1.18 : 1)
    current = next
    target.value = next ? describe(next) : null
  }

  function counterPosition(): THREE.Vector3 | null {
    const interior = openHouseInterior(COVE_THREADS.key)
    if (!interior || !layout.value) return null
    interior.updateWorldMatrix(true, false)
    return counter.fromArray(layout.value.counter).applyMatrix4(interior.matrixWorld)
  }

  function isNearCounter(): boolean {
    const at = counterPosition()
    return at !== null && Math.hypot(at.x - deps.myPosition.x, at.z - deps.myPosition.z) <= COUNTER_REACH
  }

  function update(dt: number): void {
    const inside = deps.inStore()
    if (wasInStore && !inside) basket.value = []
    wasInStore = inside
    const camera = deps.getCamera()
    updateMirror(dt, inside, camera)
    updateClerk(dt, inside)
    if (!inside || !camera || runtimes.length === 0) {
      if (current) setTarget(null)
      return
    }
    camera.getWorldDirection(forward)
    const { x, y, z } = deps.myPosition
    let best: Runtime | null = null
    let bestScore = Infinity
    for (const rt of runtimes) {
      const dist = Math.hypot(rt.center.x - x, rt.center.z - z)
      if (dist > PICK_DISTANCE) continue
      const angle = forward.angleTo(toItem.set(rt.center.x - x, rt.center.y - y, rt.center.z - z).normalize())
      if (angle > PICK_ANGLE) continue
      const score = angle + dist * 0.04
      if (score < bestScore) {
        bestScore = score
        best = rt
      }
    }
    if (best !== current) setTarget(best)
  }

  function toggleTarget(): void {
    if (!current) return
    const t = describe(current)
    if (t.coins === null) {
      feedback.value = { kind: 'error', text: `${t.name} is not on sale yet.` }
      return
    }
    if (t.owned) {
      feedback.value = { kind: 'error', text: current.pieces.length > 1 ? 'You already own this whole look.' : `You already own ${t.name}.` }
      return
    }
    if (t.inBasket) {
      basket.value = basket.value.filter((b) => !t.items.some((i) => i.item_def_id === b.item_def_id))
      feedback.value = { kind: 'success', text: `${t.name} put back.` }
    } else {
      basket.value = [...basket.value, ...t.items.filter((i) => !inBasket(i))]
      feedback.value = { kind: 'success', text: `${t.name} is in your basket. Pay at the counter.` }
    }
    setTarget(current)
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
      feedback.value = { kind: 'success', text: 'Paid! Your new clothes are in your wardrobe (inventory).' }
      basket.value = []
      checkoutOpen.value = false
      deps.onPurchased()
      await refreshCatalogAndOwned()
    } catch (e) {
      feedback.value = { kind: 'error', text: e instanceof Error ? e.message : 'Payment failed.' }
    } finally {
      paying.value = false
    }
  }

  function removeFromBasket(item: ShopItem): void {
    basket.value = basket.value.filter((b) => b.item_def_id !== item.item_def_id)
  }

  function updatePrompt(): void {
    const at = deps.inStore() && !deps.promptsHidden() && !checkoutOpen.value && isNearCounter() ? (clerk ? clerkHead : counter) : null
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!at || !camera || !canvas || projection.copy(at).project(camera).z > 1) {
      counterPrompt.value = null
      return
    }
    const rect = canvas.getBoundingClientRect()
    counterPrompt.value = {
      x: (projection.x * 0.5 + 0.5) * rect.width,
      y: (-projection.y * 0.5 + 0.5) * rect.height,
      action: 'Pay',
      detail: basket.value.length > 0 ? `Clerk · ${basket.value.length} item(s) · ${basketTotal.value} coins` : 'Clerk · basket is empty',
    }
  }

  return {
    target: target as Readonly<Ref<ClothesTarget | null>>,
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
    tryOpenCheckout,
    pay,
    removeFromBasket,
    refreshOwned: refreshCatalogAndOwned,
    closeCheckout: () => {
      checkoutOpen.value = false
    },
  }
}
