export type WearSlot = 'hair' | 'head_accessory' | 'top' | 'bottom' | 'shoes'

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

const PIECE_MAIN = /^W_(hair|head_accessory|top|bottom|shoes)_.+_Main$/

export function tintHexFor(materialName: string, colors: SlotHexes, defaults: SlotHexes): string | null {
  if (materialName === 'Skin') return colors.body === defaults.body ? null : colors.body
  const slot = PIECE_MAIN.exec(materialName)?.[1] as WearSlot | undefined
  if (!slot) return null
  return colors[slot] === defaults[slot] ? null : colors[slot]
}

export function wearSignature(models: WearModels, colors: SlotHexes): string {
  return JSON.stringify([WEAR_SLOTS.map((s) => models[s]), colors])
}
