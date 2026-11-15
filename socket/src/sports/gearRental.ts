import { randomUUID } from 'node:crypto'
import { callRealtimeBackend, errorPayload } from '../backend.ts'
import type { GameClient, GameRoom, Player } from '../types.ts'
import { gearChanged, rentalPrice } from './gear.ts'
import { hasLoan, lend } from './loans.ts'
import { gearLentAt } from './venues.ts'

const QUOTE_GAP_MS = 1000
const lastQuoteAt = new WeakMap<Player, number>()

function sendError(client: GameClient, code: string, message: string): void {
  client.send('sports_error', { code, message })
}

export async function onGearQuote(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const lent = player ? gearLentAt(player) : null
  if (!player?.token || !lent || hasLoan(player, lent.gear) || now - (lastQuoteAt.get(player) ?? -Infinity) < QUOTE_GAP_MS) return
  lastQuoteAt.set(player, now)
  try {
    const { owned, price } = await rentalPrice(player, lent.gear)
    if (!owned && price !== null && room.players.get(client.sessionId) === player) client.send('sports_gear_offer', { gear: lent.gear, price })
  } catch (error) {
    console.warn('[sports] gear quote failed:', error instanceof Error ? error.message : error)
  }
}

export async function onGearRent(room: GameRoom, client: GameClient): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token) return
  const lent = gearLentAt(player)
  if (!lent) {
    sendError(client, 'sports_rent_too_far', 'Gear is lent inside its venue.')
    return
  }
  if (player.sportsPending) {
    sendError(client, 'sports_busy', 'Wait a moment and try again.')
    return
  }
  if (hasLoan(player, lent.gear)) {
    sendError(client, 'sports_rent_already', 'You already have this gear on loan.')
    return
  }
  player.sportsPending = true
  let cash: unknown
  try {
    cash = (await callRealtimeBackend(player.token, '/sports/gear/rent', 'POST', { code: lent.gear, ref: randomUUID() }))?.cash
  } catch (error) {
    const { code, message } = errorPayload(error, 'The gear could not be lent.', 'sports_rent_failed')
    sendError(client, code, message)
    return
  } finally {
    player.sportsPending = false
  }
  if (room.players.get(client.sessionId) !== player) return
  lend(room, player, lent.gear, lent.zone)
  gearChanged(player)
  client.send('sports_gear_rented', { gear: lent.gear, cash })
}
