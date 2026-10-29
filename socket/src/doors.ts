import type { HousingUnit, Player } from './types.ts'

const DOOR_REACH = 3

export function isWithinReach(player: Player, x: number, z: number): boolean {
  return Math.hypot(player.x - x, player.z - z) <= DOOR_REACH
}

export function isWithinDoorReach(player: Player, unit: HousingUnit): boolean {
  return isWithinReach(player, unit.pos_x, unit.pos_z)
}

export function workDoorId(workKey: string): string {
  return `work:${workKey}`
}

export function canUseDoor(unit: HousingUnit, accountId: number): boolean {
  if (!unit.door_locked) return true
  return unit.occupant_account_id === accountId || (unit.key_holder_account_ids ?? []).includes(accountId)
}
