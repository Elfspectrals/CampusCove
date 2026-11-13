export const JAIL_MS_PER_STAR = 2 * 60_000
export const MAX_JAIL_MS = 10 * 60_000
export const FINE_PER_STAR = 100
export const MAX_FINE = 500
export const JAIL_PAY_COOLDOWN_MS = 2000
export const MEAL_TRAY_INTERVAL_MS = 3 * 60_000
export const MEAL_TRAY_HUNGER = 48
export const MEAL_TRAY_REACH = 2.2
export const MEAL_TRAY_FOOD = 'food_sandwich'
export const POLICE_DESK_REACH = 3
export const POLICE_LOCKER_REACH = 2.5
export const POLICE_HEIGHT_REACH = 2
export const POLICE_ACTION_COOLDOWN_MS = 1000
export const CUFF_REACH = 2
export const CUFF_STILL_MS = 3000
export const CUFF_HOLD_MS = 2000
export const CUFF_MAX_MS = 5 * 60_000
export const STILL_STEP = 0.05
export const ESCORT_DISTANCE = 1
export const CELL_DOOR_REACH = 2
export const OFFICER_HOLD_MS = 15 * 60_000
export const PICKPOCKET_REACH = 1.5
export const PICKPOCKET_HEIGHT_REACH = 1
export const PICKPOCKET_CONE_DEG = 60
export const PICKPOCKET_START_COOLDOWN_MS = 1000
export const PICKPOCKET_HALF_SWEEP_MS = 800
export const PICKPOCKET_WINDOW_WIDTHS = [0.15, 0.11, 0.08] as const
export const PICKPOCKET_WINDOW_MARGIN = 0.05
export const PICKPOCKET_GAME_MS = 4500
export const PICKPOCKET_LAG_ALLOWANCE_MS = 120
export const PICKPOCKET_LOOT_MS = 5000
export const PICKPOCKET_MISSING_DELAY_MS = 30_000
export const WITNESS_REACH = 8
export const WITNESS_CONE_DEG = 120
export const DUTY_UNIFORM = {
  head_accessory: { model: '/assets/wear/head_accessory/sheriff_hat/model.glb', hex: '#d8c39a' },
  top: { model: '/assets/wear/top/sheriff_shirt/model.glb', hex: '#d8c39a' },
  bottom: { model: '/assets/wear/bottom/basic/model.glb', hex: '#6b4a2e' },
  shoes: { model: '/assets/wear/shoes/boots/model.glb', hex: '#4a3222' }
} as const
