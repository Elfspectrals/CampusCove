export interface PreviewCharacterAsset {
  id: 'campus-body' | 'adventurer' | 'swordsman'
  label: string
  fileName: 'low_poly_character.glb' | 'low_poly_adventurer.glb' | 'low_poly_character_swordsman.glb'
  src: string
}

export const PREVIEW_CHARACTER_ASSETS: PreviewCharacterAsset[] = [
  {
    id: 'campus-body',
    label: 'Campus Body',
    fileName: 'low_poly_character.glb',
    src: new URL('../low_poly_character.glb', import.meta.url).href,
  },
  {
    id: 'adventurer',
    label: 'Adventurer',
    fileName: 'low_poly_adventurer.glb',
    src: new URL('../low_poly_adventurer.glb', import.meta.url).href,
  },
  {
    id: 'swordsman',
    label: 'Swordsman',
    fileName: 'low_poly_character_swordsman.glb',
    src: new URL('../low_poly_character_swordsman.glb', import.meta.url).href,
  },
]

export const DEFAULT_PREVIEW_CHARACTER_ASSET_ID: PreviewCharacterAsset['id'] = 'campus-body'

export function getPreviewCharacterAssetById(assetId: string): PreviewCharacterAsset | null {
  return PREVIEW_CHARACTER_ASSETS.find((asset) => asset.id === assetId) ?? null
}
