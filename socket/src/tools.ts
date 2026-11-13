import { callRealtimeBackend } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'

export interface HandStats {
  damage: number
  cooldownMs: number
  reach: number
}

const HOLD_CHECK_INTERVAL_MS = 250

export const FIST: HandStats = { damage: 8, cooldownMs: 800, reach: 2.5 }

export const TOOL_STATS: Readonly<Record<string, HandStats>> = {
  tool_secateurs: { damage: 14, cooldownMs: 1400, reach: 2.5 },
  tool_crowbar: { damage: 18, cooldownMs: 1700, reach: 2.5 },
  tool_hammer: { damage: 15, cooldownMs: 1400, reach: 2.5 },
  tool_wrench: { damage: 12, cooldownMs: 1100, reach: 2.5 }
}

function warn(context: string, error: unknown): void {
  console.warn(`[tools] ${context}:`, error instanceof Error ? error.message : error)
}

export function handStats(player: Player): HandStats {
  return (player.heldTool && TOOL_STATS[player.heldTool]) || FIST
}

function readToolCode(payload: ClientPayload): string | null {
  const code = payload?.code
  return typeof code === 'string' && Object.hasOwn(TOOL_STATS, code) ? code : null
}

function setHeld(room: GameRoom, client: GameClient, player: Player, code: string | null): void {
  if (player.heldTool === code) return
  player.heldTool = code
  client.send('tool_held', { code, cooldownMs: handStats(player).cooldownMs })
  room.forEachClient((c) => c.send('user_held', { sessionId: client.sessionId, code }), client)
}

async function carriedTool(player: Player, code: string): Promise<string | null> {
  try {
    await callRealtimeBackend(player.token, '/tools/hold', 'POST', { code })
    return code
  } catch (error) {
    warn('hold refused', error)
    return null
  }
}

async function syncHeld(room: GameRoom, client: GameClient, player: Player): Promise<void> {
  if (player.holdSyncing) return
  player.holdSyncing = true
  try {
    while (player.wantedTool !== player.heldTool && room.players.get(client.sessionId) === player) {
      const wait = HOLD_CHECK_INTERVAL_MS - (Date.now() - player.lastHoldCheckAt)
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      const wanted = player.wantedTool
      player.lastHoldCheckAt = Date.now()
      const held = wanted ? await carriedTool(player, wanted) : null
      if (player.wantedTool !== wanted) continue
      setHeld(room, client, player, held)
      player.wantedTool = held
    }
  } finally {
    player.holdSyncing = false
  }
}

export function onHold(room: GameRoom, client: GameClient, payload: ClientPayload): void {
  const player = room.players.get(client.sessionId)
  if (!player?.token) return
  player.wantedTool = readToolCode(payload)
  void syncHeld(room, client, player)
}

export function onToolUsed(room: GameRoom, client: GameClient, player: Player, code: string, usesLeft: number): void {
  client.send('tool_worn', { code, usesLeft })
  if (usesLeft > 0 || player.heldTool !== code) return
  player.wantedTool = null
  setHeld(room, client, player, null)
}

export async function wearHeldTool(room: GameRoom, client: GameClient, player: Player, code: string): Promise<void> {
  try {
    const data = await callRealtimeBackend(player.token, '/tools/wear', 'POST', { code })
    onToolUsed(room, client, player, code, Number(data?.uses_left))
  } catch (error) {
    warn('wear failed', error)
    if (player.heldTool !== code) return
    player.wantedTool = null
    setHeld(room, client, player, null)
  }
}
