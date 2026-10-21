import { DEFAULT_SKIN, SKINS, findSkinByCode } from '../game/assets/catalog'
import type { SkinKey } from '../game/assets/catalog'

/** A body skin as shown in the Locker preview (backed by the central asset catalog). */
export interface PreviewCharacterAsset {
  id: SkinKey
  label: string
  src: string
  previewImageSrc: string
}

const PREVIEW_CHARACTER_ASSETS: PreviewCharacterAsset[] = SKINS.map((skin) => ({
  id: skin.key,
  label: skin.name,
  src: skin.modelUrl,
  previewImageSrc: skin.previewUrl,
}))

export const DEFAULT_PREVIEW_CHARACTER_ASSET_ID: PreviewCharacterAsset['id'] = DEFAULT_SKIN.key

function byId(id: PreviewCharacterAsset['id']): PreviewCharacterAsset {
  return PREVIEW_CHARACTER_ASSETS.find((asset) => asset.id === id) ?? PREVIEW_CHARACTER_ASSETS[0]!
}

export function getPreviewCharacterAssetById(assetId: string): PreviewCharacterAsset | null {
  return PREVIEW_CHARACTER_ASSETS.find((asset) => asset.id === assetId) ?? null
}

/** Resolve a cosmetic (shop code first, then display name) to its skin; unknown items show the default. */
export function resolvePreviewCharacterAssetIdFromCosmetic(cosmeticCode: string, cosmeticName: string): PreviewCharacterAsset['id'] {
  const byCode = findSkinByCode(cosmeticCode)
  if (byCode) return byCode.key
  const name = cosmeticName.trim().toLowerCase()
  const byName = SKINS.find((s) => s.name.toLowerCase() === name)
  return byName?.key ?? DEFAULT_PREVIEW_CHARACTER_ASSET_ID
}

export function getPreviewImageByCosmetic(cosmeticCode: string, cosmeticName: string): { src: string; fallbackUsed: boolean } {
  const known = findSkinByCode(cosmeticCode) !== null
  const asset = byId(resolvePreviewCharacterAssetIdFromCosmetic(cosmeticCode, cosmeticName))
  return { src: asset.previewImageSrc, fallbackUsed: !known }
}
