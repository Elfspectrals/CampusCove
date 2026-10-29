// Hunger, thirst and health of the connected players. The live values are kept here (the rules are in
// survivalStats.js); the API stores them, owns the food items and bills the hospital (callRealtimeBackend).
import { callRealtimeBackend, errorPayload } from './backend.js'
import { CITY_SPAWN_RADIUS, SURVIVAL_TIME_SCALE } from './config.js'
import { toInterior, unitAt } from './movement.js'
import { spawnNear } from './players.js'
import { staminaAt } from './stamina.js'
import {
  FOUNTAIN_COOLDOWN_MS,
  MAX_STAT,
  SPEED_BOOST_MS,
  applyPortion,
  fallDamage,
  fountainSip,
  isWalkingDescent,
  normalizeStats,
  pickBed,
  respawnStats,
  startHealOverTime,
  tickHealOverTime,
  tickStats
} from './survivalStats.js'
import { citySpawn, worldClinic, worldFountains, worldHouse } from './world.js'

export const SURVIVAL_TICK_MS = 2000
const SAVE_EVERY_MS = 60_000
const KNOCKOUT_MS = 6000
const RECOVERY_MS = 5000
const CLINIC_HEAL_COOLDOWN_MS = 2000
const NURSE_REACH = 2.5
const NURSE_HEIGHT_REACH = 1.5
// A bite takes the front's eating animation (~1 s).
const CONSUME_COOLDOWN_MS = 900
const SIP_COOLDOWN_MS = 600
const FOUNTAIN_SIP_THIRST = 25
const FOUNTAIN_REACH = 2.2
const COOKER_REACH = 2.5
const COOKER_HEIGHT_REACH = 1.5
const EYE_HEIGHT = 1.6
const COOKER_KEYS = ['decor_stove_oven', 'decor_bbq_grill']
const CODE_PATTERN = /^[a-z0-9_]{1,64}$/
// Fountain budget per account (survivalStats.fountainSip), kept across reconnects; time scale speeds it up in playtests.
const fountainBudgets = new Map()
const FOUNTAIN_COOLDOWN = FOUNTAIN_COOLDOWN_MS / SURVIVAL_TIME_SCALE

function warn(context, error) {
  console.warn(`[survival] ${context}:`, error instanceof Error ? error.message : error)
}

function sendStats(client, player) {
  const { health, hunger, thirst } = player.stats
  client.send('survival', {
    health,
    hunger,
    thirst,
    speedBoostUntil: player.speedBoostUntil,
    healUntil: player.healOverTime?.until ?? null,
    stamina: staminaAt(player.stamina, player.lastPunchAt, Date.now())
  })
}

function setStats(player, stats) {
  player.stats = stats
  player.statsDirty = true
}

/** Right after the join: last saved gauges (a player who left while knocked out comes back on their feet). */
export async function loadSurvival(client, player) {
  let stats = normalizeStats(null)
  try {
    const data = await callRealtimeBackend(player.token, '/survival', 'GET')
    stats = normalizeStats(data?.stats)
  } catch (error) {
    warn('load failed', error)
  }
  player.stats = stats.health > 0 ? stats : respawnStats(stats)
  player.statsDirty = stats.health <= 0
  sendStats(client, player)
}

export async function saveSurvival(player) {
  if (!player.stats || !player.statsDirty || !player.token) return
  player.statsDirty = false
  player.lastStatsSavedAt = Date.now()
  try {
    await callRealtimeBackend(player.token, '/survival', 'PUT', player.stats)
  } catch (error) {
    player.statsDirty = true
    warn('save failed', error)
  }
}

export function tickSurvival(room, dtSeconds) {
  const now = Date.now()
  room.forEachClient((client) => {
    const player = room.players.get(client.sessionId)
    if (!player?.stats || now < player.knockedOutUntil) return
    const { stats: decayed, damage } = tickStats(player.stats, dtSeconds, SURVIVAL_TIME_SCALE)
    const { stats, healOverTime } = tickHealOverTime(decayed, player.healOverTime, now)
    player.healOverTime = healOverTime
    setStats(player, stats)
    if (damage > 0) client.send('survival_damage', { amount: damage, cause: stats.hunger === 0 ? 'hunger' : 'thirst' })
    sendStats(client, player)
    if (stats.health <= 0) knockOut(room, client, player)
    else if (now - player.lastStatsSavedAt >= SAVE_EVERY_MS) void saveSurvival(player)
  })
}

export function hurt(room, client, player, amount, cause) {
  if (!player.stats || amount <= 0 || Date.now() < player.knockedOutUntil) return
  setStats(player, { ...player.stats, health: Math.max(0, player.stats.health - amount) })
  client.send('survival_damage', { amount, cause })
  sendStats(client, player)
  if (player.stats.health <= 0) knockOut(room, client, player)
}

/** Health reached 0: the player passes out, pays the hospital and wakes up beside a clinic bed (the town spawn without a clinic). */
function knockOut(room, client, player) {
  player.knockedOutUntil = Date.now() + KNOCKOUT_MS
  player.speedBoostUntil = 0
  player.healOverTime = null
  client.send('survival_knocked_out', { durationMs: KNOCKOUT_MS })
  callRealtimeBackend(player.token, '/survival/hospital', 'POST')
    .then((data) => client.send('survival_hospital_bill', {
      billed: Number(data?.billed) || 0,
      balanceAfter: typeof data?.balance_after === 'number' ? data.balance_after : null
    }))
    .catch((error) => warn('hospital bill failed', error))
  room.clock.setTimeout(() => {
    if (room.players.get(client.sessionId) !== player) return
    const bed = claimClinicBed(room, player)
    const spawn = bed ? { ...bed.position, ry: bed.yaw } : spawnNear(citySpawn(), CITY_SPAWN_RADIUS)
    const recoveringMs = bed ? RECOVERY_MS : 0
    Object.assign(player, spawn, {
      fallPeakY: spawn.y,
      lastMoveAt: Date.now(),
      knockedOutUntil: bed ? Date.now() + recoveringMs : 0
    })
    setStats(player, respawnStats(player.stats))
    client.send('survival_respawn', {
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.ry,
      bed: bed ? [bed.bed.x, bed.bed.y, bed.bed.z] : null,
      recoveringMs
    })
    sendStats(client, player)
    room.broadcastMove(client, player)
    void saveSurvival(player)
    if (bed) room.clock.setTimeout(() => releaseClinicBed(room, player), recoveringMs)
  }, KNOCKOUT_MS)
}

function claimClinicBed(room, player) {
  const clinic = worldClinic()
  if (!clinic) return null
  const bed = pickBed(clinic.beds, room.clinicBeds)
  room.clinicBeds.set(bed.id, { sessionId: player.sessionId, usedAt: Date.now() })
  player.clinicBedId = bed.id
  return bed
}

export function releaseClinicBed(room, player) {
  const occupant = room.clinicBeds.get(player.clinicBedId)
  if (occupant?.sessionId === player.sessionId) occupant.sessionId = null
  player.clinicBedId = null
}

/** Called for every accepted move: tracks the highest point of a fall and hurts on landing. */
export function onSurvivalMove(room, client, player, previousY, distXZ) {
  const drop = previousY - player.y
  if (isWalkingDescent(drop, distXZ)) player.fallPeakY -= drop
  if (player.y >= previousY - 0.01) {
    const damage = fallDamage(player.fallPeakY, previousY)
    player.fallPeakY = player.y
    if (damage > 0) hurt(room, client, player, damage, 'fall')
  }
}

function readCode(payload) {
  const code = typeof payload?.code === 'string' ? payload.code.trim() : ''
  return CODE_PATTERN.test(code) ? code : null
}

/** One bite / sip of the item held in the hotbar. */
export async function onConsume(room, client, payload) {
  const player = room.players.get(client.sessionId)
  const code = readCode(payload)
  const now = Date.now()
  if (!player?.stats || !code || now < player.knockedOutUntil || now - player.lastConsumeAt < CONSUME_COOLDOWN_MS) return
  player.lastConsumeAt = now
  try {
    const data = await callRealtimeBackend(player.token, '/survival/consume', 'POST', { code })
    const portion = data?.consumed ?? {}
    let stats = applyPortion(player.stats, portion)
    if (portion.effect === 'heal_over_time') {
      const doseAt = Date.now()
      stats = tickHealOverTime(stats, player.healOverTime, doseAt).stats
      player.healOverTime = startHealOverTime(doseAt, portion.health ?? 0)
    }
    setStats(player, stats)
    if (portion.effect === 'speed_boost') player.speedBoostUntil = Date.now() + SPEED_BOOST_MS
    client.send('survival_consumed', {
      code,
      quantity: Number(portion.quantity) || 0,
      portionsLeft: Number(portion.portions_left) || 0,
      effect: portion.effect ?? null
    })
    sendStats(client, player)
    const action = (portion.thirst ?? 0) > (portion.hunger ?? 0) ? 'drink' : 'eat'
    room.forEachClient((c) => c.send('user_action', { sessionId: client.sessionId, action, code }), client)
    if (player.stats.health <= 0) knockOut(room, client, player)
  } catch (error) {
    client.send('survival_error', errorPayload(error, 'You cannot eat this.', 'consume_failed'))
  }
}

/** A drink at a town drinking fountain (free, then a 30 min cooldown on every fountain). */
export function onDrinkFountain(room, client) {
  const player = room.players.get(client.sessionId)
  const now = Date.now()
  if (!player?.stats || now < player.knockedOutUntil || now - player.lastSipAt < SIP_COOLDOWN_MS) return
  const near = worldFountains().some((f) => Math.hypot(player.x - f.x, player.z - f.z) <= FOUNTAIN_REACH)
  if (!near) return
  player.lastSipAt = now
  const key = player.accountId ?? client.sessionId
  const sip = fountainSip(fountainBudgets.get(key), now, FOUNTAIN_COOLDOWN)
  fountainBudgets.set(key, sip.state)
  if (sip.readyAt > now) client.send('fountain_cooldown', { remainingMs: sip.readyAt - now })
  if (!sip.allowed) return
  setStats(player, applyPortion(player.stats, { thirst: FOUNTAIN_SIP_THIRST }))
  sendStats(client, player)
  room.forEachClient((c) => c.send('user_action', { sessionId: client.sessionId, action: 'drink', code: null }), client)
}

function isNearCooker(room, player) {
  const unit = unitAt(room.housingUnits, player.x, player.z)
  if (!unit?.model_key) return false
  const house = worldHouse(unit.model_key)
  const furniture = room.houseFurniture.find((h) => h.model_key === unit.model_key)
  if (!house || !furniture) return false
  const p = toInterior(house, player.x, player.z)
  const feetY = player.y - EYE_HEIGHT - house.position.y - house.interiorOffset.y
  return furniture.objects.some((o) => COOKER_KEYS.includes(o.objectKey) && Math.hypot(o.x - p.x, o.z - p.z) <= COOKER_REACH
    && Math.abs(o.y - feetY) <= COOKER_HEIGHT_REACH)
}

/** Cooks the raw item held in hand on a stove or a barbecue placed in the house the player stands in. */
export async function onCook(room, client, payload) {
  const player = room.players.get(client.sessionId)
  const code = readCode(payload)
  if (!player?.token || !code || Date.now() < player.knockedOutUntil) return
  if (!isNearCooker(room, player)) {
    client.send('survival_error', { message: 'Stand next to a stove or a barbecue to cook.', code: 'no_cooker' })
    return
  }
  try {
    const data = await callRealtimeBackend(player.token, '/survival/cook', 'POST', { code })
    client.send('survival_cooked', { code, cookedCode: data?.cooked?.code ?? null })
  } catch (error) {
    client.send('survival_error', errorPayload(error, 'Cooking failed.', 'cook_failed'))
  }
}

function isNearNurse(player) {
  const nurse = worldClinic()?.nurse
  if (!nurse) return false
  return Math.hypot(player.x - nurse.x, player.z - nurse.z) <= NURSE_REACH
    && Math.abs(player.y - EYE_HEIGHT - nurse.y) <= NURSE_HEIGHT_REACH
}

export async function onClinicHeal(room, client) {
  const player = room.players.get(client.sessionId)
  const now = Date.now()
  if (!player?.stats || !player.token || now < player.knockedOutUntil || player.clinicHealPending) return
  if (now - player.lastClinicHealAt < CLINIC_HEAL_COOLDOWN_MS) return
  player.lastClinicHealAt = now
  if (!isNearNurse(player)) {
    client.send('survival_error', { message: 'Talk to the nurse at the clinic desk.', code: 'no_nurse' })
    return
  }
  if (player.stats.health >= MAX_STAT) {
    client.send('survival_error', { message: 'You are already in good health.', code: 'already_healthy' })
    return
  }
  player.clinicHealPending = true
  try {
    const data = await callRealtimeBackend(player.token, '/survival/clinic-heal', 'POST')
    player.healOverTime = null
    setStats(player, { ...player.stats, health: MAX_STAT })
    client.send('clinic_healed', {
      billed: Number(data?.billed) || 0,
      balanceAfter: typeof data?.balance_after === 'number' ? data.balance_after : null
    })
    sendStats(client, player)
    void saveSurvival(player)
  } catch (error) {
    client.send('survival_error', errorPayload(error, 'The clinic could not heal you.', 'clinic_heal_failed'))
  } finally {
    player.clinicHealPending = false
  }
}
