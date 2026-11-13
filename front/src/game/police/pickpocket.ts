import type { Position } from './policeStation'

export const PICKPOCKET_PROMPT_REACH = 1.4
const PROMPT_CONE_COS = Math.cos((50 / 2) * Math.PI / 180)

export interface PickpocketCandidate {
  sessionId: string
  x: number
  feetY: number
  z: number
  ry: number
}

function groundDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function standsBehind(at: Pick<Position, 'x' | 'z'>, victim: PickpocketCandidate): boolean {
  const dx = at.x - victim.x
  const dz = at.z - victim.z
  const distance = Math.hypot(dx, dz)
  if (distance === 0 || distance > PICKPOCKET_PROMPT_REACH) return false
  return (Math.sin(victim.ry) * dx + Math.cos(victim.ry) * dz) / distance >= PROMPT_CONE_COS
}

export function victimInFront(at: Pick<Position, 'x' | 'z'>, candidates: readonly PickpocketCandidate[]): PickpocketCandidate | null {
  let best: PickpocketCandidate | null = null
  for (const candidate of candidates) {
    if (standsBehind(at, candidate) && (!best || groundDistance(at, candidate) < groundDistance(at, best))) best = candidate
  }
  return best
}

export function cursorAt(elapsedMs: number, halfSweepMs: number): number {
  const phase = (Math.max(0, elapsedMs) / halfSweepMs) % 2
  return phase <= 1 ? phase : 2 - phase
}
