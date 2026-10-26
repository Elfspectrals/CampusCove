const DOOR_REACH = 3

export function isWithinDoorReach(player, unit) {
  return Math.hypot(player.x - unit.pos_x, player.z - unit.pos_z) <= DOOR_REACH
}

export function canUseDoor(unit, accountId) {
  if (!unit.door_locked) return true
  return unit.occupant_account_id === accountId || (unit.key_holder_account_ids ?? []).includes(accountId)
}
