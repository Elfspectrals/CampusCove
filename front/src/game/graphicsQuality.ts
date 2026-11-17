import { type RenderKey, type RenderSettings, parseRenderOverrides, renderSettingsOf } from './options.ts'

export type GraphicsQuality = 'low' | 'medium' | 'high'

const STORAGE_KEY = 'cc_graphics_quality'
const OVERRIDES_KEY = 'cc_graphics_overrides'

export function getGraphicsQuality(): GraphicsQuality {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'low' || stored === 'medium' || stored === 'high') {
    return stored
  }
  return 'low'
}

export function setGraphicsQuality(quality: GraphicsQuality): void {
  localStorage.setItem(STORAGE_KEY, quality)
  localStorage.removeItem(OVERRIDES_KEY)
}

export function getRenderOverrides(): Partial<RenderSettings> {
  return parseRenderOverrides(localStorage.getItem(OVERRIDES_KEY))
}

export function setRenderOverride(key: RenderKey, value: boolean): void {
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ ...getRenderOverrides(), [key]: value }))
}

export function getRenderSettings(): RenderSettings {
  return renderSettingsOf(getGraphicsQuality(), getRenderOverrides())
}

export function nextGraphicsQuality(quality: GraphicsQuality): GraphicsQuality {
  if (quality === 'low') return 'medium'
  if (quality === 'medium') return 'high'
  return 'low'
}

export function cycleGraphicsQuality(): GraphicsQuality {
  const next = nextGraphicsQuality(getGraphicsQuality())
  setGraphicsQuality(next)
  return next
}

export function supportsRoomMeshShadows(): boolean {
  return getRenderSettings().shadows
}

export function supportsEnvironmentMap(): boolean {
  return getGraphicsQuality() !== 'low'
}

export function supportsScreenBlur(): boolean {
  return getGraphicsQuality() !== 'low'
}

/** Point-light shadows stay off for FPS even on High. */
export function supportsPointLightShadows(): boolean {
  return false
}
