// Player state kept by the room, and what other clients get to see of it.

const COLORS = [
  0xe94560, 0x0f3460, 0x533483, 0x00d9ff, 0x00ff88,
  0xffaa00, 0xff3366, 0x9d4edd, 0x06ffa5, 0xff6b35
]

const SLOTS = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']

const DEFAULT_SLOT_HEX = {
  body: '#8B7AA8',
  hair: '#6B5B95',
  top: '#9B8ABF',
  bottom: '#5A4E72',
  shoes: '#4A3F62',
  head_accessory: '#7A6B94'
}

function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key)
}

export function normalizeAppearanceIds(raw) {
  const out = {}
  for (const s of SLOTS) {
    const v = hasOwn(raw, s) ? raw[s] : null
    out[s] = typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  return out
}

export function normalizeSlotHexes(raw) {
  const out = {}
  for (const s of SLOTS) {
    const v = hasOwn(raw, s) ? raw[s] : null
    out[s] = typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : DEFAULT_SLOT_HEX[s]
  }
  return out
}

export function normalizeBodyModelGlb(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeNumber(raw, fallback) {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

// Random point on a small disc around `base`, so simultaneous arrivals do not overlap.
export function spawnNear(base, radius) {
  const angle = Math.random() * Math.PI * 2
  const dist = radius * Math.sqrt(Math.random())
  return { x: base.x + Math.cos(angle) * dist, y: base.y, z: base.z + Math.sin(angle) * dist }
}

export function createPlayer(client, options, colorIndex, spawn) {
  return {
    sessionId: client.sessionId,
    accountId: client.auth?.accountId,
    pseudo: client.auth?.pseudo,
    token: client.auth?.token ?? null,
    color: COLORS[colorIndex % COLORS.length],
    ...spawn,
    ry: 0,
    lastMoveAt: Date.now(),
    lastHousingRefreshAt: 0,
    // survival (src/survival.js): gauges are loaded from the API right after the join
    stats: null,
    statsDirty: false,
    lastStatsSavedAt: Date.now(),
    lastConsumeAt: 0,
    lastSipAt: 0,
    fallPeakY: spawn.y,
    knockedOutUntil: 0,
    speedBoostUntil: 0,
    appearance: normalizeAppearanceIds(options?.appearance),
    slotHexes: normalizeSlotHexes(options?.slotHexes),
    bodyModelGlb: normalizeBodyModelGlb(options?.bodyModelGlb)
  }
}

export function publicPlayer(player) {
  return {
    sessionId: player.sessionId,
    id: String(player.accountId),
    pseudo: player.pseudo,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    ry: player.ry,
    appearance: { ...player.appearance },
    slotHexes: { ...player.slotHexes },
    bodyModelGlb: player.bodyModelGlb
  }
}
