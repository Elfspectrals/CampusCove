export interface LockpickPin {
  period: number
  phase: number
  receivedAt: number
}

export function dialPosition(pin: LockpickPin, at: number): number {
  const turns = pin.phase + (at - pin.receivedAt) / pin.period
  return turns - Math.floor(turns)
}

export function secondsUntilReady(readyAt: number, at: number): number {
  return Math.max(0, Math.ceil((readyAt - at) / 1000))
}
