import { canUseDoor } from './doors.ts'
import { drainStamina, JUMP_STAMINA_COST, SPRINT_STAMINA_PER_S } from './stamina.ts'
import { SPEED_BOOST_FACTOR } from './survivalStats.ts'
import type { GameRoom, HousingUnit, Player } from './types.ts'
import { type WorldHouse, worldBounds, worldHouse } from './world.ts'

/** Must match WALK_SPEED / SPRINT_SPEED in front/src/game/gameRoomConstants.ts, plus a 25% margin. */
const MAX_WALK_SPEED = 5 * 1.25
const MAX_SPRINT_SPEED = 8.5 * 1.25
const MAX_MOVE_BUDGET_SECONDS = 1
const MOVE_MARGIN = 1.5

export type MoveRejection = 'out_of_world' | 'knocked_out' | 'too_fast' | 'locked_in' | 'locked_house'

export function toInterior(house: WorldHouse, x: number, z: number): { x: number, z: number } {
  const dx = x - house.position.x
  const dz = z - house.position.z
  const cos = Math.cos(house.rotationY)
  const sin = Math.sin(house.rotationY)
  return {
    x: dx * cos - dz * sin - house.interiorOffset.x,
    z: dx * sin + dz * cos - house.interiorOffset.z
  }
}

export function unitAt(units: HousingUnit[], x: number, z: number): HousingUnit | null {
  for (const unit of units) {
    const house = unit.model_key ? worldHouse(unit.model_key) : null
    const bounds = unit.interior_bounds
    if (!house || !bounds) continue
    const p = toInterior(house, x, z)
    if (p.x >= bounds.minX && p.x <= bounds.maxX && p.z >= bounds.minZ && p.z <= bounds.maxZ) return unit
  }
  return null
}

function isLockedFor(room: GameRoom, unit: HousingUnit, player: Player): boolean {
  return unit.door_locked && !room.openDoors.has(unit.public_id) && !canUseDoor(unit, player.accountId)
}

export function moveRejection(room: GameRoom, player: Player, x: number, z: number, now: number, sprinting = false): MoveRejection | null {
  const b = worldBounds()
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return 'out_of_world'
  if (now < player.knockedOutUntil) return 'knocked_out'
  const elapsed = Math.min((now - player.lastMoveAt) / 1000, MAX_MOVE_BUDGET_SECONDS)
  const baseSpeed = sprinting ? MAX_SPRINT_SPEED : MAX_WALK_SPEED
  const maxSpeed = now < player.speedBoostUntil ? baseSpeed * SPEED_BOOST_FACTOR : baseSpeed
  if (Math.hypot(x - player.x, z - player.z) > maxSpeed * elapsed + MOVE_MARGIN) return 'too_fast'
  const from = unitAt(room.housingUnits, player.x, player.z)
  const to = unitAt(room.housingUnits, x, z)
  if (from === to) return null
  if (from && isLockedFor(room, from, player)) return 'locked_in'
  if (to && isLockedFor(room, to, player)) return 'locked_house'
  return null
}

function spendStamina(player: Player, now: number, amount: number): void {
  player.stamina = drainStamina(player.stamina, player.staminaSpentAt, now, amount)
  player.staminaSpentAt = now
}

/** Sprinting drains stamina for the time spent running, so punches stay limited by the same bar. */
export function spendSprintStamina(player: Player, elapsedMs: number, now: number): void {
  spendStamina(player, now, (SPRINT_STAMINA_PER_S * Math.min(elapsedMs, MAX_MOVE_BUDGET_SECONDS * 1000)) / 1000)
}

export function onJump(player: Player | undefined, now: number): void {
  if (!player?.stats || now < player.knockedOutUntil) return
  spendStamina(player, now, JUMP_STAMINA_COST)
}
