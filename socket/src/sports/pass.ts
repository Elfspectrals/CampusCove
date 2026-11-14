import { randomUUID } from 'node:crypto'
import { callRealtimeBackend, errorPayload } from '../backend.ts'
import type { Bounds, ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassAreas, worldSportsPassDesk } from '../world.ts'
import { SPORTS_ACTION_COOLDOWN_MS, SPORTS_PASS_DESK_REACH, SPORTS_PASS_KINDS } from './sportsConstants.ts'

export type SportsPassKind = typeof SPORTS_PASS_KINDS[number]

export interface SportsPassPrices {
  day: number
  week: number
}

export interface SportsPass {
  validUntil: number | null
  prices: SportsPassPrices
}

function warn(context: string, error: unknown): void {
  console.warn(`[sports] ${context}:`, error instanceof Error ? error.message : error)
}

function isPrice(raw: unknown): raw is number {
  return Number.isInteger(raw) && (raw as number) > 0
}

export function parseSportsPass(raw: unknown): SportsPass {
  const { validUntil, prices } = (raw ?? {}) as { validUntil?: unknown, prices?: { day?: unknown, week?: unknown } }
  const until = validUntil === null ? null : typeof validUntil === 'string' ? Date.parse(validUntil) : NaN
  if ((until !== null && !Number.isFinite(until)) || !isPrice(prices?.day) || !isPrice(prices?.week)) {
    throw new Error(`invalid sports pass from the API: ${JSON.stringify(raw)}`)
  }
  return { validUntil: until, prices: { day: prices.day, week: prices.week } }
}

export function hasValidPass(player: Pick<Player, 'sportsPassUntil'>, now: number): boolean {
  return player.sportsPassUntil !== null && now < player.sportsPassUntil
}

function inside(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

export function inPassArea(x: number, z: number): boolean {
  for (const area of worldSportsPassAreas().values()) if (inside(area, x, z)) return true
  return false
}

export function entersPassAreaWithoutPass(player: Player, x: number, z: number, now: number): boolean {
  if (hasValidPass(player, now)) return false
  for (const area of worldSportsPassAreas().values()) {
    if (inside(area, x, z) && !inside(area, player.x, player.z)) return true
  }
  return false
}

export function atPassDesk(player: Player): boolean {
  const desk = worldSportsPassDesk()
  return desk !== null && Math.hypot(desk.x - player.x, desk.z - player.z) <= SPORTS_PASS_DESK_REACH
}

export function sendSportsPassState(client: GameClient, player: Player): void {
  client.send('sports_pass_state', { validUntil: player.sportsPassUntil, prices: player.sportsPassPrices })
}

function applyPass(player: Player, pass: SportsPass): void {
  player.sportsPassUntil = pass.validUntil
  player.sportsPassPrices = pass.prices
}

export async function loadSportsPass(room: GameRoom, client: GameClient, player: Player): Promise<void> {
  let pass: SportsPass
  try {
    const data = await callRealtimeBackend(player.token, '/sports/pass', 'GET')
    pass = parseSportsPass(data?.pass)
  } catch (error) {
    warn('pass load failed', error)
    return
  }
  if (room.players.get(player.sessionId) !== player) return
  applyPass(player, pass)
  sendSportsPassState(client, player)
}

function parseKind(raw: unknown): SportsPassKind | null {
  return SPORTS_PASS_KINDS.find((kind) => kind === raw) ?? null
}

export async function onSportsPassBuy(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const kind = parseKind(payload?.kind)
  if (!player?.token || !kind || player.sportsPassPending || !atPassDesk(player)) return
  if (now - player.lastSportsPassAt < SPORTS_ACTION_COOLDOWN_MS) return
  player.lastSportsPassAt = now
  player.sportsPassPending = true
  try {
    const data = await callRealtimeBackend(player.token, '/sports/pass', 'POST', { kind, ref: randomUUID() })
    player.sportsPassPending = false
    const pass = parseSportsPass(data?.pass)
    if (!Number.isInteger(data?.cash)) throw new Error(`invalid cash after a sports pass purchase: ${JSON.stringify(data?.cash)}`)
    if (room.players.get(client.sessionId) !== player) return
    applyPass(player, pass)
    client.send('sports_pass_bought', { validUntil: pass.validUntil, cash: data.cash })
    sendSportsPassState(client, player)
  } catch (error) {
    player.sportsPassPending = false
    const { code, message } = errorPayload(error, 'You could not buy the sports pass.', 'sports_pass_failed')
    client.send('sports_pass_error', { code, message })
  }
}
