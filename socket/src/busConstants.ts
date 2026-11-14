export const BUS_CRUISE_SPEED = 9
export const BUS_ACCELERATION = 1.2
export const BUS_DWELL_MS = 15_000
export const BUS_PERIOD_STEP_MS = 10_000
export const BUS_SPACING_STOP = 'sports_complex'
export const BUS_SYNC_MS = 200
export const BUS_BOARD_REACH = 4
export const BUS_BOARD_CLOSES_MS = 1_000
export const BUS_ACTION_COOLDOWN_MS = 500
export const BUS_FLOOR_Y = 0.4
export const BUS_EYE_HEIGHT = 1.6
export const BUS_RIDER_SLOTS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 20 }, (_, i) => [i % 2 === 0 ? -0.45 : 0.45, -4 + Math.floor(i / 2) * 0.85] as const)
