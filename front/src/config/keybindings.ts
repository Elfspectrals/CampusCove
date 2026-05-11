export const KEY_BINDINGS = {
  moveForward: ['KeyW', 'KeyZ'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA', 'KeyQ'],
  moveRight: ['KeyD'],
  interact: 'KeyI',
  apartmentInventoryToggle: 'KeyE',
} as const

export function matchesAnyMovementKey(code: string, keys: readonly string[]): boolean {
  return keys.includes(code)
}

