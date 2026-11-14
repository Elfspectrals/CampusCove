// Admin tools on the watch: teleport to a public place, or bring a player next to you. Only accounts the API
// flags is_admin (GET /user at join) get an answer; everyone else is ignored.
import { randomUUID } from 'node:crypto'
import { type AdminBoost, type AdminToggle, boostedStats, hasPower, parseBoost, parseToggle, withToggle } from './adminPowers.ts'
import { callRealtimeBackend, errorPayload, parseAccountId } from './backend.ts'
import { lockUpOnJoin, release, saveJail } from './jail.ts'
import { publicPlayer } from './players.ts'
import { intIn, refreshMarket } from './market.ts'
import { leavePub } from './pubGames.ts'
import { parisHourAfter, quizStartAfter } from './pubQuiz.ts'
import { startQuizSoon } from './pubQuizEvent.ts'
import type { StorageRoom } from './storageAuction.ts'
import { SALE_HOUR_PARIS } from './storageSale.ts'
import { sendStats, setStats } from './survival.ts'
import { type TradeRoom, checkTradeDistance } from './trade.ts'
import type { ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { clearWanted, setWantedStars } from './wanted.ts'
import { type TeleportDestination, teleportDestinations } from './world.ts'

/** A summoned player lands this far in front of the admin, facing them. */
export const SUMMON_DISTANCE = 1.5
const ADMIN_ACTION_COOLDOWN_MS = 500
export const ADMIN_MAX_MONEY = 100_000
export const ADMIN_MAX_QUANTITY = 999
export const ADMIN_MAX_MARKET_MINUTES = 240
const ITEM_CODE = /^[A-Za-z0-9_]{1,64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WALLETS = ['cash', 'bank'] as const
type AdminAction =
  | 'items'
  | 'money'
  | 'item'
  | 'market_open'
  | 'market_close'
  | 'taxes'
  | 'power'
  | 'house'
  | 'moderate'
  | 'take_money'
  | 'take_item'
  | 'take_house'
  | 'inventory'
export const ADMIN_MAX_JAIL_MINUTES = 60
/** Close code of a kicked player's connection; the front shows why (useGameRealtime). */
export const KICK_CLOSE_CODE = 4002

export type AdminRoom = GameRoom & TradeRoom
export type AdminPanelRoom = AdminRoom & { pollHousingUnits(): Promise<void> }
export type AdminMenuRoom = AdminRoom & StorageRoom

type ScheduledEvent = { state: 'scheduled', startsAt: number }
type QuizEvent = ScheduledEvent | { state: 'registration' | 'running', startsAt: number }
type StorageEvent = ScheduledEvent | { state: 'running', index: number, count: number }
type MarketEvent = { open: boolean, opensAt: string, closesAt: string } | null

type Destinations = () => TeleportDestination[]

function adminOf(room: AdminRoom, client: GameClient): Player | null {
  const player = room.players.get(client.sessionId)
  return player?.isAdmin ? player : null
}

function sendError(client: GameClient, message: string): void {
  client.send('admin_error', { message })
}

/** Moves a player server-side and tells everyone: the player snaps there, the others see them jump (no glide). */
export function teleportPlayer(room: AdminRoom, player: Player, to: Vec3, yaw: number, now = Date.now()): void {
  leavePub(room, player)
  Object.assign(player, { x: to.x, y: to.y, z: to.z, ry: yaw, fallPeakY: to.y, lastMoveAt: now })
  const client = room.clients.find((c) => c.sessionId === player.sessionId)
  if (!client) return
  client.send('teleported', { x: to.x, y: to.y, z: to.z, ry: yaw })
  room.broadcastMove(client, player)
  checkTradeDistance(room, player)
}

function quizEvent(room: AdminMenuRoom, now: number): QuizEvent {
  const quiz = room.pub.quiz
  if (quiz?.phase.kind === 'registration') return { state: 'registration', startsAt: quiz.startsAt }
  if (quiz?.phase.kind === 'question') return { state: 'running', startsAt: quiz.startsAt }
  return { state: 'scheduled', startsAt: quizStartAfter(now) }
}

function storageEvent(room: AdminMenuRoom, now: number): StorageEvent {
  const sale = room.storageAuction.sale
  if (sale) return { state: 'running', index: sale.index, count: sale.lots.length }
  return { state: 'scheduled', startsAt: parisHourAfter(now, SALE_HOUR_PARIS) }
}

function marketEvent(room: AdminMenuRoom): MarketEvent {
  const market = room.market
  return market ? { open: market.open, opensAt: market.opens_at, closesAt: market.closes_at } : null
}

/** 'admin_open': the places, the players and the state of each event the watch's admin app lists. */
export function onAdminOpen(room: AdminMenuRoom, client: GameClient, destinations: Destinations = teleportDestinations, now = Date.now()): void {
  const admin = adminOf(room, client)
  if (!admin) return
  const players = [...room.players.values()]
    .filter((p) => p.sessionId !== admin.sessionId)
    .map((p) => ({ sessionId: p.sessionId, pseudo: p.pseudo, distance: Math.hypot(p.x - admin.x, p.z - admin.z), stars: p.wantedStars }))
    .sort((a, b) => a.pseudo.localeCompare(b.pseudo))
  const events = { quiz: quizEvent(room, now), storage: storageEvent(room, now), market: marketEvent(room) }
  client.send('admin_menu', { destinations: destinations().map(({ key, name }) => ({ key, name })), players, events })
}

function coolingDown(admin: Player, now: number): boolean {
  if (now - admin.lastAdminActionAt < ADMIN_ACTION_COOLDOWN_MS) return true
  admin.lastAdminActionAt = now
  return false
}

/** 'admin_teleport' { key }: the admin goes to one of the listed places. */
export function onAdminTeleport(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), destinations: Destinations = teleportDestinations): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const key = typeof payload?.key === 'string' ? payload.key : null
  const destination = destinations().find((d) => d.key === key)
  if (!destination) {
    sendError(client, 'Unknown place.')
    return
  }
  teleportPlayer(room, admin, destination.position, destination.yaw, now)
}

/** 'admin_summon' { sessionId }: the player appears in front of the admin, facing them. */
export function onAdminSummon(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const targetId = typeof payload?.sessionId === 'string' ? payload.sessionId : null
  const target = targetId ? room.players.get(targetId) : undefined
  if (!target || target.sessionId === admin.sessionId) {
    sendError(client, 'This player is no longer here.')
    return
  }
  // a knocked-out or bedridden player is held by the clinic; moving them would fight the recovery
  if (now < target.knockedOutUntil || target.clinicBedId) {
    sendError(client, `${target.pseudo} is at the clinic right now.`)
    return
  }
  const to = {
    x: admin.x - Math.sin(admin.ry) * SUMMON_DISTANCE,
    y: admin.y,
    z: admin.z - Math.cos(admin.ry) * SUMMON_DISTANCE
  }
  teleportPlayer(room, target, to, admin.ry + Math.PI, now)
  const targetClient = room.clients.find((c) => c.sessionId === target.sessionId)
  targetClient?.send('admin_summoned', { byPseudo: admin.pseudo })
}

function otherPlayer(room: AdminRoom, admin: Player, payload: ClientPayload): Player | null {
  const targetId = typeof payload?.sessionId === 'string' ? payload.sessionId : null
  const target = targetId ? room.players.get(targetId) : undefined
  return target && target.sessionId !== admin.sessionId ? target : null
}

export function onAdminGoto(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const target = otherPlayer(room, admin, payload)
  if (!target) {
    sendError(client, 'This player is no longer here.')
    return
  }
  const to = {
    x: target.x - Math.sin(target.ry) * SUMMON_DISTANCE,
    y: target.y,
    z: target.z - Math.cos(target.ry) * SUMMON_DISTANCE
  }
  teleportPlayer(room, admin, to, target.ry + Math.PI, now)
}

export async function onAdminPlayer(room: AdminRoom, client: GameClient, payload: ClientPayload): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin) return
  const target = grantTarget(room, payload)
  if (!target) return sendError(client, 'This player is no longer here.')
  try {
    const wallets = await callRealtimeBackend(admin.token, `/admin/game/wallets?account_id=${target.accountId}`, 'GET')
    client.send('admin_player', { sessionId: target.player.sessionId, accountId: target.accountId, cash: wallets.cash, bank: wallets.bank, ...liveSheet(target.player) })
  } catch (error) {
    sendError(client, errorPayload(error, 'Could not read this player.', 'admin_failed').message)
  }
}

export function onAdminQuizStart(room: AdminRoom, client: GameClient, now = Date.now()): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  startQuizSoon(room, now)
}

function sendFailure(client: GameClient, action: AdminAction, error: unknown, fallback: string): void {
  console.warn(`[admin] ${action} failed:`, error instanceof Error ? error.message : error)
  client.send('admin_result', { action, ok: false, message: errorPayload(error, fallback, 'admin_failed').message })
}

function refuse(client: GameClient, action: AdminAction, message: string): void {
  client.send('admin_result', { action, ok: false, message })
}

function grantTarget(room: AdminRoom, payload: ClientPayload): { player: Player, accountId: number } | null {
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : null
  const player = sessionId ? room.players.get(sessionId) : undefined
  const accountId = parseAccountId(player?.accountId)
  return player && accountId !== null ? { player, accountId } : null
}

function clientOf(room: AdminRoom, player: Player): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === player.sessionId)
}

export async function onAdminItems(room: AdminRoom, client: GameClient, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  try {
    const data = await callRealtimeBackend(admin.token, '/admin/game/items', 'GET')
    client.send('admin_items', { items: Array.isArray(data?.items) ? data.items : [] })
  } catch (error) {
    sendFailure(client, 'items', error, 'Could not load the items.')
  }
}

export async function onAdminGiveMoney(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), newRef: () => string = randomUUID): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const wallet = WALLETS.find((w) => w === payload?.wallet) ?? null
  const amount = intIn(payload?.amount, 1, ADMIN_MAX_MONEY)
  if (wallet === null || amount === null) return refuse(client, 'money', 'This amount is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'money', 'This player is no longer here.')
  const ref = newRef()
  try {
    const balances = await callRealtimeBackend(admin.token, '/admin/game/money', 'POST', { account_id: target.accountId, wallet, amount, ref })
    client.send('admin_result', { action: 'money', ok: true, sessionId: target.player.sessionId, pseudo: target.player.pseudo, wallet, amount, cash: balances.cash, bank: balances.bank })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'money', byPseudo: admin.pseudo, wallet, amount, cash: balances.cash, bank: balances.bank })
  } catch (error) {
    sendFailure(client, 'money', error, 'Could not give the money.')
  }
}

export async function onAdminGiveItem(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), newRef: () => string = randomUUID): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const code = typeof payload?.code === 'string' && ITEM_CODE.test(payload.code) ? payload.code : null
  const quantity = intIn(payload?.quantity, 1, ADMIN_MAX_QUANTITY)
  if (code === null || quantity === null) return refuse(client, 'item', 'This item or quantity is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'item', 'This player is no longer here.')
  const ref = newRef()
  try {
    await callRealtimeBackend(admin.token, '/admin/game/items', 'POST', { account_id: target.accountId, code, quantity, ref })
    client.send('admin_result', { action: 'item', ok: true, pseudo: target.player.pseudo, code, quantity })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'item', byPseudo: admin.pseudo, code, quantity })
  } catch (error) {
    sendFailure(client, 'item', error, 'Could not give the item.')
  }
}

export async function onAdminMarket(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin?.token || coolingDown(admin, now)) return
  if (payload?.action === 'open') {
    const minutes = intIn(payload.minutes, 1, ADMIN_MAX_MARKET_MINUTES)
    if (minutes === null) return refuse(client, 'market_open', 'Choose between 1 and 240 minutes.')
    try {
      const market = await callRealtimeBackend(admin.token, '/admin/game/market/open', 'POST', { minutes })
      client.send('admin_result', { action: 'market_open', ok: true, closesAt: market.closes_at })
    } catch (error) {
      return sendFailure(client, 'market_open', error, 'Could not open the market.')
    }
  } else if (payload?.action === 'close') {
    try {
      const closed = await callRealtimeBackend(admin.token, '/admin/game/market/close', 'POST')
      client.send('admin_result', { action: 'market_close', ok: true, returned: closed.returned })
    } catch (error) {
      return sendFailure(client, 'market_close', error, 'Could not close the market.')
    }
  } else {
    return
  }
  await refreshMarket(room, admin.token)
}

export async function onAdminTaxes(room: AdminPanelRoom, client: GameClient, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  try {
    const summary = await callRealtimeBackend(admin.token, '/admin/game/taxes/collect', 'POST')
    client.send('admin_result', { action: 'taxes', ok: true, charged: summary.charged, seized: summary.seized })
  } catch (error) {
    return sendFailure(client, 'taxes', error, 'Could not collect the taxes.')
  }
  await room.pollHousingUnits()
}

/** The live part of a player sheet: gauges, wanted stars and the admin toggles on them. */
function liveSheet(player: Player) {
  const stats = player.stats ?? { health: 0, hunger: 0, thirst: 0 }
  return {
    stars: player.wantedStars,
    vitals: { health: Math.round(stats.health), hunger: Math.round(stats.hunger), thirst: Math.round(stats.thirst), intoxication: Math.round(player.intoxication) },
    powers: [...(player.adminPowers ?? [])]
  }
}

function applyBoost(room: AdminRoom, player: Player, boost: AdminBoost): void {
  if (boost === 'sober') player.intoxication = 0
  else if (boost === 'clear_wanted') clearWanted(room, player)
  else if (player.stats) setStats(player, boostedStats(player.stats, boost))
}

/**
 * 'admin_power' { sessionId, power, on? }: a toggle (god, endless_food, endless_water) with `on` true or false, or a
 * one-shot boost (heal, feed, drink, sober, clear_wanted). Only on a connected player whose gauges are loaded.
 */
export function onAdminPower(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const toggle: AdminToggle | null = parseToggle(payload?.power)
  const boost: AdminBoost | null = toggle ? null : parseBoost(payload?.power)
  const on = typeof payload?.on === 'boolean' ? payload.on : null
  if ((!toggle && !boost) || (toggle && on === null)) return refuse(client, 'power', 'This power is not valid.')
  const target = grantTarget(room, payload)
  if (!target?.player.stats) return refuse(client, 'power', 'This player is no longer here.')
  const player = target.player
  const targetClient = clientOf(room, player)
  if (toggle) {
    const wasInvisible = hasPower(player, 'invisible')
    const wasFlying = hasPower(player, 'fly')
    player.adminPowers = withToggle(player.adminPowers, toggle, on === true)
    // the drop back to the ground after a flight is never a fall
    if (wasFlying && !hasPower(player, 'fly')) player.fallPeakY = Number.NEGATIVE_INFINITY
    if (player.stats) setStats(player, player.stats)
    if (wasInvisible !== hasPower(player, 'invisible')) showOrHide(room, player)
    // the target's own client needs fly, speed, freeze and stamina to move the way the server now allows
    targetClient?.send('admin_powers', { powers: [...player.adminPowers] })
  } else if (boost) {
    applyBoost(room, player, boost)
  }
  if (targetClient) sendStats(targetClient, player)
  const power = toggle ?? boost
  client.send('admin_result', { action: 'power', ok: true, sessionId: player.sessionId, pseudo: player.pseudo, power, on: toggle ? on : null, ...liveSheet(player) })
  targetClient?.send('admin_granted', { kind: 'power', byPseudo: admin.pseudo, power, on: toggle ? on : null })
}

/** 'admin_house' { sessionId, unit }: gives a vacant house to the player for free (Laravel checks it is vacant). */
export async function onAdminHouse(room: AdminPanelRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const unit = typeof payload?.unit === 'string' && UUID.test(payload.unit) ? payload.unit : null
  if (unit === null) return refuse(client, 'house', 'This house is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'house', 'This player is no longer here.')
  try {
    const house = await callRealtimeBackend(admin.token, '/admin/game/house', 'POST', { account_id: target.accountId, unit_id: unit })
    client.send('admin_result', { action: 'house', ok: true, sessionId: target.player.sessionId, pseudo: target.player.pseudo, unit, modelKey: house.model_key ?? null })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'house', byPseudo: admin.pseudo, modelKey: house.model_key ?? null })
  } catch (error) {
    return sendFailure(client, 'house', error, 'Could not give the house.')
  }
  await room.pollHousingUnits()
}

/** Invisible on: the others see the player leave. Off: they see them come back where they stand. */
function showOrHide(room: AdminRoom, player: Player): void {
  const self = clientOf(room, player)
  if (hasPower(player, 'invisible')) room.forEachClient((c) => c.send('user_left', { sessionId: player.sessionId }), self)
  else room.forEachClient((c) => c.send('user_joined', publicPlayer(player)), self)
}

type Moderation = 'kick' | 'jail' | 'release' | 'stars' | 'send'
const MODERATIONS: readonly Moderation[] = ['kick', 'jail', 'release', 'stars', 'send']

function moderated(client: GameClient, player: Player, action: Moderation, extra: Record<string, unknown> = {}): void {
  client.send('admin_result', { action: 'moderate', ok: true, sessionId: player.sessionId, pseudo: player.pseudo, moderation: action, ...extra, ...liveSheet(player) })
}

/**
 * 'admin_moderate' { sessionId, action, minutes?, stars?, key? }: kick (never oneself), jail for 1 to 60 minutes in
 * an officer-held cell (no fine to pay), release from jail, set 0 to 5 wanted stars, or send to a listed place.
 */
export function onAdminModerate(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), destinations: Destinations = teleportDestinations): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const action = MODERATIONS.find((m) => m === payload?.action) ?? null
  if (action === null) return refuse(client, 'moderate', 'This action is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'moderate', 'This player is no longer here.')
  const player = target.player
  const targetClient = clientOf(room, player)
  switch (action) {
    case 'kick': {
      if (player === admin) return refuse(client, 'moderate', 'You cannot kick yourself.')
      moderated(client, player, action)
      targetClient?.leave?.(KICK_CLOSE_CODE, `kicked by ${admin.pseudo}`)
      return
    }
    case 'jail': {
      const minutes = intIn(payload?.minutes, 1, ADMIN_MAX_JAIL_MINUTES)
      if (minutes === null) return refuse(client, 'moderate', 'Choose between 1 and 60 minutes.')
      if (player.jail) return refuse(client, 'moderate', `${player.pseudo} is already in jail.`)
      player.jail = { kind: 'officer', stars: player.wantedStars, msLeft: minutes * 60_000, cellId: null }
      player.jailDirty = true
      void saveJail(player)
      lockUpOnJoin(room, player)
      moderated(client, player, action, { minutes })
      targetClient?.send('admin_granted', { kind: 'moderate', byPseudo: admin.pseudo, moderation: action, minutes })
      return
    }
    case 'release': {
      if (!player.jail) return refuse(client, 'moderate', `${player.pseudo} is not in jail.`)
      release(room, player, 'released')
      moderated(client, player, action)
      return
    }
    case 'stars': {
      const stars = intIn(payload?.stars, 0, 5)
      if (stars === null) return refuse(client, 'moderate', 'Choose between 0 and 5 stars.')
      setWantedStars(room, player, stars)
      moderated(client, player, action, { stars })
      return
    }
    case 'send': {
      const destination = destinations().find((d) => d.key === payload?.key)
      if (!destination) return refuse(client, 'moderate', 'Unknown place.')
      if (now < player.knockedOutUntil || player.clinicBedId || player.jail) return refuse(client, 'moderate', `${player.pseudo} cannot be moved right now.`)
      teleportPlayer(room, player, destination.position, destination.yaw, now)
      moderated(client, player, action, { place: destination.name })
      if (player !== admin) targetClient?.send('admin_summoned', { byPseudo: admin.pseudo })
    }
  }
}

/** 'admin_take_money' { sessionId, wallet, amount }: takes coins back; Laravel refuses more than the wallet holds. */
export async function onAdminTakeMoney(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), newRef: () => string = randomUUID): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const wallet = WALLETS.find((w) => w === payload?.wallet) ?? null
  const amount = intIn(payload?.amount, 1, ADMIN_MAX_MONEY)
  if (wallet === null || amount === null) return refuse(client, 'take_money', 'This amount is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'take_money', 'This player is no longer here.')
  try {
    const balances = await callRealtimeBackend(admin.token, '/admin/game/money/take', 'POST', { account_id: target.accountId, wallet, amount, ref: newRef() })
    client.send('admin_result', { action: 'take_money', ok: true, sessionId: target.player.sessionId, pseudo: target.player.pseudo, wallet, amount, cash: balances.cash, bank: balances.bank })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'take_money', byPseudo: admin.pseudo, wallet, amount, cash: balances.cash, bank: balances.bank })
  } catch (error) {
    sendFailure(client, 'take_money', error, 'Could not take the money.')
  }
}

/** 'admin_inventory' { sessionId }: what the player holds that can be taken back (a read, no cooldown). */
export async function onAdminInventory(room: AdminRoom, client: GameClient, payload: ClientPayload): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin) return
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'inventory', 'This player is no longer here.')
  try {
    const data = await callRealtimeBackend(admin.token, `/admin/game/inventory?account_id=${target.accountId}`, 'GET')
    client.send('admin_inventory', { sessionId: target.player.sessionId, items: Array.isArray(data?.items) ? data.items : [] })
  } catch (error) {
    sendFailure(client, 'inventory', error, 'Could not read the inventory.')
  }
}

/** 'admin_take_item' { sessionId, code, quantity }: removes items; Laravel refuses more than the player holds. */
export async function onAdminTakeItem(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), newRef: () => string = randomUUID): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const code = typeof payload?.code === 'string' && ITEM_CODE.test(payload.code) ? payload.code : null
  const quantity = intIn(payload?.quantity, 1, ADMIN_MAX_QUANTITY)
  if (code === null || quantity === null) return refuse(client, 'take_item', 'This item or quantity is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'take_item', 'This player is no longer here.')
  try {
    const data = await callRealtimeBackend(admin.token, '/admin/game/items/take', 'POST', { account_id: target.accountId, code, quantity, ref: newRef() })
    client.send('admin_result', { action: 'take_item', ok: true, sessionId: target.player.sessionId, pseudo: target.player.pseudo, code, quantity })
    client.send('admin_inventory', { sessionId: target.player.sessionId, items: Array.isArray(data?.items) ? data.items : [] })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'take_item', byPseudo: admin.pseudo, code, quantity })
  } catch (error) {
    sendFailure(client, 'take_item', error, 'Could not take the item.')
  }
}

/** 'admin_take_house' { sessionId }: evicts the player from the house they own (as a seizure). */
export async function onAdminTakeHouse(room: AdminPanelRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'take_house', 'This player is no longer here.')
  try {
    const house = await callRealtimeBackend(admin.token, '/admin/game/house/take', 'POST', { account_id: target.accountId })
    client.send('admin_result', { action: 'take_house', ok: true, sessionId: target.player.sessionId, pseudo: target.player.pseudo, modelKey: house.model_key ?? null })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'take_house', byPseudo: admin.pseudo, modelKey: house.model_key ?? null })
  } catch (error) {
    return sendFailure(client, 'take_house', error, 'Could not take the house back.')
  }
  await room.pollHousingUnits()
}
