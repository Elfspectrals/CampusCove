// Hunger, thirst and health of the connected players. The live values are kept here (the rules are in
// survivalStats.js); the API stores them, owns the food items and bills the hospital (callRealtimeBackend).
import { callRealtimeBackend, errorPayload } from './backend.js'
import { SURVIVAL_TIME_SCALE } from './config.js'
import { toInterior, unitAt } from './movement.js'
import {
  SPEED_BOOST_MS,
  applyPortion,
  fallDamage,
  normalizeStats,
  respawnStats,
  tickStats
} from './survivalStats.js'
import { citySpawn, worldFountains, worldHouse } from './world.js'

export const SURVIVAL_TICK_MS = 2000
const SAVE_EVERY_MS = 60_000
const KNOCKOUT_MS = 6000
// A bite takes the front's eating animation (~1 s); a fountain sip is shorter, you keep holding the click.
const CONSUME_COOLDOWN_MS = 900
const SIP_COOLDOWN_MS = 600
const FOUNTAIN_SIP_THIRST = 4
const FOUNTAIN_REACH = 2.2
const COOKER_REACH = 2.5
const COOKER_KEYS = ['decor_stove_oven', 'decor_bbq_grill']
const CODE_PATTERN = /^[a-z0-9_]{1,64}$/

function warn(context, error) {
  console.warn(`[survival] ${context}:`, error instanceof Error ? error.message : error)
}

function sendStats(client, player) {
  const { health, hunger, thirst } = player.stats
  client.send('survival', { health, hunger, thirst, speedBoostUntil: player.speedBoostUntil })
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
    const { stats, damage } = tickStats(player.stats, dtSeconds, SURVIVAL_TIME_SCALE)
    setStats(player, stats)
    if (damage > 0) client.send('survival_damage', { amount: damage, cause: stats.hunger === 0 ? 'hunger' : 'thirst' })
    sendStats(client, player)
    if (stats.health <= 0) knockOut(room, client, player)
    else if (now - player.lastStatsSavedAt >= SAVE_EVERY_MS) void saveSurvival(player)
  })
}

function hurt(room, client, player, amount, cause) {
  if (!player.stats || amount <= 0 || Date.now() < player.knockedOutUntil) return
  setStats(player, { ...player.stats, health: Math.max(0, player.stats.health - amount) })
  client.send('survival_damage', { amount, cause })
  sendStats(client, player)
  if (player.stats.health <= 0) knockOut(room, client, player)
}

/** Health reached 0: the player passes out, pays the hospital and wakes up at home (or at the town spawn). */
function knockOut(room, client, player) {
  player.knockedOutUntil = Date.now() + KNOCKOUT_MS
  player.speedBoostUntil = 0
  client.send('survival_knocked_out', { durationMs: KNOCKOUT_MS })
  callRealtimeBackend(player.token, '/survival/hospital', 'POST')
    .then((data) => client.send('survival_hospital_bill', { billed: Number(data?.billed) || 0 }))
    .catch((error) => warn('hospital bill failed', error))
  room.clock.setTimeout(() => {
    if (room.players.get(client.sessionId) !== player) return
    const spawn = respawnPoint(room, player)
    Object.assign(player, spawn, { fallPeakY: spawn.y, lastMoveAt: Date.now(), knockedOutUntil: 0 })
    setStats(player, respawnStats(player.stats))
    client.send('survival_respawn', { ...spawn })
    sendStats(client, player)
    room.broadcastMove(client, player)
    void saveSurvival(player)
  }, KNOCKOUT_MS)
}

function respawnPoint(room, player) {
  const home = room.housingUnits.find((u) => u.status === 'occupied' && u.occupant_account_id === player.accountId)
  const spawn = citySpawn()
  return home ? { x: home.pos_x, y: spawn.y, z: home.pos_z } : { ...spawn }
}

/** Called for every accepted move: tracks the highest point of a fall and hurts on landing. */
export function onSurvivalMove(room, client, player, previousY) {
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
    setStats(player, applyPortion(player.stats, portion))
    if (portion.effect === 'speed_boost') player.speedBoostUntil = Date.now() + SPEED_BOOST_MS
    client.send('survival_consumed', {
      code,
      quantity: Number(portion.quantity) || 0,
      portionsLeft: Number(portion.portions_left) || 0,
      effect: portion.effect ?? null
    })
    sendStats(client, player)
    const action = (portion.thirst ?? 0) > (portion.hunger ?? 0) ? 'drink' : 'eat'
    room.forEachClient((c) => c.send('user_action', { sessionId: client.sessionId, action }), client)
    if (player.stats.health <= 0) knockOut(room, client, player)
  } catch (error) {
    client.send('survival_error', errorPayload(error, 'You cannot eat this.', 'consume_failed'))
  }
}

/** A sip at a town drinking fountain (free, slow). */
export function onDrinkFountain(room, client) {
  const player = room.players.get(client.sessionId)
  const now = Date.now()
  if (!player?.stats || now < player.knockedOutUntil || now - player.lastSipAt < SIP_COOLDOWN_MS) return
  const near = worldFountains().some((f) => Math.hypot(player.x - f.x, player.z - f.z) <= FOUNTAIN_REACH)
  if (!near) return
  player.lastSipAt = now
  setStats(player, applyPortion(player.stats, { thirst: FOUNTAIN_SIP_THIRST }))
  sendStats(client, player)
  room.forEachClient((c) => c.send('user_action', { sessionId: client.sessionId, action: 'drink' }), client)
}

function isNearCooker(room, player) {
  const unit = unitAt(room.housingUnits, player.x, player.z)
  if (!unit?.model_key) return false
  const house = worldHouse(unit.model_key)
  const furniture = room.houseFurniture.find((h) => h.model_key === unit.model_key)
  if (!house || !furniture) return false
  const p = toInterior(house, player.x, player.z)
  return furniture.objects.some((o) => COOKER_KEYS.includes(o.objectKey) && Math.hypot(o.x - p.x, o.z - p.z) <= COOKER_REACH)
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
