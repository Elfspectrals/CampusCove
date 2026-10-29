import { ref, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { fetchItemShopCatalog, purchaseShopItem, type ShopItem } from '../../api/itemShop'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { isAimingAtNurse } from '../../game/clinic'
import { FULL_STATS } from '../../game/survival'
import type { WorldManifest } from '../../game/world/worldManifest'
import { isMedicalItem } from '../../utils/itemShopPresentation'
import type { ScreenPrompt } from './useInteractionTargets'

const PHARMACY_REACH = 2.2
const PHARMACY_PROMPT_HEIGHT = 1.15
const NURSE_PROMPT_HEIGHT = 2
const CONSULTATION_COINS = 30

type ClinicLayout = NonNullable<WorldManifest['clinic']>

export interface ClinicDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  refreshInventory: () => void
  health: () => number | null
  say: (text: string) => void
}

export function useClinic(deps: ClinicDeps) {
  const menuOpen = ref(false)
  const menu = ref<ShopItem[]>([])
  const loading = ref(false)
  const buyingId = ref<number | null>(null)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const prompt = ref<ScreenPrompt | null>(null)
  let layout: ClinicLayout | null = null
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.clinic ?? null
  }

  watch(deps.gameRoomRef, (room) => {
    room?.onMessage('clinic_healed', (data: { billed: number; balanceAfter: number | null }) => {
      if (typeof data.balanceAfter === 'number') applyCachedBalanceAfterPurchase('coins', data.balanceAfter)
      deps.say(`The nurse patched you up: full health for ${data.billed} coins.`)
    })
  })

  function isNearPharmacy(): boolean {
    if (!layout) return false
    const [px, , pz] = layout.pharmacy
    return Math.hypot(px - deps.myPosition.x, pz - deps.myPosition.z) <= PHARMACY_REACH
  }

  function canConsult(): boolean {
    const health = deps.health()
    return health !== null && health < FULL_STATS.health
  }

  function isAimingNurse(): boolean {
    const camera = deps.getCamera()
    if (!layout || !camera) return false
    camera.getWorldDirection(forward)
    return isAimingAtNurse(deps.myPosition, forward, layout.nurse)
  }

  async function loadMenu(): Promise<void> {
    loading.value = true
    try {
      const { items } = await fetchItemShopCatalog()
      menu.value = items.filter((item) => isMedicalItem(item) && item.options.some((o) => o.currency === 'coins'))
    } catch {
      feedback.value = { kind: 'error', text: 'The pharmacy could not be loaded.' }
    } finally {
      loading.value = false
    }
  }

  function tryInteract(): boolean {
    if (isAimingNurse() && canConsult()) {
      deps.gameRoomRef.value?.send('clinic_heal')
      return true
    }
    if (!isNearPharmacy()) return false
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
      feedback.value = { kind: 'success', text: `${item.name} is in your hotbar. Click to use it.` }
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

  function projectToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(x, y, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height }
  }

  function currentPrompt(): ScreenPrompt | null {
    if (!layout || deps.promptsHidden() || menuOpen.value) return null
    if (isAimingNurse() && canConsult()) {
      const [nx, ny, nz] = layout.nurse
      const screen = projectToScreen(nx, ny + NURSE_PROMPT_HEIGHT, nz)
      return screen && { ...screen, action: 'Consultation', detail: `${CONSULTATION_COINS} coins (full heal)` }
    }
    if (isNearPharmacy()) {
      const [px, py, pz] = layout.pharmacy
      const screen = projectToScreen(px, py + PHARMACY_PROMPT_HEIGHT, pz)
      return screen && { ...screen, action: 'Order', detail: 'Cove Clinic pharmacy' }
    }
    return null
  }

  function updatePrompt(): void {
    prompt.value = currentPrompt()
  }

  return { menuOpen, menu, loading, buyingId, feedback, prompt, onTownLoaded, tryInteract, buy, close, updatePrompt }
}
