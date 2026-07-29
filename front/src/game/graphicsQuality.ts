import {
  applyGraphicsPreset,
  getGameSettings,
  saveGameSettings,
  type GraphicsPresetId,
  type GraphicsSettings,
} from './gameSettings'

/** Compatibility name retained for existing call sites. */
export type GraphicsQuality = GraphicsPresetId

export function getGraphicsSettings(): GraphicsSettings {
  return getGameSettings().graphics
}

export function getGraphicsQuality(): GraphicsQuality {
  return getGraphicsSettings().preset
}

export function setGraphicsQuality(quality: GraphicsQuality): void {
  const current = getGameSettings()
  const result = saveGameSettings({
    ...current,
    graphics: applyGraphicsPreset(current.graphics, quality),
  })
  if (result.issues.length > 0) {
    console.warn('[graphics-quality] Graphics settings required recovery.', result.issues)
  }
}

/** Cycles all user-facing presets while preserving the legacy toggle API. */
export function toggleGraphicsQuality(): GraphicsQuality {
  const current = getGraphicsQuality()
  const next: GraphicsQuality = current === 'low' ? 'medium' : current === 'medium' ? 'high' : 'low'
  setGraphicsQuality(next)
  return next
}

export function usesLowDetailRoomAssets(): boolean {
  return getGraphicsQuality() === 'low'
}

export function supportsRoomMeshShadows(): boolean {
  return getGraphicsSettings().shadows !== 'off'
}

export function supportsEnvironmentMap(): boolean {
  return getGraphicsSettings().environmentMap
}

export function supportsBloom(): boolean {
  return getGraphicsSettings().postprocessing === 'bloom'
}

/** Restrict expensive local-light shadows to the explicit High preset. */
export function supportsPointLightShadows(): boolean {
  const graphics = getGraphicsSettings()
  return graphics.preset === 'high' && graphics.shadows !== 'off'
}
