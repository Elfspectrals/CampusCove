import { SKINS } from '../game/assets/catalog'
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

export function getPreviewCharacterAssetById(assetId: string): PreviewCharacterAsset | null {
  return PREVIEW_CHARACTER_ASSETS.find((asset) => asset.id === assetId) ?? null
}
