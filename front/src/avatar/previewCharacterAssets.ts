export interface PreviewCharacterAsset {
  id: 'campus-body' | 'adventurer' | 'swordsman'
  label: string
  fileName: 'low_poly_character.glb' | 'low_poly_adventurer.glb' | 'low_poly_character_swordsman.glb'
  src: string
  previewImageSrc: string
}

const PLACEHOLDER_SKIN_IMAGE_SRC = new URL('../assets/image/placeholderSkin.jpg', import.meta.url).href

const CAMPUS_BODY_PREVIEW_ASSET: PreviewCharacterAsset = {
  id: 'campus-body',
  label: 'Campus Body',
  fileName: 'low_poly_character.glb',
  src: new URL('../assets/models/low_poly_character.glb', import.meta.url).href,
  previewImageSrc: PLACEHOLDER_SKIN_IMAGE_SRC,
}

const ADVENTURER_PREVIEW_ASSET: PreviewCharacterAsset = {
  id: 'adventurer',
  label: 'Adventurer',
  fileName: 'low_poly_adventurer.glb',
  src: new URL('../assets/models/low_poly_adventurer.glb', import.meta.url).href,
  previewImageSrc: PLACEHOLDER_SKIN_IMAGE_SRC,
}

const SWORDSMAN_PREVIEW_ASSET: PreviewCharacterAsset = {
  id: 'swordsman',
  label: 'Swordsman',
  fileName: 'low_poly_character_swordsman.glb',
  src: new URL('../assets/models/low_poly_character_swordsman.glb', import.meta.url).href,
  previewImageSrc: PLACEHOLDER_SKIN_IMAGE_SRC,
}

export const PREVIEW_CHARACTER_ASSETS: PreviewCharacterAsset[] = [
  CAMPUS_BODY_PREVIEW_ASSET,
  ADVENTURER_PREVIEW_ASSET,
  SWORDSMAN_PREVIEW_ASSET,
]

export const DEFAULT_PREVIEW_CHARACTER_ASSET_ID: PreviewCharacterAsset['id'] = 'campus-body'

const PREVIEW_ASSET_BY_ID: Readonly<Record<PreviewCharacterAsset['id'], PreviewCharacterAsset>> = {
  'campus-body': CAMPUS_BODY_PREVIEW_ASSET,
  adventurer: ADVENTURER_PREVIEW_ASSET,
  swordsman: SWORDSMAN_PREVIEW_ASSET,
}

function normalizedLookupToken(value: string): string {
  return value.trim().toLowerCase()
}

const PREVIEW_ASSET_BY_LOOKUP_TOKEN: Readonly<Record<string, PreviewCharacterAsset['id']>> = {
  cos_wear_body_default: 'campus-body',
  campus_body_default: 'campus-body',
  'campus body (default)': 'campus-body',
  campus_body: 'campus-body',
  campusbody: 'campus-body',
  low_poly_character: 'campus-body',
  cos_wear_body_adventurer: 'adventurer',
  adventurer: 'adventurer',
  low_poly_adventurer: 'adventurer',
  cos_wear_body_swordsman: 'swordsman',
  swordsman: 'swordsman',
  low_poly_character_swordsman: 'swordsman',
}

export function getPreviewCharacterAssetById(assetId: string): PreviewCharacterAsset | null {
  return PREVIEW_CHARACTER_ASSETS.find((asset) => asset.id === assetId) ?? null
}

export function resolvePreviewCharacterAssetIdFromCosmetic(cosmeticCode: string, cosmeticName: string): PreviewCharacterAsset['id'] {
  const byCode = PREVIEW_ASSET_BY_LOOKUP_TOKEN[normalizedLookupToken(cosmeticCode)]
  if (byCode) return byCode
  const byName = PREVIEW_ASSET_BY_LOOKUP_TOKEN[normalizedLookupToken(cosmeticName)]
  if (byName) return byName
  return DEFAULT_PREVIEW_CHARACTER_ASSET_ID
}

export function getPreviewImageByCosmetic(cosmeticCode: string, cosmeticName: string): { src: string; fallbackUsed: boolean } {
  const assetId = resolvePreviewCharacterAssetIdFromCosmetic(cosmeticCode, cosmeticName)
  const asset = PREVIEW_ASSET_BY_ID[assetId]
  const fallbackUsed = asset.previewImageSrc === PLACEHOLDER_SKIN_IMAGE_SRC
  return {
    src: asset.previewImageSrc,
    fallbackUsed,
  }
}
