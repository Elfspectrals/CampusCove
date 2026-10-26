import { canUseDoor } from './doors.js'
import { worldBounds, worldHouse } from './world.js'

const MAX_SPEED = 8 * 1.25
const MAX_MOVE_BUDGET_SECONDS = 1
const MOVE_MARGIN = 1.5

function toInterior(house, x, z) {
  const dx = x - house.position.x
  const dz = z - house.position.z
  const cos = Math.cos(house.rotationY)
  const sin = Math.sin(house.rotationY)
  return {
    x: dx * cos - dz * sin - house.interiorOffset.x,
    z: dx * sin + dz * cos - house.interiorOffset.z
  }
}

export function unitAt(units, x, z) {
  for (const unit of units) {
    const house = unit.model_key ? worldHouse(unit.model_key) : null
    const bounds = unit.interior_bounds
    if (!house || !bounds) continue
    const p = toInterior(house, x, z)
    if (p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ) return unit
  }
  return null
}

function isLockedFor(room, unit, player) {
  return unit.door_locked && !room.openDoors.has(unit.public_id) && !canUseDoor(unit, player.accountId)
}

export function moveRejection(room, player, x, z, now) {
  const b = worldBounds()
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return 'out_of_world'
  const elapsed = Math.min((now - player.lastMoveAt) / 1000, MAX_MOVE_BUDGET_SECONDS)
  if (Math.hypot(x - player.x, z - player.z) > MAX_SPEED * elapsed + MOVE_MARGIN) return 'too_fast'
  const from = unitAt(room.housingUnits, player.x, player.z)
  const to = unitAt(room.housingUnits, x, z)
  if (from === to) return null
  if (from && isLockedFor(room, from, player)) return 'locked_in'
  if (to && isLockedFor(room, to, player)) return 'locked_house'
  return null
}
