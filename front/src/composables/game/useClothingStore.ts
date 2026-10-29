import { computed, ref, shallowRef, type Ref } from 'vue'
import * as THREE from 'three'
import { DEFAULT_SLOT_COLORS } from '../../api/characterCosmetics'
import { fetchAccountInventory } from '../../api/inventory'
import { checkoutShopBasket, fetchItemShopCatalog, type ShopItem } from '../../api/itemShop'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { WEAR_SLOTS, type WearModels, type WearSlot } from '../../avatar/modularCharacterLogic'
import { COVE_THREADS } from '../../game/assets/catalog'
import { openHouseInterior } from '../../game/town/openHouses'
import { createPriceTag, type PriceTagContent } from '../../game/store/priceTag'
import type { ScreenPrompt } from './useInteractionTargets'

interface ThreadsDisplay {
  slot: WearSlot
  key: string
  department: string
  position: [number, number, number]
  yaw: number
  size: [number, number, number]
  tag: { position: [number, number, number]; yaw: number }
}

interface ThreadsLayout {
  counter: [number, number, number]
  departments: Array<{ id: string; label: string }>
  displays: ThreadsDisplay[]
}

export interface ClothesTarget {
  item: ShopItem | null
  name: string
  coins: number | null
  inBasket: boolean
  owned: boolean
  tagPosition: [number, number, number]
}

export interface ClothingStoreDeps {
  inStore: () => boolean
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  myPosition: { x: number; y: number; z: number }
  promptsHidden: () => boolean
  onPurchased: () => void
}

const PICK_DISTANCE = 3.6
const PICK_ANGLE = 0.32
const COUNTER_REACH = 2.2

function wearModelUrl(slot: WearSlot, key: string): string {
  return `/assets/wear/${slot}/${key}/model.glb`
}

function mannequinOutfit(display: ThreadsDisplay): WearModels {
  const models = {} as WearModels
  for (const slot of WEAR_SLOTS) models[slot] = slot === 'hair' || slot === 'head_accessory' ? null : wearModelUrl(slot, 'basic')
  models[display.slot] = wearModelUrl(display.slot, display.key)
  return models
}

function coinsPrice(item: ShopItem | null): number | null {
  return item?.options.find((o) => o.currency === 'coins')?.price ?? null
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
  const runtimes: Array<{ display: ThreadsDisplay; tag: ReturnType<typeof createPriceTag>; center: THREE.Vector3; tagPosition: [number, number, number] }> = []
  const counter = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const toItem = new THREE.Vector3()
  const projection = new THREE.Vector3()
  let attachedTo: THREE.Group | null = null
  let wasInStore = false

  function itemOf(display: ThreadsDisplay): ShopItem | null {
    return itemByModel.value.get(wearModelUrl(display.slot, display.key)) ?? null
  }

  function tagContent(display: ThreadsDisplay): PriceTagContent {
    const item = itemOf(display)
    const label = layout.value?.departments.find((d) => d.id === display.department)?.label ?? display.department
    return {
      name: item?.name ?? display.key,
      department: label,
      description: item && owned.value.has(item.item_def_id) ? 'Already in your wardrobe.' : 'Click to put it in your basket, pay at the counter.',
      price: coinsPrice(item),
    }
  }

  async function refreshCatalogAndOwned(): Promise<void> {
    const [{ items }, inventory] = await Promise.all([fetchItemShopCatalog(), fetchAccountInventory({ kind: 'cosmetic' })])
    itemByModel.value = new Map(items.filter((i) => i.model_glb).map((i) => [i.model_glb!, i]))
    owned.value = new Set(inventory.items.map((row) => row.item.item_def_id))
    for (const rt of runtimes) rt.tag.update(tagContent(rt.display))
  }

  async function attach(group: THREE.Group): Promise<void> {
    if (attachedTo === group) return
    attachedTo = group
    const res = await fetch(COVE_THREADS.interiorLayoutUrl)
    if (!res.ok) throw new Error(`Could not load the Cove Threads layout (${res.status})`)
    layout.value = (await res.json()) as ThreadsLayout
    await refreshCatalogAndOwned()
    const displays = new THREE.Group()
    displays.name = 'ThreadsDisplays'
    group.add(displays)
    group.updateWorldMatrix(true, true)
    for (const display of layout.value.displays) {
      const tag = createPriceTag(tagContent(display))
      tag.object.position.fromArray(display.tag.position)
      tag.object.rotation.y = display.tag.yaw
      displays.add(tag.object)
      const [x, y, z] = display.position
      runtimes.push({
        display,
        tag,
        center: new THREE.Vector3(x, y + display.size[1] / 2, z).applyMatrix4(group.matrixWorld),
        tagPosition: tag.object.getWorldPosition(new THREE.Vector3()).toArray(),
      })
    }
    await Promise.all(layout.value.displays.map(async (display) => {
      const mannequin = await createModularCharacter(mannequinOutfit(display), DEFAULT_SLOT_COLORS, DEFAULT_SLOT_COLORS)
      mannequin.position.fromArray(display.position)
      mannequin.rotation.y = display.yaw
      displays.add(mannequin)
    }))
  }

  function setTarget(next: (typeof runtimes)[number] | null): void {
    for (const rt of runtimes) rt.tag.object.scale.setScalar(rt === next ? 1.18 : 1)
    if (!next) {
      target.value = null
      return
    }
    const item = itemOf(next.display)
    target.value = {
      item,
      name: item?.name ?? next.display.key,
      coins: coinsPrice(item),
      inBasket: item !== null && basket.value.some((b) => b.item_def_id === item.item_def_id),
      owned: item !== null && owned.value.has(item.item_def_id),
      tagPosition: next.tagPosition,
    }
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

  function update(): void {
    const inside = deps.inStore()
    if (wasInStore && !inside) basket.value = []
    wasInStore = inside
    const camera = deps.getCamera()
    if (!inside || !camera || runtimes.length === 0) {
      if (target.value) setTarget(null)
      return
    }
    camera.getWorldDirection(forward)
    const { x, y, z } = deps.myPosition
    let best: (typeof runtimes)[number] | null = null
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
    setTarget(best)
  }

  function toggleTarget(): void {
    const current = target.value
    if (!current) return
    if (!current.item || current.coins === null) {
      feedback.value = { kind: 'error', text: `${current.name} is not on sale yet.` }
      return
    }
    if (current.owned) {
      feedback.value = { kind: 'error', text: `You already own ${current.name}.` }
      return
    }
    const item = current.item
    basket.value = current.inBasket ? basket.value.filter((b) => b.item_def_id !== item.item_def_id) : [...basket.value, item]
    feedback.value = { kind: 'success', text: current.inBasket ? `${item.name} put back.` : `${item.name} is in your basket. Pay at the counter.` }
    target.value = { ...current, inBasket: !current.inBasket }
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
    const at = deps.inStore() && !deps.promptsHidden() && !checkoutOpen.value && isNearCounter() ? counter : null
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
      detail: basket.value.length > 0 ? `${basket.value.length} item(s) · ${basketTotal.value} coins` : 'Basket is empty',
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
    closeCheckout: () => {
      checkoutOpen.value = false
    },
  }
}
