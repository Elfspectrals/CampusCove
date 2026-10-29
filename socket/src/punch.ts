import { unitAt } from './movement.ts'
import { hurt } from './survival.ts'
import { spendPunchStamina, staminaAt } from './stamina.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'

export const PUNCH_DAMAGE = 8
const PUNCH_COOLDOWN_MS = 800
const COOLDOWN_JITTER_MS = 100
const PUNCH_REACH = 2.5
const PUNCH_HEIGHT_REACH = 1
const PUNCH_FACING_COS = 0.3

export function canPunchNow(attacker: Player, now: number): boolean {
  return Boolean(attacker.stats) && now >= attacker.knockedOutUntil
    && now - attacker.lastPunchAt >= PUNCH_COOLDOWN_MS - COOLDOWN_JITTER_MS
}

export function punchDirection(attacker: Player, target: Player): { x: number, z: number, dist: number } | null {
  const dx = target.x - attacker.x
  const dz = target.z - attacker.z
  const dist = Math.hypot(dx, dz)
  return dist > 0 ? { x: dx / dist, z: dz / dist, dist } : null
}

export function canHit(room: GameRoom, attacker: Player, target: Player | null | undefined, now: number): target is Player {
  if (!target?.stats || target === attacker || now < target.knockedOutUntil) return false
  const dir = punchDirection(attacker, target)
  if (!dir || dir.dist > PUNCH_REACH || Math.abs(target.y - attacker.y) > PUNCH_HEIGHT_REACH) return false
  const facing = -Math.sin(attacker.ry) * dir.x - Math.cos(attacker.ry) * dir.z
  if (facing < PUNCH_FACING_COS) return false
  return unitAt(room.housingUnits, attacker.x, attacker.z) === unitAt(room.housingUnits, target.x, target.z)
}

export function onPunch(room: GameRoom, client: GameClient, payload: ClientPayload): void {
  const attacker = room.players.get(client.sessionId)
  const now = Date.now()
  if (!attacker || !canPunchNow(attacker, now)) return
  const targetSessionId = typeof payload?.targetSessionId === 'string' ? payload.targetSessionId : null
  const target = targetSessionId ? room.players.get(targetSessionId) : null
  const hit = canHit(room, attacker, target, now)
  const stamina = spendPunchStamina(attacker.stamina, attacker.lastPunchAt, now, hit)
  if (stamina === null) {
    client.send('punch_tired', { stamina: staminaAt(attacker.stamina, attacker.lastPunchAt, now) })
    return
  }
  attacker.stamina = stamina
  attacker.lastPunchAt = now
  const dir = hit ? punchDirection(attacker, target) : null
  const message = {
    sessionId: client.sessionId,
    targetSessionId: hit ? targetSessionId : null,
    dirX: dir ? dir.x : 0,
    dirZ: dir ? dir.z : 0
  }
  room.forEachClient((c) => c.send('user_punched', message))
  if (!hit) return
  const targetClient = room.clients.find((c) => c.sessionId === targetSessionId)
  if (targetClient) hurt(room, targetClient, target, PUNCH_DAMAGE, 'punch')
}
