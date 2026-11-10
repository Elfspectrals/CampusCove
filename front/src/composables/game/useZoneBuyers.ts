import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { wholeApples } from '../../game/orchard'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import type { Vec3 } from '../../game/mallTemplates/mallTemplate.ts'
import type { SaleArea } from '../../game/zoneDecor/zoneDecor.ts'
import type { ApartmentInventoryItem, ZoneSellErrorPayload, ZoneSoldPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const BUYER_REACH = 2.8
const SELL_TIMEOUT_MS = 10_000
const PROMPT_HEIGHT = 2.2

export interface ZoneBuyer {
  zone: string
  area: SaleArea
  position: Vec3
}

export interface ZoneBuyersDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  itemByCode: () => Record<string, ApartmentInventoryItem>
  refreshInventory: () => void
  buyers: () => readonly ZoneBuyer[]
}

export function useZoneBuyers(deps: ZoneBuyersDeps) {
  const openBuyer = shallowRef<ZoneBuyer | null>(null)
  const selling = ref(false)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function aimed(): ZoneBuyer | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    return deps.buyers().find((b) => isAimingAtNpc(deps.myPosition, forward, b.position, BUYER_REACH)) ?? null
  }

  function held(code: string): number {
    return wholeApples(deps.itemByCode()[code])
  }

  function itemName(code: string): string {
    return deps.itemByCode()[code]?.name ?? code.replace(/^[a-z]+_/, '').replace(/_/g, ' ')
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

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || openBuyer.value) return null
    const buyer = aimed()
    if (!buyer) return null
    const [x, y, z] = buyer.position
    const screen = projectToScreen(x, y + PROMPT_HEIGHT, z)
    return screen && { ...screen, action: `Sell to ${buyer.area.name}`, detail: `Buys ${buyer.area.offers.map((o) => itemName(o.code)).join(', ')}` }
  }

  function interact(): boolean {
    if (openBuyer.value) return false
    const buyer = aimed()
    if (!buyer) return false
    if (document.pointerLockElement) document.exitPointerLock()
    feedback.value = null
    openBuyer.value = buyer
    return true
  }

  let sellTimer: ReturnType<typeof setTimeout> | undefined

  function settle(): void {
    clearTimeout(sellTimer)
    selling.value = false
  }

  function sell(code: string, quantity: number): void {
    const buyer = openBuyer.value
    const room = deps.gameRoomRef.value
    if (selling.value || !buyer) return
    if (!room) {
      feedback.value = { kind: 'error', text: 'Not connected to the game server.' }
      return
    }
    selling.value = true
    sellTimer = setTimeout(() => {
      selling.value = false
      feedback.value = { kind: 'error', text: 'The buyer did not answer. Check your coins and inventory before selling again.' }
    }, SELL_TIMEOUT_MS)
    room.send('zone_sell', { zone: buyer.zone, area: buyer.area.id, code, quantity })
  }

  function onSold(data: ZoneSoldPayload): void {
    settle()
    applyCachedBalanceAfterPurchase('coins', data.balance_after)
    deps.refreshInventory()
    const rest = data.full_price_left > 0 ? `${data.full_price_left} more at full price today` : 'the lower price applies until tomorrow'
    feedback.value = { kind: 'success', text: `Sold ${data.sold} · +${data.coins} coins · ${rest}` }
  }

  function onError(data: ZoneSellErrorPayload): void {
    settle()
    feedback.value = { kind: 'error', text: data.message }
  }

  function close(): void {
    openBuyer.value = null
  }

  const source: InteractionSource = { prompt, interact }

  return { openBuyer, selling, feedback, held, itemName, sell, close, source, handlers: { onSold, onError } }
}
