import { callRealtimeBackend, errorPayload } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { onToolUsed } from './tools.ts'
import { worldOrchard } from './world.ts'

export const PICK_MS = 3000
export const PICK_TOOL = 'tool_secateurs'
export const TOOL_PICK_MS = 2000
const PICK_LAG_MARGIN_MS = 250
export const PICK_RESTART_MS = 300
const TREE_REACH = 2.5
const EYE_HEIGHT = 1.6
const POINT_FLOOR_TOLERANCE = 2

function warn(context: string, error: unknown): void {
  console.warn(`[orchard] ${context}:`, error instanceof Error ? error.message : error)
}

function sendOrchardError(client: GameClient, message: string, code: string): void {
  client.send('orchard_error', { message, code })
}

function broadcastPicking(room: GameRoom, client: GameClient, picking: boolean): void {
  room.forEachClient((c) => c.send('user_picking', { sessionId: client.sessionId, picking }), client)
}

function isWithinReach(player: Player, point: Vec3, reach: number): boolean {
  return (
    Math.hypot(player.x - point.x, player.z - point.z) <= reach &&
    Math.abs(player.y - EYE_HEIGHT - point.y) <= POINT_FLOOR_TOLERANCE
  )
}

function activePlayer(room: GameRoom, client: GameClient, now: number): Player | null {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return null
  return player
}

export function onOrchardPickStart(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = activePlayer(room, client, now)
  if (!player) return
  const treeIndex = payload?.tree
  const tree = typeof treeIndex === 'number' && Number.isInteger(treeIndex) ? worldOrchard()?.trees[treeIndex] : undefined
  if (typeof treeIndex !== 'number' || !tree) {
    sendOrchardError(client, 'There is no such tree.', 'orchard_unknown_tree')
    return
  }
  if (!isWithinReach(player, tree, TREE_REACH)) {
    sendOrchardError(client, 'Get closer to the tree.', 'orchard_too_far')
    return
  }
  if (now - player.lastPickStartAt < PICK_RESTART_MS) {
    sendOrchardError(client, 'One apple at a time.', 'orchard_pick_cooldown')
    return
  }
  player.lastPickStartAt = now
  const tool = player.heldTool === PICK_TOOL ? PICK_TOOL : null
  const durationMs = tool ? TOOL_PICK_MS : PICK_MS
  player.orchardPick = { tree: treeIndex, startedAt: now, tool, durationMs }
  client.send('orchard_pick_started', { tree: treeIndex, durationMs })
  broadcastPicking(room, client, true)
}

export function onOrchardPickCancel(room: GameRoom, client: GameClient): void {
  const player = room.players.get(client.sessionId)
  if (!player?.orchardPick) return
  player.orchardPick = null
  broadcastPicking(room, client, false)
}

export async function onOrchardPick(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = activePlayer(room, client, now)
  if (!player) return
  const pick = player.orchardPick
  player.orchardPick = null
  if (!pick) {
    sendOrchardError(client, 'Start picking an apple first.', 'orchard_not_picking')
    return
  }
  broadcastPicking(room, client, false)
  const tool = pick.tool !== null && player.heldTool === pick.tool ? pick.tool : null
  if (now - pick.startedAt < (tool ? pick.durationMs : PICK_MS) - PICK_LAG_MARGIN_MS) {
    sendOrchardError(client, 'Keep picking a little longer.', 'orchard_too_fast')
    return
  }
  const tree = worldOrchard()?.trees[pick.tree]
  if (!tree || !isWithinReach(player, tree, TREE_REACH)) {
    sendOrchardError(client, 'Get closer to the tree.', 'orchard_too_far')
    return
  }
  try {
    const picked = await callRealtimeBackend(player.token, '/orchard/pick', 'POST', tool ? { tool } : {})
    client.send('orchard_picked', picked)
    if (tool && picked?.tool) onToolUsed(room, client, player, tool, Number(picked.tool.uses_left))
  } catch (error) {
    warn('pick failed', error)
    client.send('orchard_error', errorPayload(error, 'The apple slipped from your hand.', 'orchard_pick_failed'))
  }
}
