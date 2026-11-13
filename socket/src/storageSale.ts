import type { Vec3 } from './types.ts'

export const SALE_HOUR_PARIS = 19
export const ANNOUNCE_LEAD_MINUTES = 5
export const START_WINDOW_MINUTES = 60
export const WALK_MS = 4000
export const PREVIEW_MS = 45000
export const OPENING_WINDOW_MS = 15000
export const BID_EXTENSION_MS = 10000
export const RESULT_MS = 6000
export const BID_ZONE_RADIUS = 6
export const BID_ZONE_AHEAD = 3
export const AUCTIONEER_AHEAD = 0.6

export interface StorageUnit {
  id: string
  door: string
  threshold: Vec3
  inside: Vec3
}

export interface SaleLot {
  id: string
  source: 'seized' | 'generated'
  formerOwnerName: string | null
  openingBid: number
  contents: unknown[]
}

export interface Leader {
  accountId: number
  pseudo: string
  amount: number
}

export type SalePhase = 'walking' | 'preview' | 'bidding' | 'hammering' | 'result'

export interface SaleResult {
  status: 'sold' | 'listed' | 'destroyed'
  winnerAccountId: number | null
  price: number | null
}

export interface SaleState {
  night: string
  lots: SaleLot[]
  index: number
  phase: SalePhase
  phaseEndsAt: number
  leader: Leader | null
  nextBid: number
  result: SaleResult | null
}

const PARIS_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
})

export function parisClock(now: number): { night: string, minutes: number } {
  const parts = Object.fromEntries(PARIS_PARTS.formatToParts(new Date(now)).map((p) => [p.type, p.value]))
  return { night: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

export function saleTrigger(now: number, announcedNight: string | null, startedNight: string | null): { kind: 'announce' | 'start', night: string } | null {
  const { night, minutes } = parisClock(now)
  const start = SALE_HOUR_PARIS * 60
  if (minutes >= start && minutes < start + START_WINDOW_MINUTES && startedNight !== night) return { kind: 'start', night }
  if (minutes >= start - ANNOUNCE_LEAD_MINUTES && minutes < start && announcedNight !== night) return { kind: 'announce', night }
  return null
}

export function startSale(night: string, lots: SaleLot[], unitCount: number, now: number): SaleState | null {
  const onSale = lots.slice(0, unitCount)
  if (onSale.length === 0) return null
  return { night, lots: onSale, index: 0, phase: 'walking', phaseEndsAt: now + WALK_MS, leader: null, nextBid: onSale[0]!.openingBid, result: null }
}

export function currentLot(state: SaleState): SaleLot {
  return state.lots[state.index]!
}

export function advance(state: SaleState, now: number): SaleState | null {
  if (now < state.phaseEndsAt) return state
  switch (state.phase) {
    case 'walking':
      return { ...state, phase: 'preview', phaseEndsAt: now + PREVIEW_MS }
    case 'preview':
      return { ...state, phase: 'bidding', phaseEndsAt: now + OPENING_WINDOW_MS }
    case 'bidding':
      return { ...state, phase: 'hammering' }
    case 'hammering':
      return state
    case 'result': {
      const index = state.index + 1
      if (index >= state.lots.length) return null
      return { ...state, index, phase: 'walking', phaseEndsAt: now + WALK_MS, leader: null, nextBid: state.lots[index]!.openingBid, result: null }
    }
  }
}

export function acceptBid(state: SaleState, leader: Leader, nextBid: number): SaleState {
  return { ...state, leader, nextBid, phaseEndsAt: state.phaseEndsAt + BID_EXTENSION_MS }
}

export function hammered(state: SaleState, result: SaleResult, now: number): SaleState {
  return { ...state, phase: 'result', phaseEndsAt: now + RESULT_MS, result }
}

function aisleDirection(unit: StorageUnit): { x: number, z: number } {
  const dx = unit.threshold.x - unit.inside.x
  const dz = unit.threshold.z - unit.inside.z
  const length = Math.hypot(dx, dz) || 1
  return { x: dx / length, z: dz / length }
}

export function bidZoneCenter(unit: StorageUnit): { x: number, z: number } {
  const d = aisleDirection(unit)
  return { x: unit.threshold.x + d.x * BID_ZONE_AHEAD, z: unit.threshold.z + d.z * BID_ZONE_AHEAD }
}

export function auctioneerSpot(unit: StorageUnit): { position: Vec3, yaw: number } {
  const d = aisleDirection(unit)
  return {
    position: { x: unit.threshold.x + d.x * AUCTIONEER_AHEAD, y: unit.threshold.y, z: unit.threshold.z + d.z * AUCTIONEER_AHEAD },
    yaw: Math.atan2(d.x, d.z)
  }
}

export function inBidZone(player: { x: number, z: number }, unit: StorageUnit): boolean {
  const c = bidZoneCenter(unit)
  return Math.hypot(player.x - c.x, player.z - c.z) <= BID_ZONE_RADIUS
}
