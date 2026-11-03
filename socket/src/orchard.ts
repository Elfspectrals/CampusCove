import { callRealtimeBackend, errorPayload } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { worldOrchard } from './world.ts'

export const PICK_MS = 3000
const PICK_LAG_MARGIN_MS = 250
const TREE_REACH = 2.5
const FARMER_REACH = 3
const EYE_HEIGHT = 1.6
const POINT_FLOOR_TOLERANCE = 2

function warn(context: string, error: unknown): void {
  console.warn(`[orchard] ${context}:`, error instanceof Error ? error.message : error)
}

function sendOrchardError(client: GameClient, message: string, code: string): void {
  client.send('orchard_error', { message, code })
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
  player.orchardPick = { tree: treeIndex, startedAt: now }
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
  if (now - pick.startedAt < PICK_MS - PICK_LAG_MARGIN_MS) {
    sendOrchardError(client, 'Keep picking a little longer.', 'orchard_too_fast')
    return
  }
  const tree = worldOrchard()?.trees[pick.tree]
  if (!tree || !isWithinReach(player, tree, TREE_REACH)) {
    sendOrchardError(client, 'Get closer to the tree.', 'orchard_too_far')
    return
  }
  try {
    client.send('orchard_picked', await callRealtimeBackend(player.token, '/orchard/pick', 'POST', {}))
  } catch (error) {
    warn('pick failed', error)
    client.send('orchard_error', errorPayload(error, 'The apple slipped from your hand.', 'orchard_pick_failed'))
  }
}

export async function onOrchardSell(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = activePlayer(room, client, now)
  if (!player) return
  const orchard = worldOrchard()
  if (!orchard) {
    sendOrchardError(client, 'There is no orchard in this world.', 'no_orchard')
    return
  }
  const quantity = payload?.quantity
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    sendOrchardError(client, 'Choose how many apples to sell.', 'orchard_bad_quantity')
    return
  }
  if (!isWithinReach(player, orchard.farmer, FARMER_REACH)) {
    sendOrchardError(client, 'Walk up to the farmer.', 'orchard_too_far')
    return
  }
  try {
    client.send('orchard_sold', await callRealtimeBackend(player.token, '/orchard/sell', 'POST', { quantity }))
  } catch (error) {
    warn('sell failed', error)
    client.send('orchard_error', errorPayload(error, 'The farmer could not buy your apples.', 'orchard_sell_failed'))
  }
}
