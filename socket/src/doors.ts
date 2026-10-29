import type { HousingUnit, Player } from './types.ts'

const DOOR_REACH = 3
/** Door sounds are quiet: only players this close to the door hear them (the client fades them out to this distance). */
export const DOOR_SOUND_RADIUS = 5
export const DOOR_RATTLE_COOLDOWN_MS = 600

export type DoorSound = 'open' | 'close' | 'lock' | 'unlock' | 'rattle'

export function isWithinReach(player: Player, x: number, z: number): boolean {
  return Math.hypot(player.x - x, player.z - z) <= DOOR_REACH
}

export function isWithinDoorReach(player: Player, unit: HousingUnit): boolean {
  return isWithinReach(player, unit.pos_x, unit.pos_z)
}

export function hearsDoor(player: Player, x: number, z: number): boolean {
  return Math.hypot(player.x - x, player.z - z) <= DOOR_SOUND_RADIUS
}

/** Houses whose lock changed between two API snapshots; a house new to the snapshot makes no sound. */
export function lockChanges(previous: readonly HousingUnit[], next: readonly HousingUnit[]): Array<{ unit: HousingUnit, sound: 'lock' | 'unlock' }> {
  const before = new Map(previous.map((u) => [u.public_id, u]))
  return next.flatMap((unit) => {
    const old = before.get(unit.public_id)
    if (!old || old.door_locked === unit.door_locked) return []
    return [{ unit, sound: unit.door_locked ? 'lock' as const : 'unlock' as const }]
  })
}

export function workDoorId(workKey: string): string {
  return `work:${workKey}`
}

export function canUseDoor(unit: HousingUnit, accountId: number): boolean {
  if (!unit.door_locked) return true
  return unit.occupant_account_id === accountId || (unit.key_holder_account_ids ?? []).includes(accountId)
}
