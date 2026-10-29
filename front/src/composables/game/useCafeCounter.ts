import { ref, type Ref } from 'vue'
import * as THREE from 'three'
import { fetchItemShopCatalog, purchaseShopItem, type ShopItem } from '../../api/itemShop'
import { openHouseInterior } from '../../game/town/openHouses'
import { isFoodItem, isMedicalItem } from '../../utils/itemShopPresentation'
import type { ScreenPrompt } from './useInteractionTargets'

const CAFE_KEY = 'cafe'
/** Customer side of the barista bar, in the cafe interior's own space (work/cafe/interior.layout.json). */
const COUNTER_LOCAL = new THREE.Vector3(4.6, 1.15, -2)
const COUNTER_REACH = 2.2

export interface CafeCounterDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  promptsHidden: () => boolean
  refreshInventory: () => void
}

/** The Campus Cafe counter: walk up to the bar, click, pick food and drinks (paid in coins). */
export function useCafeCounter(deps: CafeCounterDeps) {
  const menuOpen = ref(false)
  const menu = ref<ShopItem[]>([])
  const loading = ref(false)
  const buyingId = ref<number | null>(null)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const prompt = ref<ScreenPrompt | null>(null)
  const counter = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function counterPosition(): THREE.Vector3 | null {
    const interior = openHouseInterior(CAFE_KEY)
    if (!interior) return null
    interior.updateWorldMatrix(true, false)
    return counter.copy(COUNTER_LOCAL).applyMatrix4(interior.matrixWorld)
  }

  function isNearCounter(): boolean {
    const at = counterPosition()
    return at !== null && Math.hypot(at.x - deps.myPosition.x, at.z - deps.myPosition.z) <= COUNTER_REACH
  }

  async function loadMenu(): Promise<void> {
    loading.value = true
    try {
      const { items } = await fetchItemShopCatalog()
      menu.value = items.filter((item) => isFoodItem(item) && !isMedicalItem(item) && item.options.some((o) => o.currency === 'coins'))
    } catch {
      feedback.value = { kind: 'error', text: 'The menu could not be loaded.' }
    } finally {
      loading.value = false
    }
  }

  /** Interact at the bar. Returns true when the player stands at the counter. */
  function tryOpen(): boolean {
    if (!isNearCounter()) return false
    if (document.pointerLockElement) document.exitPointerLock()
    feedback.value = null
    menuOpen.value = true
    if (menu.value.length === 0) void loadMenu()
    return true
  }

  async function buy(item: ShopItem): Promise<void> {
    const option = item.options.find((o) => o.currency === 'coins')
    if (!option || buyingId.value !== null) return
    buyingId.value = item.item_def_id
    try {
      await purchaseShopItem({ shop_catalog_item_id: option.shop_catalog_item_id, currency: 'coins' })
      feedback.value = { kind: 'success', text: `${item.name} is in your hotbar. Click to eat or drink it.` }
      deps.refreshInventory()
    } catch (e) {
      feedback.value = { kind: 'error', text: e instanceof Error ? e.message : 'Purchase failed.' }
    } finally {
      buyingId.value = null
    }
  }

  function close(): void {
    menuOpen.value = false
  }

  function updatePrompt(): void {
    if (deps.promptsHidden() || menuOpen.value || !isNearCounter()) {
      prompt.value = null
      return
    }
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return
    projection.copy(counter).project(camera)
    if (projection.z > 1) {
      prompt.value = null
      return
    }
    const rect = canvas.getBoundingClientRect()
    prompt.value = {
      x: (projection.x * 0.5 + 0.5) * rect.width,
      y: (-projection.y * 0.5 + 0.5) * rect.height,
      action: 'Order',
      detail: 'Campus Cafe',
    }
  }

  return { menuOpen, menu, loading, buyingId, feedback, prompt, tryOpen, buy, close, updatePrompt }
}
