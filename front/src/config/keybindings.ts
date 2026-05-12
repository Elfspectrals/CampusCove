export const KEY_BINDINGS = {
  moveForward: ['KeyW', 'KeyZ'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA', 'KeyQ'],
  moveRight: ['KeyD'],
  interact: 'KeyI',
  apartmentInventoryToggle: 'KeyE',
  /** Rotate placement ghost clockwise (no Shift). */
  rotateCW: 'KeyR',
  /** Same physical key as rotateCW; matcher uses Shift for CCW. */
  rotateCCW: 'KeyR',
} as const

export function matchesAnyMovementKey(code: string, keys: readonly string[]): boolean {
  return keys.includes(code)
}

/** R — clockwise; Shift+R handled separately via `matchesRotateCCW`. */
export function matchesRotateCW(e: KeyboardEvent): boolean {
  return e.code === KEY_BINDINGS.rotateCW && !e.shiftKey
}

/** Shift+R — counter-clockwise. */
export function matchesRotateCCW(e: KeyboardEvent): boolean {
  return e.code === KEY_BINDINGS.rotateCCW && e.shiftKey
}
