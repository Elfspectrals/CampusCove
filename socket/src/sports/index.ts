import type { GameClient, GameRoom, Player } from '../types.ts'
import { sendLoansOnJoin, takeBackAll, updateLoansOnMove } from './loans.ts'
import { loadSportsPass } from './pass.ts'
import { leaveSports, updateMatchesOnMove } from './venues.ts'

export { onSportsPassBuy } from './pass.ts'
export { SPORTS_TICK_MS } from './sportsConstants.ts'
export { assertVenueZones, newSportsState, onSportsCoachOpen, onSportsSignup, onSportsSignupLeave, tickSports } from './venues.ts'

export async function joinSports(room: GameRoom, client: GameClient, player: Player): Promise<void> {
  sendLoansOnJoin(room, client)
  if (player.token) await loadSportsPass(room, client, player)
}

export function moveInSports(room: GameRoom, player: Player, now: number): void {
  updateLoansOnMove(room, player, now)
  updateMatchesOnMove(room, player, now)
}

export function leaveSportsRoom(room: GameRoom, player: Player, now: number): void {
  takeBackAll(room, player)
  leaveSports(room, player, now)
}

export function sportsDeath(room: GameRoom, player: Player): void {
  takeBackAll(room, player)
}
