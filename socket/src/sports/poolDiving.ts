import { randomUUID } from 'node:crypto'
import { callRealtimeBackend } from '../backend.ts'
import type { Bounds, ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'

export interface DiveBoard {
  id: string
  heightM: number
  edgeZone: Bounds
}

export interface DivingRules {
  boards: DiveBoard[]
  tricks: string[]
}

interface Jump {
  board: DiveBoard
  at: number
  trick: string | null
}

const EYE_HEIGHT = 1.6
const FEET_TOLERANCE_M = 0.4
const GRAVITY = 9.8
const AIR_MARGIN_MS = 400
export const DIVE_COOLDOWN_MS = 1500
export const COUNTED_DIVE_BOARD = 'platform_5m'

const jumps = new WeakMap<Player, Jump>()
let divingRules: DivingRules | null = null
let poolZone: string | null = null

type Json = Record<string, unknown>

function finite(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`diving rules: invalid ${what} ${JSON.stringify(raw)}`)
  return raw
}

export function parseDivingRules(raw: unknown): DivingRules {
  const rules = raw as Json | null
  if (rules?.status !== 'ready') throw new Error('diving rules: status is not ready')
  if (!Array.isArray(rules.boards) || rules.boards.length === 0) throw new Error('diving rules: missing boards')
  if (!Array.isArray(rules.tricks) || !rules.tricks.every((t) => typeof t === 'string' && /^[a-z_]+$/.test(t))) throw new Error('diving rules: invalid tricks')
  const boards = rules.boards.map((b: Json, i: number): DiveBoard => {
    const e = b.edgeZone as Json | undefined
    if (typeof b.id !== 'string' || !e) throw new Error(`diving rules: invalid board ${i}`)
    const edgeZone = { minX: finite(e.minX, 'minX'), maxX: finite(e.maxX, 'maxX'), minZ: finite(e.minZ, 'minZ'), maxZ: finite(e.maxZ, 'maxZ') }
    if (edgeZone.minX >= edgeZone.maxX || edgeZone.minZ >= edgeZone.maxZ) throw new Error(`diving rules: empty edge zone of ${b.id}`)
    return { id: b.id, heightM: finite(b.heightM, `${b.id}.heightM`), edgeZone }
  })
  return { boards, tricks: rules.tricks as string[] }
}

export function useDivingRules(rules: DivingRules, zone: string): void {
  divingRules = rules
  poolZone = zone
}

function onEdge(board: DiveBoard, x: number, y: number, z: number): boolean {
  const e = board.edgeZone
  return x >= e.minX && x <= e.maxX && z >= e.minZ && z <= e.maxZ && Math.abs(y - EYE_HEIGHT - board.heightM) <= FEET_TOLERANCE_M
}

function onBoardEdge(board: DiveBoard, player: Player): boolean {
  return onEdge(board, player.x, player.y, player.z)
}

export function entersTakenBoardEdge(room: Pick<GameRoom, 'players'>, player: Player, x: number, y: number, z: number): boolean {
  const board = divingRules?.boards.find((b) => onEdge(b, x, y, z) && !onBoardEdge(b, player))
  if (!board) return false
  for (const other of room.players.values()) if (other !== player && onBoardEdge(board, other)) return true
  return false
}

export function airTimeMs(heightM: number): number {
  return Math.sqrt((2 * heightM) / GRAVITY) * 1000 + AIR_MARGIN_MS
}

function sendToPool(room: GameRoom, type: string, payload: unknown): void {
  const zone = poolZone === null ? null : worldSportsPassArea(poolZone)
  if (!zone) return
  room.forEachClient((c) => {
    const p = room.players.get(c.sessionId)
    if (p && p.x >= zone.minX && p.x <= zone.maxX && p.z >= zone.minZ && p.z <= zone.maxZ) c.send(type, payload)
  })
}

export function onPoolJump(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const board = divingRules?.boards.find((b) => b.id === payload?.board)
  if (!player || !board || !onBoardEdge(board, player)) return
  const last = jumps.get(player)
  if (last && now - last.at < DIVE_COOLDOWN_MS) return
  jumps.set(player, { board, at: now, trick: null })
  sendToPool(room, 'pool_dive', { sessionId: player.sessionId, board: board.id, heightM: board.heightM, airMs: Math.round(airTimeMs(board.heightM)), serverNow: now })
  if (board.id === COUNTED_DIVE_BOARD && player.token) {
    callRealtimeBackend(player.token, '/sports/dives', 'POST', { ref: randomUUID(), board: board.id }).catch((error: unknown) => {
      console.warn('[sports] platform dive not counted:', error instanceof Error ? error.message : error)
    })
  }
}

export function onPoolTrick(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const trick = payload?.trick
  if (!player || typeof trick !== 'string' || !divingRules?.tricks.includes(trick)) return
  const jump = jumps.get(player)
  if (!jump || jump.trick !== null || now - jump.at > airTimeMs(jump.board.heightM)) return
  jump.trick = trick
  sendToPool(room, 'pool_dive_trick', { sessionId: player.sessionId, name: player.pseudo, board: jump.board.id, trick })
}
