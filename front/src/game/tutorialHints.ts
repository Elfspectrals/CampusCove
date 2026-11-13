import type { Vec3 } from './mallTemplates/mallTemplate.ts'

const HINT_KINDS = ['atm', 'npc', 'door'] as const

export type HintKind = (typeof HINT_KINDS)[number]

const HINT_REACH = 4

export const HINT_DURATION_MS = 6000

export type HintPlaces = Record<HintKind, readonly Vec3[]>

export function nextHint(player: { x: number; z: number }, places: HintPlaces, seen: ReadonlySet<HintKind>): { kind: HintKind; at: Vec3 } | null {
  for (const kind of HINT_KINDS) {
    if (seen.has(kind)) continue
    const distance = (place: Vec3) => Math.hypot(place[0] - player.x, place[2] - player.z)
    const inReach = places[kind].filter((place) => distance(place) <= HINT_REACH)
    if (inReach.length === 0) continue
    const at = inReach.reduce((best, place) => (distance(place) < distance(best) ? place : best))
    return { kind, at }
  }
  return null
}

export function parseSeenHints(raw: string | null): Set<HintKind> {
  if (raw === null) return new Set()
  const list: unknown = JSON.parse(raw)
  if (!Array.isArray(list)) throw new Error('Invalid seen tutorial hints')
  return new Set(list.filter((kind): kind is HintKind => (HINT_KINDS as readonly unknown[]).includes(kind)))
}
