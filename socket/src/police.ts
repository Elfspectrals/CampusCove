import { callRealtimeBackend, errorPayload } from './backend.ts'
import {
  DUTY_UNIFORM,
  POLICE_ACTION_COOLDOWN_MS,
  POLICE_DESK_REACH,
  POLICE_HEIGHT_REACH,
  POLICE_LOCKER_REACH
} from './policeConstants.ts'
import type { AppearanceSlot, CharacterLook, GameClient, GameRoom, Player, Vec3, WearSlot } from './types.ts'
import { sendWantedView } from './wanted.ts'
import { dropCuffsOf } from './handcuffs.ts'
import { worldPolice } from './world.ts'

export type DutyEnd = 'off' | 'death' | 'licence_lost'

export interface ShownAppearance {
  appearance: Record<AppearanceSlot, number | null>
  slotHexes: Record<AppearanceSlot, string>
  bodyModelGlb: string | null
  slotModels: Record<WearSlot, string | null>
  character: CharacterLook | null
}

function warn(context: string, error: unknown): void {
  console.warn(`[police] ${context}:`, error instanceof Error ? error.message : error)
}

export function isOnDuty(player: Pick<Player, 'onDuty'>): boolean {
  return player.onDuty
}

export function onDutyPlayers(room: Pick<GameRoom, 'players'>): Player[] {
  return [...room.players.values()].filter(isOnDuty)
}

export function shownAppearance(player: Player): ShownAppearance {
  const shown: ShownAppearance = {
    appearance: { ...player.appearance },
    slotHexes: { ...player.slotHexes },
    bodyModelGlb: player.bodyModelGlb,
    slotModels: { ...player.slotModels },
    character: player.character && { ...player.character }
  }
  if (!isOnDuty(player)) return shown
  shown.bodyModelGlb = null
  for (const [slot, piece] of Object.entries(DUTY_UNIFORM) as [keyof typeof DUTY_UNIFORM, { model: string, hex: string }][]) {
    shown.appearance[slot] = null
    shown.slotHexes[slot] = piece.hex
    shown.slotModels[slot] = piece.model
  }
  return shown
}

export function broadcastAppearance(room: Pick<GameRoom, 'forEachClient'>, player: Player): void {
  const payload = { sessionId: player.sessionId, ...shownAppearance(player) }
  room.forEachClient((c) => c.send('appearance_updated', payload))
}

function withinReach(player: Player, point: Vec3, reach: number): boolean {
  return Math.hypot(point.x - player.x, point.z - player.z) <= reach && Math.abs(point.y - player.y) <= POLICE_HEIGHT_REACH
}

export function atFrontDesk(player: Player): boolean {
  const police = worldPolice()
  return police !== null && (withinReach(player, police.desk, POLICE_DESK_REACH) || withinReach(player, police.officer, POLICE_DESK_REACH))
}

export function atLockers(player: Player): boolean {
  const police = worldPolice()
  return police !== null && withinReach(player, police.lockers, POLICE_LOCKER_REACH)
}

function clientOf(room: Pick<GameRoom, 'clients'>, player: Player): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === player.sessionId)
}

export function sendPoliceState(client: GameClient, player: Player): void {
  client.send('police_state', { licensed: player.policeLicence === true, onDuty: player.onDuty, price: player.policeLicencePrice })
}

function sendPoliceError(client: GameClient, code: string, message: string): void {
  client.send('police_error', { code, message })
}

export function dutyRefusal(player: Player, now: number): { code: string, message: string } | null {
  if (player.jail) return { code: 'police_jailed', message: 'You cannot go on duty from a cell.' }
  if (now < player.knockedOutUntil) return { code: 'police_knocked_out', message: 'You cannot go on duty right now.' }
  if (player.policeLicence !== true) return { code: 'police_no_licence', message: 'You need a police licence. Buy one at the front desk.' }
  if (player.wantedStars > 0) return { code: 'police_wanted', message: 'A wanted player cannot go on duty.' }
  return null
}

function setDuty(room: GameRoom, player: Player, onDuty: boolean): void {
  player.onDuty = onDuty
  broadcastAppearance(room, player)
  const client = clientOf(room, player)
  if (!client) return
  sendPoliceState(client, player)
  sendWantedView(room, client, player)
}

export function endDuty(room: GameRoom, player: Player, reason: DutyEnd): void {
  if (!player.onDuty) return
  dropCuffsOf(room, player, reason === 'death' ? 'officer_down' : 'off_duty')
  setDuty(room, player, false)
  clientOf(room, player)?.send('police_duty_ended', { reason })
}

export function onPoliceDuty(room: GameRoom, client: GameClient, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || !atLockers(player) || now - player.lastPoliceActionAt < POLICE_ACTION_COOLDOWN_MS) return
  player.lastPoliceActionAt = now
  if (player.onDuty) {
    endDuty(room, player, 'off')
    return
  }
  const refusal = dutyRefusal(player, now)
  if (refusal) {
    sendPoliceError(client, refusal.code, refusal.message)
    return
  }
  setDuty(room, player, true)
}

export function loseLicence(room: GameRoom, player: Player): void {
  player.policeLicence = false
  endDuty(room, player, 'licence_lost')
  const client = clientOf(room, player)
  if (client) sendPoliceState(client, player)
}

export async function onPoliceLicenceBuy(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || player.policePending || !atFrontDesk(player)) return
  if (now - player.lastPoliceActionAt < POLICE_ACTION_COOLDOWN_MS) return
  player.lastPoliceActionAt = now
  if (player.jail) {
    sendPoliceError(client, 'police_jailed', 'You cannot buy a police licence from a cell.')
    return
  }
  player.policePending = true
  try {
    const data = await callRealtimeBackend(player.token, '/police/licence', 'POST')
    player.policePending = false
    if (room.players.get(client.sessionId) !== player) return
    player.policeLicence = true
    client.send('police_licence_bought', { price: data?.licence?.price ?? null, bank: data?.licence?.bank ?? null })
    sendPoliceState(client, player)
  } catch (error) {
    player.policePending = false
    const { code, message } = errorPayload(error, 'You could not buy the licence.', 'police_licence_failed')
    sendPoliceError(client, code, message)
  }
}

export function parseLicence(raw: unknown): { held: boolean, price: number } {
  const { held, price } = (raw ?? {}) as { held?: unknown, price?: unknown }
  if (typeof held !== 'boolean' || !Number.isInteger(price) || (price as number) <= 0) {
    throw new Error(`invalid police licence from the API: ${JSON.stringify(raw)}`)
  }
  return { held, price: price as number }
}

export async function loadPoliceLicence(room: GameRoom, client: GameClient, player: Player): Promise<void> {
  let licence: { held: boolean, price: number }
  try {
    const data = await callRealtimeBackend(player.token, '/police/licence', 'GET')
    licence = parseLicence(data?.licence)
  } catch (error) {
    warn('licence load failed', error)
    return
  }
  if (room.players.get(player.sessionId) !== player) return
  player.policeLicence = licence.held
  player.policeLicencePrice = licence.price
  sendPoliceState(client, player)
}
