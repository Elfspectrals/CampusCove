import { callRealtimeBackend, callServerBackend, errorPayload, type Json } from './backend.ts'
import {
  BID_ZONE_RADIUS, acceptBid, advance, auctioneerSpot, bidZoneCenter, currentLot, hammered, inBidZone, parisClock, saleTrigger, startSale,
  type SaleLot, type SaleResult, type SaleState, type StorageUnit
} from './storageSale.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'
import { worldStorage, type WorldStorage } from './world.ts'

export const STORAGE_BID_COOLDOWN_MS = 1000
export const STORAGE_OPEN_REACH = 3
export const STORAGE_TICK_MS = 250

interface WonBox {
  lotId: string
  unitId: string
  winnerAccountId: number
  winnerPseudo: string
}

export interface StorageAuction {
  sale: SaleState | null
  announcedNight: string | null
  startedNight: string | null
  won: WonBox[]
  busy: boolean
  lastBidAt: Map<number, number>
}

export type StorageRoom = GameRoom & { storageAuction: StorageAuction }

export function newStorageAuction(): StorageAuction {
  return { sale: null, announcedNight: null, startedNight: null, won: [], busy: false, lastBidAt: new Map() }
}

function unitOf(storage: WorldStorage, index: number): StorageUnit {
  return storage.units[index]!
}

export function storageSnapshot(room: StorageRoom, now: number): Json {
  const storage = worldStorage()
  const { sale, won } = room.storageAuction
  const idle = { active: false, serverNow: now, auctioneer: storage?.auctioneer ?? null, won }
  if (!sale || !storage) return idle
  const unit = unitOf(storage, sale.index)
  const lot = currentLot(sale)
  const spot = auctioneerSpot(unit)
  return {
    active: true,
    serverNow: now,
    night: sale.night,
    phase: sale.phase,
    endsAt: sale.phaseEndsAt,
    index: sale.index,
    count: sale.lots.length,
    unitId: unit.id,
    lot,
    auctioneer: { ...spot.position, yaw: spot.yaw },
    bidZone: { ...bidZoneCenter(unit), radius: BID_ZONE_RADIUS },
    leader: sale.leader ? { pseudo: sale.leader.pseudo, amount: sale.leader.amount } : null,
    nextBid: sale.nextBid,
    result: sale.result,
    won
  }
}

function broadcast(room: StorageRoom, now: number): void {
  const snapshot = storageSnapshot(room, now)
  room.forEachClient((c) => c.send('storage_sale', snapshot))
}

function sendError(client: GameClient, error: unknown, fallback: string, code: string): void {
  client.send('storage_sale_error', errorPayload(error, fallback, code))
}

function parseLots(raw: Json): SaleLot[] {
  if (!Array.isArray(raw?.lots)) throw new Error(`invalid storage sale from the API: ${JSON.stringify(raw)}`)
  return raw.lots.map((lot: Json): SaleLot => {
    if (typeof lot?.lot_public_id !== 'string' || !Number.isSafeInteger(lot.opening_bid) || !Array.isArray(lot.contents)) {
      throw new Error(`invalid storage lot from the API: ${JSON.stringify(lot)}`)
    }
    return {
      id: lot.lot_public_id,
      source: lot.source === 'seized' ? 'seized' : 'generated',
      formerOwnerName: typeof lot.former_owner_name === 'string' ? lot.former_owner_name : null,
      openingBid: lot.opening_bid,
      contents: lot.contents
    }
  })
}

export async function startStorageSale(room: StorageRoom, night: string, now: number): Promise<void> {
  const storage = worldStorage()
  const auction = room.storageAuction
  if (!storage || auction.sale || auction.busy) return
  auction.busy = true
  auction.startedNight = night
  try {
    const lots = parseLots(await callServerBackend('/storage/sale', 'POST', { night }))
    auction.sale = startSale(night, lots, storage.units.length, now)
    auction.won = []
    room.forEachClient((c) => c.send('storage_sale_started', { night, count: auction.sale?.lots.length ?? 0 }))
    broadcast(room, now)
  } finally {
    auction.busy = false
  }
}

function parseHammer(raw: Json): SaleResult {
  const status = raw?.status
  if (status !== 'sold' && status !== 'listed' && status !== 'destroyed') throw new Error(`invalid hammer from the API: ${JSON.stringify(raw)}`)
  return {
    status,
    winnerAccountId: Number.isSafeInteger(raw.winner_account_id) ? raw.winner_account_id : null,
    price: Number.isSafeInteger(raw.sale_price) ? raw.sale_price : null
  }
}

async function hammer(room: StorageRoom, sale: SaleState): Promise<void> {
  const auction = room.storageAuction
  const storage = worldStorage()!
  auction.busy = true
  try {
    const lot = currentLot(sale)
    const result = parseHammer(await callServerBackend(`/storage/lots/${lot.id}/hammer`))
    if (result.status === 'sold' && result.winnerAccountId !== null) {
      auction.won.push({ lotId: lot.id, unitId: unitOf(storage, sale.index).id, winnerAccountId: result.winnerAccountId, winnerPseudo: sale.leader?.pseudo ?? '' })
    }
    auction.sale = hammered(sale, result, Date.now())
  } finally {
    auction.busy = false
  }
}

export async function tickStorageAuction(room: StorageRoom, now: number): Promise<void> {
  const auction = room.storageAuction
  if (auction.busy || !worldStorage()) return
  if (!auction.sale) {
    const trigger = saleTrigger(now, auction.announcedNight, auction.startedNight)
    if (trigger?.kind === 'announce') {
      auction.announcedNight = trigger.night
      room.forEachClient((c) => c.send('storage_sale_soon', { night: trigger.night }))
    } else if (trigger?.kind === 'start') {
      await startStorageSale(room, trigger.night, now)
    }
    return
  }
  if (auction.sale.phase === 'hammering') {
    await hammer(room, auction.sale)
    broadcast(room, Date.now())
    return
  }
  const next = advance(auction.sale, now)
  if (next === auction.sale) return
  if (next === null) {
    auction.sale = null
    room.forEachClient((c) => c.send('storage_sale_ended', {}))
    broadcast(room, now)
    return
  }
  auction.sale = next
  if (next.phase === 'hammering') await hammer(room, next)
  broadcast(room, Date.now())
}

function bidder(room: StorageRoom, client: GameClient, now: number): Player | null {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return null
  return player
}

export async function onStorageBid(room: StorageRoom, client: GameClient, now = Date.now()): Promise<void> {
  const auction = room.storageAuction
  const sale = auction.sale
  const storage = worldStorage()
  const player = bidder(room, client, now)
  if (!player || !sale || !storage || sale.phase !== 'bidding') {
    client.send('storage_sale_error', { code: 'storage_not_bidding', message: 'Bidding is not open.' })
    return
  }
  if (!inBidZone(player, unitOf(storage, sale.index))) {
    client.send('storage_sale_error', { code: 'storage_out_of_zone', message: 'Step into the circle in front of the auctioneer to bid.' })
    return
  }
  if (sale.leader?.accountId === player.accountId) {
    client.send('storage_sale_error', { code: 'storage_already_leading', message: 'You already hold the best bid.' })
    return
  }
  if (auction.busy || now - (auction.lastBidAt.get(player.accountId) ?? 0) < STORAGE_BID_COOLDOWN_MS) {
    client.send('storage_sale_error', { code: 'storage_busy', message: 'Wait a moment before bidding again.' })
    return
  }
  auction.lastBidAt.set(player.accountId, now)
  auction.busy = true
  const lot = currentLot(sale)
  try {
    const answer = await callRealtimeBackend(player.token, `/storage/lots/${lot.id}/bid`, 'POST', { amount: sale.nextBid })
    if (!Number.isSafeInteger(answer?.amount) || !Number.isSafeInteger(answer?.next_bid)) throw new Error(`invalid bid from the API: ${JSON.stringify(answer)}`)
    if (auction.sale === sale && sale.phase === 'bidding') {
      auction.sale = acceptBid(sale, { accountId: player.accountId, pseudo: player.pseudo, amount: answer.amount }, answer.next_bid)
    }
  } catch (error) {
    sendError(client, error, 'Your bid was refused.', 'storage_bid_error')
  } finally {
    auction.busy = false
  }
  broadcast(room, Date.now())
}

function nearUnit(player: Player, unit: StorageUnit): boolean {
  return Math.hypot(player.x - unit.threshold.x, player.z - unit.threshold.z) <= STORAGE_OPEN_REACH
}

function revealed(room: StorageRoom, lotId: string, unitId: string | null, pseudo: string, contents: unknown): void {
  room.forEachClient((c) => c.send('storage_opened', { lotId, unitId, pseudo, contents }))
}

export async function onStorageOpen(room: StorageRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const storage = worldStorage()
  const player = bidder(room, client, now)
  const lotId = typeof payload?.lotId === 'string' ? payload.lotId : ''
  const box = room.storageAuction.won.find((w) => w.lotId === lotId)
  const unit = box && storage ? storage.units.find((u) => u.id === box.unitId) : undefined
  if (!player || !box || !unit || box.winnerAccountId !== player.accountId || !nearUnit(player, unit)) {
    client.send('storage_sale_error', { code: 'storage_cannot_open', message: 'Stand in front of your box to open it.' })
    return
  }
  try {
    const answer = await callRealtimeBackend(player.token, `/storage/lots/${lotId}/open`)
    room.storageAuction.won = room.storageAuction.won.filter((w) => w.lotId !== lotId)
    revealed(room, lotId, unit.id, player.pseudo, answer?.contents ?? [])
    broadcast(room, Date.now())
  } catch (error) {
    sendError(client, error, 'Could not open the box.', 'storage_open_error')
  }
}

export async function onStorageOpenMine(room: StorageRoom, client: GameClient, now = Date.now()): Promise<void> {
  const storage = worldStorage()
  const player = bidder(room, client, now)
  const home = storage?.auctioneer
  if (!player || !home || Math.hypot(player.x - home.x, player.z - home.z) > STORAGE_OPEN_REACH + 2) {
    client.send('storage_sale_error', { code: 'storage_cannot_open', message: 'Ask the auctioneer on his stage.' })
    return
  }
  try {
    const answer = await callRealtimeBackend(player.token, '/storage/won/open')
    const lots: Json[] = Array.isArray(answer?.lots) ? answer.lots : []
    if (lots.length === 0) {
      client.send('storage_sale_error', { code: 'storage_nothing_to_open', message: 'You have no box waiting here.' })
      return
    }
    for (const lot of lots) revealed(room, String(lot.lot_public_id), null, player.pseudo, lot.contents ?? [])
  } catch (error) {
    sendError(client, error, 'Could not open your boxes.', 'storage_open_error')
  }
}

export async function onAdminStorageSale(room: StorageRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.isAdmin) return
  if (room.storageAuction.sale) {
    client.send('admin_error', { message: 'A storage sale is already running.' })
    return
  }
  try {
    await startStorageSale(room, parisClock(now).night, now)
    if (!room.storageAuction.sale) client.send('admin_error', { message: 'No storage box to sell.' })
  } catch (error) {
    client.send('admin_error', { message: error instanceof Error ? error.message : 'Could not start the storage sale.' })
  }
}
