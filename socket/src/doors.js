const DOOR_REACH = 3

export function isWithinReach(player, x, z) {
  return Math.hypot(player.x - x, player.z - z) <= DOOR_REACH
}

export function isWithinDoorReach(player, unit) {
  return isWithinReach(player, unit.pos_x, unit.pos_z)
}

export function workDoorId(workKey) {
  return `work:${workKey}`
}

export function canUseDoor(unit, accountId) {
  if (!unit.door_locked) return true
  return unit.occupant_account_id === accountId || (unit.key_holder_account_ids ?? []).includes(accountId)
}
