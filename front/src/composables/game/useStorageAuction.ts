import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { inCircle, remainingMs, saleCall, secondsLeft } from '../../game/storage/storageBoard'
import type { StorageOpenedPayload, StorageSalePayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const OPEN_REACH = 3
const ASK_REACH = 5
const PROMPT_HEIGHT = 2.1

interface StorageUnitPoint {
  id: string
  threshold: [number, number, number]
}

export interface StorageAuctionDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  myAccountId: () => number | null
  units: () => readonly StorageUnitPoint[]
  inWarehouse: () => boolean
  promptsHidden: () => boolean
  t: (key: string, params?: Record<string, unknown>) => string
  say: (text: string) => void
}

type Intent = { kind: 'bid' } | { kind: 'open'; lotId: string } | { kind: 'ask' }

export function useStorageAuction(deps: StorageAuctionDeps) {
  const sale = shallowRef<StorageSalePayload | null>(null)
  const clockOffset = ref(0)
  const clientNow = ref(Date.now())
  const projection = new THREE.Vector3()

  const board = computed(() => {
    const s = sale.value
    if (!s?.active || !deps.inWarehouse() || !s.lot || s.phase === undefined || s.endsAt === undefined) return null
    const remaining = remainingMs(s.endsAt, clientNow.value, clockOffset.value)
    return {
      index: (s.index ?? 0) + 1,
      count: s.count ?? 0,
      source: s.lot.source,
      formerOwnerName: s.lot.formerOwnerName,
      phase: s.phase,
      seconds: secondsLeft(remaining),
      call: saleCall(s.phase, remaining),
      leader: s.leader ?? null,
      nextBid: s.nextBid ?? s.lot.openingBid,
      result: s.result ?? null,
    }
  })

  function near(point: { x: number; z: number }, reach: number): boolean {
    return Math.hypot(deps.myPosition.x - point.x, deps.myPosition.z - point.z) <= reach
  }

  function intent(): { intent: Intent; at: { x: number; y: number; z: number }; action: string } | null {
    const s = sale.value
    if (!s || !deps.inWarehouse()) return null
    const me = deps.myAccountId()
    const mine = s.won.find((w) => w.winnerAccountId === me)
    const unit = mine ? deps.units().find((u) => u.id === mine.unitId) : undefined
    if (mine && unit && near({ x: unit.threshold[0], z: unit.threshold[2] }, OPEN_REACH)) {
      return { intent: { kind: 'open', lotId: mine.lotId }, at: { x: unit.threshold[0], y: unit.threshold[1], z: unit.threshold[2] }, action: deps.t('storage.openBox') }
    }
    if (s.active && s.phase === 'bidding' && s.bidZone && s.auctioneer && inCircle(deps.myPosition, s.bidZone)) {
      return { intent: { kind: 'bid' }, at: s.auctioneer, action: deps.t('storage.bid', { amount: s.nextBid ?? 0 }) }
    }
    if (!s.active && s.auctioneer && near(s.auctioneer, ASK_REACH)) {
      return { intent: { kind: 'ask' }, at: s.auctioneer, action: deps.t('storage.askAuctioneer') }
    }
    return null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const found = intent()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!found || !camera || !canvas) return null
    projection.set(found.at.x, found.at.y + PROMPT_HEIGHT, found.at.z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, action: found.action }
  }

  function interact(): boolean {
    const found = intent()
    const room = deps.gameRoomRef.value
    if (!found || !room) return false
    if (found.intent.kind === 'bid') room.send('storage_bid')
    else if (found.intent.kind === 'open') room.send('storage_open', { lotId: found.intent.lotId })
    else room.send('storage_open_mine')
    return true
  }

  function tick(): void {
    clientNow.value = Date.now()
  }

  function onOpened(data: StorageOpenedPayload): void {
    const list = data.contents.map((c) => (c.quantity > 1 ? `${c.quantity} × ${c.name}` : c.name)).join(', ')
    deps.say(deps.t('storage.opened', { pseudo: data.pseudo, list }))
  }

  const source: InteractionSource = { prompt, interact }

  return {
    sale,
    board,
    source,
    tick,
    handlers: {
      onSale: (data: StorageSalePayload) => {
        sale.value = data
        clockOffset.value = data.serverNow - Date.now()
      },
      onSoon: () => deps.say(deps.t('storage.soon')),
      onStarted: (data: { count: number }) => deps.say(deps.t('storage.started', { count: data.count })),
      onEnded: () => deps.say(deps.t('storage.ended')),
      onOpened,
      onError: (data: { message: string }) => deps.say(data.message),
    },
  }
}
