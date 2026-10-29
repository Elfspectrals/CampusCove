export const MAX_STAMINA = 100
export const PUNCH_STAMINA_COST = 20
const WHIFF_STAMINA_COST = 34
/** Jump and sprint costs must match socket/src/stamina.ts. */
export const JUMP_STAMINA_COST = 12
const SPRINT_STAMINA_PER_S = 18
/** Sprinting only starts above this, so an empty bar doesn't stutter between running and walking. */
const SPRINT_START_STAMINA = 15
const STAMINA_REGEN_PER_S = 25
export const STAMINA_REGEN_DELAY_MS = 600

export interface StaminaState {
  stamina: number
  spentAt: number
}

export const FULL_STAMINA: StaminaState = { stamina: MAX_STAMINA, spentAt: 0 }

export function staminaAt(state: StaminaState, now: number): number {
  const regenMs = Math.max(0, now - state.spentAt - STAMINA_REGEN_DELAY_MS)
  return Math.min(MAX_STAMINA, state.stamina + (STAMINA_REGEN_PER_S * regenMs) / 1000)
}

export function spendPunchStamina(state: StaminaState, now: number, hit: boolean): StaminaState | null {
  const current = staminaAt(state, now)
  if (current < PUNCH_STAMINA_COST) return null
  return { stamina: Math.max(0, current - (hit ? PUNCH_STAMINA_COST : WHIFF_STAMINA_COST)), spentAt: now }
}

export function snapStamina(state: StaminaState, serverStamina: number, now: number): StaminaState {
  return { stamina: serverStamina, spentAt: Math.max(state.spentAt, now - STAMINA_REGEN_DELAY_MS) }
}

/** At or under this the bar counts as empty: the player pants. */
const EXHAUSTED_STAMINA = 5

/** True on the spend that empties the bar (not on every spend while it stays empty). */
export function justRanOut(before: number, after: number): boolean {
  return before > EXHAUSTED_STAMINA && after <= EXHAUSTED_STAMINA
}

export function isTired(stamina: number): boolean {
  return stamina < PUNCH_STAMINA_COST
}

export function spendJumpStamina(state: StaminaState, now: number): StaminaState | null {
  const current = staminaAt(state, now)
  if (current < JUMP_STAMINA_COST) return null
  return { stamina: current - JUMP_STAMINA_COST, spentAt: now }
}

/**
 * One frame of sprinting: drains the bar while it lasts. `wasSprinting` keeps a run going down to 0, a new run
 * needs SPRINT_START_STAMINA. Returns null when the player can't sprint (walks instead).
 */
export function spendSprintStamina(state: StaminaState, now: number, dt: number, wasSprinting: boolean): StaminaState | null {
  const current = staminaAt(state, now)
  if (current <= 0 || (!wasSprinting && current < SPRINT_START_STAMINA)) return null
  return { stamina: Math.max(0, current - SPRINT_STAMINA_PER_S * dt), spentAt: now }
}
