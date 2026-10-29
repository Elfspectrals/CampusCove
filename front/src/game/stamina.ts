export const MAX_STAMINA = 100
export const PUNCH_STAMINA_COST = 20
const WHIFF_STAMINA_COST = 34
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

export function isTired(stamina: number): boolean {
  return stamina < PUNCH_STAMINA_COST
}
