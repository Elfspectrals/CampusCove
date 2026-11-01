// Player state kept by the room, and what other clients get to see of it.
import type { Client } from 'colyseus'
import type { Json } from './backend.ts'
import { MAX_STAMINA } from './stamina.ts'
import type { AppearanceSlot, Player, Vec3, WearSlot } from './types.ts'

const COLORS = [
  0xe94560, 0x0f3460, 0x533483, 0x00d9ff, 0x00ff88,
  0xffaa00, 0xff3366, 0x9d4edd, 0x06ffa5, 0xff6b35
]

const SLOTS: readonly AppearanceSlot[] = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']

const DEFAULT_SLOT_HEX: Record<AppearanceSlot, string> = {
  body: '#8B7AA8',
  hair: '#6B5B95',
  top: '#9B8ABF',
  bottom: '#5A4E72',
  shoes: '#4A3F62',
  head_accessory: '#7A6B94'
}

function hasOwn(obj: unknown, key: string): obj is Record<string, unknown> {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key)
}

export function normalizeAppearanceIds(raw: unknown): Record<AppearanceSlot, number | null> {
  const out = {} as Record<AppearanceSlot, number | null>
  for (const s of SLOTS) {
    const v = hasOwn(raw, s) ? raw[s] : null
    out[s] = typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  return out
}

export function normalizeSlotHexes(raw: unknown): Record<AppearanceSlot, string> {
  const out = {} as Record<AppearanceSlot, string>
  for (const s of SLOTS) {
    const v = hasOwn(raw, s) ? raw[s] : null
    out[s] = typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : DEFAULT_SLOT_HEX[s]
  }
  return out
}

export function normalizeBodyModelGlb(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

const WEAR_SLOTS: readonly WearSlot[] = ['hair', 'head_accessory', 'top', 'bottom', 'shoes']

export function normalizeSlotModels(raw: unknown): Record<WearSlot, string | null> {
  const out = {} as Record<WearSlot, string | null>
  for (const s of WEAR_SLOTS) {
    const v = hasOwn(raw, s) ? raw[s] : null
    out[s] = typeof v === 'string' && new RegExp(`^/assets/wear/${s}/[a-z_]+/model\\.glb$`).test(v) ? v : null
  }
  return out
}

export function normalizeNumber(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

// Random point on a small disc around `base`, so simultaneous arrivals do not overlap.
export function spawnNear(base: Vec3, radius: number): Vec3 {
  const angle = Math.random() * Math.PI * 2
  const dist = radius * Math.sqrt(Math.random())
  return { x: base.x + Math.cos(angle) * dist, y: base.y, z: base.z + Math.sin(angle) * dist }
}

export function createPlayer(client: Client, options: Json, colorIndex: number, spawn: Vec3): Player {
  return {
    sessionId: client.sessionId,
    accountId: client.auth?.accountId,
    pseudo: client.auth?.pseudo,
    token: client.auth?.token ?? null,
    isAdmin: client.auth?.isAdmin === true,
    color: COLORS[colorIndex % COLORS.length],
    ...spawn,
    ry: 0,
    lastMoveAt: Date.now(),
    lastHousingRefreshAt: 0,
    lastDoorRattleAt: 0,
    // survival (src/survival.ts): gauges are loaded from the API right after the join
    stats: null,
    statsDirty: false,
    lastStatsSavedAt: Date.now(),
    lastConsumeAt: 0,
    lastSipAt: 0,
    lastPunchAt: 0,
    stamina: MAX_STAMINA,
    staminaSpentAt: 0,
    fallPeakY: spawn.y,
    knockedOutUntil: 0,
    speedBoostUntil: 0,
    healOverTime: null,
    lastClinicHealAt: 0,
    clinicHealPending: false,
    clinicBedId: null,
    tradeId: null,
    lastTradeRequestAt: 0,
    lastAdminActionAt: 0,
    seatId: null,
    intoxication: 0,
    pubSecretUntil: 0,
    pubShots: null,
    lastPubBellAt: 0,
    lastBouncerBlockAt: 0,
    appearance: normalizeAppearanceIds(options?.appearance),
    slotHexes: normalizeSlotHexes(options?.slotHexes),
    bodyModelGlb: normalizeBodyModelGlb(options?.bodyModelGlb),
    slotModels: normalizeSlotModels(options?.slotModels)
  }
}

export function publicPlayer(player: Player) {
  return {
    sessionId: player.sessionId,
    id: String(player.accountId),
    pseudo: player.pseudo,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    ry: player.ry,
    seatId: player.seatId,
    appearance: { ...player.appearance },
    slotHexes: { ...player.slotHexes },
    bodyModelGlb: player.bodyModelGlb,
    slotModels: { ...player.slotModels }
  }
}
