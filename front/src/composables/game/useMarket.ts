import { ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { fetchOfferable, type OfferableItem } from '../../api/trades'
import { aimedTarget, type AimTarget } from '../../game/market/marketAim.ts'
import { lotAimPoint, ownStallNo } from '../../game/market/marketStalls.ts'
import type { SfxName } from '../../game/sfx'
import type { MarketDonePayload, MarketErrorPayload, MarketLotContainer, MarketLotView, MarketSnapshot, MarketSoldPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'
import type { MarketStallAnchor } from './useMarketStalls'

const LOT_REACH = 2.4
const LOT_AIM_ANGLE = 0.12
const STALL_REACH = 2.6
const STALL_AIM_ANGLE = 0.6
const STALL_AIM_HEIGHT = 1.3
const PROMPT_LIFT = 0.45
const ANSWER_TIMEOUT_MS = 10_000
const ANNOUNCEMENT_MS = 6_000
const CLOSING_WARNING_MS = 15 * 60_000

export type MarketPanel = { kind: 'claim'; stallNo: number } | { kind: 'seller'; stallNo: number } | { kind: 'buy'; stallNo: number; lotId: number }
type MarketIntent =
  | { action: 'claim'; stallNo: number; canopy: string }
  | { action: 'list'; slot: number; code: string; quantity: number; unitPrice: number; container: MarketLotContainer }
  | { action: 'withdraw'; lotId: number }
  | { action: 'buy'; lotId: number; quantity: number }
type Aimed = { kind: 'lot'; stallNo: number; lot: MarketLotView } | { kind: 'claim' | 'seller'; stallNo: number }

export interface MarketDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  market: () => MarketSnapshot | null
  stalls: () => readonly MarketStallAnchor[]
  myAccountId: () => number | null
  t: (key: string, params?: Record<string, unknown>) => string
  playSound: (name: SfxName) => void
  refreshInventory: () => void
}

export function useMarket(deps: MarketDeps) {
  const panel = shallowRef<MarketPanel | null>(null)
  const pending = ref(false)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const offerable = shallowRef<OfferableItem[] | null>(null)
  const announcement = ref<string | null>(null)
  const forward = new THREE.Vector3()
  const world = new THREE.Vector3()
  let request = 0
  let answerTimer: ReturnType<typeof setTimeout> | undefined
  let announcementTimer: ReturnType<typeof setTimeout> | undefined
  let closingTimer: ReturnType<typeof setTimeout> | undefined
  let lastBuyQuantity = 0

  function anchorPoint(anchor: THREE.Object3D, local: readonly number[]): [number, number, number] {
    world.fromArray(local)
    anchor.localToWorld(world)
    return [world.x, world.y, world.z]
  }

  function aimed(): Aimed | null {
    const market = deps.market()
    const camera = deps.getCamera()
    if (!market?.open || !camera) return null
    camera.getWorldDirection(forward)
    const mine = ownStallNo(market, deps.myAccountId())
    const lots: AimTarget<Aimed>[] = []
    const stalls: AimTarget<Aimed>[] = []
    for (const { stallNo, anchor } of deps.stalls()) {
      const stall = market.stalls.find((s) => s.stall_no === stallNo)
      const stallPoint = anchorPoint(anchor, [0, STALL_AIM_HEIGHT, 0])
      if (!stall) {
        if (mine === null) stalls.push({ point: stallPoint, value: { kind: 'claim', stallNo } })
        continue
      }
      if (stall.stall_no === mine) {
        stalls.push({ point: stallPoint, value: { kind: 'seller', stallNo } })
        continue
      }
      for (const lot of stall.lots) lots.push({ point: anchorPoint(anchor, lotAimPoint(lot.slot)), value: { kind: 'lot', stallNo, lot } })
    }
    return aimedTarget(deps.myPosition, forward, lots, LOT_REACH, LOT_AIM_ANGLE) ?? aimedTarget(deps.myPosition, forward, stalls, STALL_REACH, STALL_AIM_ANGLE)
  }

  function screenOf(point: [number, number, number]): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    const projected = new THREE.Vector3(point[0], point[1] + PROMPT_LIFT, point[2]).project(camera)
    if (projected.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projected.x * 0.5 + 0.5) * rect.width, y: (-projected.y * 0.5 + 0.5) * rect.height }
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || panel.value) return null
    const target = aimed()
    if (!target) return null
    const anchor = deps.stalls().find((s) => s.stallNo === target.stallNo)!.anchor
    if (target.kind === 'lot') {
      const at = screenOf(anchorPoint(anchor, lotAimPoint(target.lot.slot)))
      const detail = deps.t('market.lotPrompt', { name: target.lot.name, price: target.lot.unit_price, left: target.lot.quantity })
      return at && { ...at, action: deps.t('market.lotAction'), detail }
    }
    const at = screenOf(anchorPoint(anchor, [0, STALL_AIM_HEIGHT, 0]))
    const action = target.kind === 'claim' ? deps.t('market.takePrompt', { fee: deps.market()!.stall_fee }) : deps.t('market.ownPrompt')
    return at && { ...at, action }
  }

  async function reloadOfferable(): Promise<void> {
    try {
      offerable.value = (await fetchOfferable()).items
    } catch (err) {
      feedback.value = { kind: 'error', text: err instanceof Error ? err.message : String(err) }
    }
  }

  function open(next: MarketPanel): void {
    if (document.pointerLockElement) document.exitPointerLock()
    feedback.value = null
    panel.value = next
    if (next.kind === 'seller') void reloadOfferable()
  }

  function interact(): boolean {
    if (panel.value) return false
    const target = aimed()
    if (!target) return false
    open(target.kind === 'lot' ? { kind: 'buy', stallNo: target.stallNo, lotId: target.lot.lot_id } : { kind: target.kind, stallNo: target.stallNo })
    return true
  }

  function settle(): void {
    clearTimeout(answerTimer)
    pending.value = false
  }

  function run(intent: MarketIntent): void {
    const room = deps.gameRoomRef.value
    if (pending.value || !room) return
    pending.value = true
    feedback.value = null
    request += 1
    answerTimer = setTimeout(() => {
      pending.value = false
      feedback.value = { kind: 'error', text: deps.t('market.timeout') }
    }, ANSWER_TIMEOUT_MS)
    room.send('market', intent.action === 'buy' ? { ...intent, ref: crypto.randomUUID(), request } : { ...intent, request })
  }

  function lotName(lotId: number): string | null {
    for (const stall of deps.market()?.stalls ?? []) {
      const lot = stall.lots.find((l) => l.lot_id === lotId)
      if (lot) return lot.name
    }
    return null
  }

  function onDone(data: MarketDonePayload): void {
    if (data.request !== request) return
    settle()
    if (typeof data.cash === 'number') applyCachedBalanceAfterPurchase('cash', data.cash)
    if (data.action === 'claim' && panel.value?.kind === 'claim') panel.value = { kind: 'seller', stallNo: panel.value.stallNo }
    if (data.action !== 'claim') deps.refreshInventory()
    if (data.action === 'list' || data.action === 'withdraw' || data.action === 'claim') void reloadOfferable()
    deps.playSound(data.action === 'buy' ? 'market_bought' : 'market_sold')
    feedback.value = { kind: 'success', text: deps.t(`market.${{ claim: 'claimed', list: 'listed', withdraw: 'withdrawn', buy: 'bought' }[data.action]}`, buyDetails()) }
  }

  function buyDetails(): Record<string, unknown> {
    const current = panel.value
    if (current?.kind !== 'buy') return {}
    return { quantity: lastBuyQuantity, name: lotName(current.lotId) ?? '' }
  }

  function buy(lotId: number, quantity: number): void {
    lastBuyQuantity = quantity
    run({ action: 'buy', lotId, quantity })
  }

  function onError(data: MarketErrorPayload): void {
    if (data.request !== request) return
    settle()
    feedback.value = { kind: 'error', text: data.message }
  }

  function announce(text: string): void {
    clearTimeout(announcementTimer)
    announcement.value = text
    announcementTimer = setTimeout(() => (announcement.value = null), ANNOUNCEMENT_MS)
  }

  function onSold(data: MarketSoldPayload): void {
    deps.playSound('market_sold')
    announce(deps.t('market.sold', { quantity: data.quantity, name: lotName(data.lotId) ?? data.code }))
  }

  function closingTime(market: MarketSnapshot): string {
    return new Date(market.closes_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  watch(deps.market, (market, previous) => {
    clearTimeout(closingTimer)
    if (!market) return
    if (market.open && !previous?.open) {
      announce(deps.t('market.opened', { time: closingTime(market) }))
      if (previous) deps.playSound('market_bell')
    }
    if (!market.open && previous?.open) {
      announce(deps.t('market.closed'))
      deps.playSound('market_bell')
      panel.value = null
    }
    const warnIn = Date.parse(market.closes_at) - CLOSING_WARNING_MS - Date.now()
    if (market.open && warnIn > 0) closingTimer = setTimeout(() => announce(deps.t('market.closingSoon')), warnIn)
  })

  function clearFeedback(): void {
    feedback.value = null
  }

  function close(): void {
    panel.value = null
  }

  const source: InteractionSource = { prompt, interact }

  return { panel, pending, feedback, offerable, announcement, run, buy, clearFeedback, close, source, handlers: { onDone, onError, onSold } }
}
