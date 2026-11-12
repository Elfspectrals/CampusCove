export type GraphicsQuality = 'low' | 'medium' | 'high'

const STORAGE_KEY = 'cc_graphics_quality'

export function getGraphicsQuality(): GraphicsQuality {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'low' || stored === 'medium' || stored === 'high') {
    return stored
  }
  return 'low'
}

function setGraphicsQuality(quality: GraphicsQuality): void {
  localStorage.setItem(STORAGE_KEY, quality)
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
  return getGraphicsQuality() === 'high'
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
