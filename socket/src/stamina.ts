export const MAX_STAMINA = 100
export const PUNCH_STAMINA_COST = 20
export const WHIFF_STAMINA_COST = 34
export const STAMINA_REGEN_PER_S = 25
export const STAMINA_REGEN_DELAY_MS = 600

export function staminaAt(stamina: number, spentAt: number, now: number): number {
  const regenMs = Math.max(0, now - spentAt - STAMINA_REGEN_DELAY_MS)
  return Math.min(MAX_STAMINA, stamina + (STAMINA_REGEN_PER_S * regenMs) / 1000)
}

export function spendPunchStamina(stamina: number, spentAt: number, now: number, hit: boolean): number | null {
  const current = staminaAt(stamina, spentAt, now)
  if (current < PUNCH_STAMINA_COST) return null
  return Math.max(0, current - (hit ? PUNCH_STAMINA_COST : WHIFF_STAMINA_COST))
}
