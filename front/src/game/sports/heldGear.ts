import { PETANQUE_BOULES_URL } from './petanqueModel.ts'

/** Sports gear held in the hand (the rest is worn, and only put on inside its sport). */
export const HELD_GEAR_URLS: Readonly<Record<string, string>> = {
  gear_tennis_racket: '/assets/decor/tennis_racket/model.glb',
  gear_boules: PETANQUE_BOULES_URL,
}

export function heldGearUrl(code: string | null | undefined): string | null {
  return (code && HELD_GEAR_URLS[code]) || null
}
