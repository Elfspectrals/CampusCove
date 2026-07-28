export type GraphicsQuality = 'low' | 'high'

const STORAGE_KEY = 'cc_graphics_quality'

export function getGraphicsQuality(): GraphicsQuality {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'low' || stored === 'high') {
    return stored
  }
  return 'low'
}

export function setGraphicsQuality(quality: GraphicsQuality): void {
  localStorage.setItem(STORAGE_KEY, quality)
}

export function toggleGraphicsQuality(): GraphicsQuality {
  const next: GraphicsQuality = getGraphicsQuality() === 'low' ? 'high' : 'low'
  setGraphicsQuality(next)
  return next
}
