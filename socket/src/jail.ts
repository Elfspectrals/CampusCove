import { type AdminRoom, teleportPlayer } from './admin.ts'
import { callRealtimeBackend, errorPayload } from './backend.ts'
import {
  FINE_PER_STAR,
  JAIL_MS_PER_STAR,
  JAIL_PAY_COOLDOWN_MS,
  MAX_FINE,
  MAX_JAIL_MS,
  MEAL_TRAY_FOOD,
  MEAL_TRAY_INTERVAL_MS,
  MEAL_TRAY_REACH,
  OFFICER_HOLD_MS
} from './policeConstants.ts'
import type { Bounds, GameClient, GameRoom, JailKind, JailSentence, Player, Vec3 } from './types.ts'
import { MAX_WANTED_STARS, clearWanted } from './wanted.ts'
import { type PoliceCell, worldPolice } from './world.ts'

export type JailRelease = 'served' | 'paid' | 'released'

export interface SavedJail {
  kind: JailKind
  stars: number
  msLeft: number
}

function warn(context: string, error: unknown): void {
  console.warn(`[jail] ${context}:`, error instanceof Error ? error.message : error)
}

export function sentenceMs(stars: number): number {
  return Math.min(MAX_JAIL_MS, stars * JAIL_MS_PER_STAR)
}

export function jailFine(stars: number): number {
  return Math.min(MAX_FINE, stars * FINE_PER_STAR)
}

export function goesToNpcJail(player: Pick<Player, 'wantedStars' | 'jail'>): boolean {
  return Boolean(player.jail) || player.wantedStars > 0
}

export function insideCell(bounds: Bounds, x: number, z: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
}

export function pickCell(cells: readonly PoliceCell[], occupiedCellIds: Iterable<string>): PoliceCell {
  const occupants = new Map<string, number>()
  for (const id of occupiedCellIds) occupants.set(id, (occupants.get(id) ?? 0) + 1)
  return cells.reduce((best, cell) => ((occupants.get(cell.id) ?? 0) < (occupants.get(best.id) ?? 0) ? cell : best))
}

export function cellYaw(cell: PoliceCell): number {
  return Math.atan2(cell.position.x - cell.door.x, cell.position.z - cell.door.z)
}

export function tickSentence(msLeft: number, elapsedMs: number): number {
  return Math.max(0, msLeft - elapsedMs)
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
}

export function parseSavedJail(raw: unknown): SavedJail | null {
  const { kind, stars, ms_left: msLeft } = (raw ?? {}) as { kind?: unknown, stars?: unknown, ms_left?: unknown }
  if (kind === null && stars === 0 && msLeft === 0) return null
  if (kind === 'npc' && isIntegerIn(stars, 1, MAX_WANTED_STARS) && isIntegerIn(msLeft, 1, MAX_JAIL_MS)) return { kind, stars, msLeft }
  if (kind === 'officer' && stars === 0 && isIntegerIn(msLeft, 1, OFFICER_HOLD_MS)) return { kind, stars, msLeft }
  throw new Error(`invalid jail sentence from the API: ${JSON.stringify(raw)}`)
}

function policeCells(): readonly PoliceCell[] {
  const police = worldPolice()
  if (!police) throw new Error('world manifest has no police section: nowhere to jail a player')
  return police.cells
}

export function cellOf(player: Player): PoliceCell | null {
  const cellId = player.jail?.cellId
  return cellId ? policeCells().find((cell) => cell.id === cellId) ?? null : null
}

function clientOf(room: Pick<GameRoom, 'clients'>, player: Player): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === player.sessionId)
}

export function withinCellReach(cell: PoliceCell, point: Vec3, x: number, z: number, reach: number): boolean {
  return insideCell(cell.bounds, x, z) && Math.hypot(point.x - x, point.z - z) <= reach
}

export function atOwnCellTap(player: Player, reach: number): boolean {
  const cell = cellOf(player)
  return cell !== null && withinCellReach(cell, cell.tap, player.x, player.z, reach)
}

export function canEatMealTray(player: Player): boolean {
  const cell = cellOf(player)
  return player.mealTrayInMs === 0 && cell !== null && withinCellReach(cell, cell.hatch, player.x, player.z, MEAL_TRAY_REACH)
}

export function eatMealTray(player: Player): void {
  player.mealTrayInMs = MEAL_TRAY_INTERVAL_MS
}

export function sendMealTray(client: GameClient, player: Player): void {
  const cellId = player.jail?.cellId
  if (!cellId || player.mealTrayInMs === null) return
  client.send('jail_tray', { cellId, ready: player.mealTrayInMs === 0, food: MEAL_TRAY_FOOD })
}

export function sendJailState(client: GameClient, player: Player): void {
  if (!player.jail) return
  const fine = player.jail.kind === 'npc' ? jailFine(player.jail.stars) : 0
  client.send('jail_state', { kind: player.jail.kind, msLeft: player.jail.msLeft, fine, stars: player.jail.stars })
  sendMealTray(client, player)
}

export function sentenceAtDeath(room: GameRoom, player: Player): Promise<void> {
  if (!player.jail) {
    player.jail = { kind: 'npc', stars: player.wantedStars, msLeft: sentenceMs(player.wantedStars), cellId: null }
    clearWanted(room, player)
  }
  player.jailDirty = true
  return saveJail(player)
}

export function assignCell(room: Pick<GameRoom, 'players'>, player: Player & { jail: JailSentence }): PoliceCell {
  const occupied = [...room.players.values()].filter((p) => p !== player && p.jail?.cellId).map((p) => p.jail!.cellId!)
  const cell = pickCell(policeCells(), occupied)
  player.jail.cellId = cell.id
  player.mealTrayInMs ??= 0
  return cell
}

export function cellSpawn(cell: PoliceCell): Vec3 & { ry: number } {
  return { ...cell.position, ry: cellYaw(cell) }
}

export function lockUpOnJoin(room: AdminRoom, player: Player): void {
  if (!player.jail) return
  const spawn = cellSpawn(assignCell(room, player as Player & { jail: JailSentence }))
  teleportPlayer(room, player, spawn, spawn.ry)
  const client = clientOf(room, player)
  if (client) sendJailState(client, player)
}

export function holdInCell(client: GameClient, player: Player): void {
  const cell = cellOf(player)
  if (cell && !insideCell(cell.bounds, player.x, player.z)) {
    Object.assign(player, { ...cell.position, fallPeakY: cell.position.y })
  }
  client.send('position_correction', { x: player.x, y: player.y, z: player.z })
}

export function release(room: AdminRoom, player: Player, reason: JailRelease, paid: { fine: unknown, bank: unknown, cash: unknown } | null = null): void {
  player.jail = null
  player.mealTrayInMs = null
  player.jailDirty = true
  void saveJail(player)
  const exit = worldPolice()?.exit
  if (exit) teleportPlayer(room, player, exit.position, exit.yaw)
  clientOf(room, player)?.send('jail_released', { reason, fine: paid?.fine ?? null, bank: paid?.bank ?? null, cash: paid?.cash ?? null })
}

export function tickJail(room: AdminRoom, elapsedMs: number, now = Date.now()): void {
  for (const player of room.players.values()) {
    if (!player.jail?.cellId || now < player.knockedOutUntil || player.jailPayPending) continue
    player.jail.msLeft = tickSentence(player.jail.msLeft, elapsedMs)
    player.jailDirty = true
    if (player.jail.msLeft === 0) release(room, player, 'served')
    else tickMealTray(room, player, elapsedMs)
  }
}

function tickMealTray(room: AdminRoom, player: Player, elapsedMs: number): void {
  if (!player.mealTrayInMs) return
  player.mealTrayInMs = tickSentence(player.mealTrayInMs, elapsedMs)
  const client = clientOf(room, player)
  if (player.mealTrayInMs === 0 && client) sendMealTray(client, player)
}

export async function onJailPay(room: AdminRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || !player.jail?.cellId || player.jailPayPending) return
  if (player.jail.kind === 'officer') {
    client.send('jail_error', { message: 'An officer holds you here: there is no fine to pay.', code: 'jail_held_by_officer' })
    return
  }
  if (now - player.lastJailPayAt < JAIL_PAY_COOLDOWN_MS) {
    client.send('jail_error', { message: 'Wait a moment before paying again.', code: 'jail_busy' })
    return
  }
  player.lastJailPayAt = now
  player.jailPayPending = true
  try {
    const data = await callRealtimeBackend(player.token, '/jail/pay', 'POST', { stars: player.jail.stars })
    player.jailPayPending = false
    if (room.players.get(client.sessionId) !== player) return
    release(room, player, 'paid', { fine: data?.fine, bank: data?.bank, cash: data?.cash })
  } catch (error) {
    player.jailPayPending = false
    client.send('jail_error', errorPayload(error, 'You could not pay the fine.', 'jail_pay_failed'))
  }
}

export async function loadJail(room: GameRoom, player: Player): Promise<void> {
  let saved: SavedJail | null
  try {
    const data = await callRealtimeBackend(player.token, '/jail', 'GET')
    saved = parseSavedJail(data?.jail)
  } catch (error) {
    warn('load failed', error)
    return
  }
  if (room.players.get(player.sessionId) !== player || !saved) return
  player.jail = { kind: saved.kind, stars: saved.stars, msLeft: saved.msLeft, cellId: null }
}

export async function saveJail(player: Player): Promise<void> {
  if (!player.jailDirty || player.jailPayPending || !player.token) return
  player.jailDirty = false
  const body = player.jail
    ? { kind: player.jail.kind, stars: player.jail.stars, ms_left: Math.ceil(player.jail.msLeft) }
    : { kind: null, stars: 0, ms_left: 0 }
  try {
    await callRealtimeBackend(player.token, '/jail', 'PUT', body)
  } catch (error) {
    player.jailDirty = true
    warn('save failed', error)
  }
}
