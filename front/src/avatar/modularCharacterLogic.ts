import type { CharacterLook } from './characterLook'

export type WearSlot ='hair' | 'head_accessory' | 'top' | 'bottom' | 'shoes'

export const WEAR_SLOTS: readonly WearSlot[] = ['hair', 'head_accessory', 'top', 'bottom', 'shoes']

export type WearModels = Record<WearSlot, string | null>

export type SlotHexes = Record<'body' | WearSlot, string>

export function hiddenRegions(pieceHides: ReadonlyArray<string | undefined>): Set<string> {
  const out = new Set<string>()
  for (const hides of pieceHides) {
    for (const region of (hides ?? '').split(',')) if (region) out.add(region)
  }
  return out
}

const HEADWEAR_HAIR = /^W_head_accessory_.+_Hair$/

const PIECE_MAIN =/^W_(hair|head_accessory|top|bottom|shoes)_.+_Main$/

export function tintHexFor(materialName: string, colors: SlotHexes, defaults: SlotHexes): string | null {
  if (materialName === 'Skin') return colors.body === defaults.body ? null : colors.body
  // brows, beard, moustache and the hair under a headset or a hat follow the hair colour
  if (materialName === 'BB_Brow' || HEADWEAR_HAIR.test(materialName)) return colors.hair === defaults.hair ? null : colors.hair
  const slot = PIECE_MAIN.exec(materialName)?.[1] as WearSlot | undefined
  if (!slot) return null
  return colors[slot] === defaults[slot] ? null : colors[slot]
}

/** Changes whenever the built avatar would look different: a rebuild is skipped while it stays the same. */
export function wearSignature(models: WearModels, colors: SlotHexes, look: CharacterLook | null = null): string {
  return JSON.stringify([WEAR_SLOTS.map((s) => models[s]), colors, look])
}
