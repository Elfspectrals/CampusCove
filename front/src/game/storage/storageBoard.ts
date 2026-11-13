const ONCE_AT_MS = 5000
const TWICE_AT_MS = 2000

export type SaleCall = 'once' | 'twice' | null

export function remainingMs(endsAt: number, clientNow: number, clockOffset: number): number {
  return Math.max(0, endsAt - (clientNow + clockOffset))
}

export function secondsLeft(remaining: number): number {
  return Math.ceil(remaining / 1000)
}

export function saleCall(phase: string, remaining: number): SaleCall {
  if (phase !== 'bidding') return null
  if (remaining <= TWICE_AT_MS) return 'twice'
  if (remaining <= ONCE_AT_MS) return 'once'
  return null
}

export function inCircle(at: { x: number; z: number }, zone: { x: number; z: number; radius: number }): boolean {
  return Math.hypot(at.x - zone.x, at.z - zone.z) <= zone.radius
}
