// Admin powers on a player, without Colyseus so they can be unit-tested (adminPowers.test.ts). Toggles last until
// the player leaves the room (never saved); boosts act once. Contract in docs/ADMIN.md.
import { MAX_STAT } from './survivalStats.ts'
import type { Player, Stats } from './types.ts'

export const ADMIN_TOGGLES = [
  'god',
  'endless_food',
  'endless_water',
  'endless_stamina',
  'fly',
  'speed',
  'invisible',
  'one_punch',
  'freeze',
  'mute'
] as const
export type AdminToggle = (typeof ADMIN_TOGGLES)[number]

export const ADMIN_BOOSTS = ['heal', 'feed', 'drink', 'sober', 'clear_wanted'] as const
export type AdminBoost = (typeof ADMIN_BOOSTS)[number]

export type AdminPowers = ReadonlySet<AdminToggle>

/** Speed x2: the move check allows twice the walking and running speed. Must match front/src/game/admin/adminPowers.ts. */
export const SPEED_POWER_FACTOR = 2

export function parseToggle(raw: unknown): AdminToggle | null {
  return ADMIN_TOGGLES.find((t) => t === raw) ?? null
}

export function parseBoost(raw: unknown): AdminBoost | null {
  return ADMIN_BOOSTS.find((b) => b === raw) ?? null
}

export function hasPower(player: Pick<Player, 'adminPowers'>, toggle: AdminToggle): boolean {
  return player.adminPowers?.has(toggle) === true
}

/** Invisible or muted: nobody hears this player's chat or voice. */
export function isSilenced(player: Pick<Player, 'adminPowers'>): boolean {
  return hasPower(player, 'invisible') || hasPower(player, 'mute')
}

export function withToggle(powers: AdminPowers | undefined, toggle: AdminToggle, on: boolean): AdminPowers {
  const next = new Set(powers)
  if (on) next.add(toggle)
  else next.delete(toggle)
  return next
}

/** The gauges a toggle holds full: god keeps health at 100, endless food and water keep hunger and thirst there. */
export function withPowers(stats: Stats, powers: AdminPowers | undefined): Stats {
  if (!powers || powers.size === 0) return stats
  return {
    health: powers.has('god') ? MAX_STAT : stats.health,
    hunger: powers.has('endless_food') ? MAX_STAT : stats.hunger,
    thirst: powers.has('endless_water') ? MAX_STAT : stats.thirst
  }
}

/** The gauges after a boost that fills one; sober and clear_wanted leave them as they are. */
export function boostedStats(stats: Stats, boost: AdminBoost): Stats {
  switch (boost) {
    case 'heal':
      return { ...stats, health: MAX_STAT }
    case 'feed':
      return { ...stats, hunger: MAX_STAT }
    case 'drink':
      return { ...stats, thirst: MAX_STAT }
    default:
      return stats
  }
}
