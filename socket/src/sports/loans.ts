import type { GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { hasValidPass } from './pass.ts'
import { CLIMBING_SHOES, SPORTS_SITE_ZONE } from './sportsConstants.ts'

type LoanRoom = Pick<GameRoom, 'forEachClient'>

function broadcastLoans(room: LoanRoom, player: Player): void {
  const payload = { sessionId: player.sessionId, loans: [...player.sportsLoans.keys()] }
  room.forEachClient((c) => c.send('sports_loans', payload))
}

function insideArea(area: string, player: Player): boolean {
  const b = worldSportsPassArea(area)
  return b !== null && player.x >= b.minX && player.x <= b.maxX && player.z >= b.minZ && player.z <= b.maxZ
}

export function hasLoan(player: Player, key: string): boolean {
  return player.sportsLoans.has(key)
}

export function lend(room: LoanRoom, player: Player, key: string, area: string): boolean {
  if (worldSportsPassArea(area) === null) throw new Error(`sports loan ${key}: ${area} is not a sports pass area`)
  if (player.sportsLoans.has(key)) return false
  player.sportsLoans.set(key, area)
  broadcastLoans(room, player)
  return true
}

export function takeBack(room: LoanRoom, player: Player, key: string): boolean {
  if (!player.sportsLoans.delete(key)) return false
  broadcastLoans(room, player)
  return true
}

export function takeBackAll(room: LoanRoom, player: Player): void {
  if (player.sportsLoans.size === 0) return
  player.sportsLoans.clear()
  broadcastLoans(room, player)
}

export function updateLoansOnMove(room: LoanRoom, player: Player, now: number): void {
  let changed = false
  for (const [key, area] of player.sportsLoans) {
    if (insideArea(area, player)) continue
    player.sportsLoans.delete(key)
    changed = true
  }
  if (!player.sportsLoans.has(CLIMBING_SHOES) && insideArea(SPORTS_SITE_ZONE, player) && hasValidPass(player, now)) {
    player.sportsLoans.set(CLIMBING_SHOES, SPORTS_SITE_ZONE)
    changed = true
  }
  if (changed) broadcastLoans(room, player)
}

export function sendLoansOnJoin(room: Pick<GameRoom, 'players'>, client: GameClient): void {
  for (const other of room.players.values()) {
    if (other.sportsLoans.size > 0) client.send('sports_loans', { sessionId: other.sessionId, loans: [...other.sportsLoans.keys()] })
  }
}
