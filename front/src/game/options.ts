import type { GraphicsQuality } from './graphicsQuality.ts'

export interface GameOptions {
  mouseSensitivity: number
  invertY: boolean
  masterVolume: number
  effectsVolume: number
  musicVolume: number
  showCoordinates: boolean
}

export const SENSITIVITY = { min: 0.2, max: 3, step: 0.1, default: 1 } as const
export const DEFAULT_OPTIONS: GameOptions = { mouseSensitivity: SENSITIVITY.default, invertY: false, masterVolume: 1, effectsVolume: 1, musicVolume: 1, showCoordinates: true }

export function clampSensitivity(value: number): number {
  if (!Number.isFinite(value)) return SENSITIVITY.default
  return Math.round(Math.min(SENSITIVITY.max, Math.max(SENSITIVITY.min, value)) * 10) / 10
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100
}

export function parseOptions(raw: string | null): GameOptions {
  if (!raw) return { ...DEFAULT_OPTIONS }
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_OPTIONS }
    const o = data as Record<string, unknown>
    const volume = (v: unknown) => (typeof v === 'number' ? clampVolume(v) : 1)
    return {
      mouseSensitivity: typeof o.mouseSensitivity === 'number' ? clampSensitivity(o.mouseSensitivity) : SENSITIVITY.default,
      invertY: o.invertY === true,
      masterVolume: volume(o.masterVolume),
      effectsVolume: volume(o.effectsVolume),
      musicVolume: volume(o.musicVolume),
      showCoordinates: o.showCoordinates !== false,
    }
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

export const RENDER_KEYS = ['nativeResolution', 'antialias', 'shadows'] as const
export type RenderKey = (typeof RENDER_KEYS)[number]
export type RenderSettings = Record<RenderKey, boolean>

const RENDER_PRESETS: Record<GraphicsQuality, RenderSettings> = {
  low: { nativeResolution: false, antialias: false, shadows: false },
  medium: { nativeResolution: false, antialias: true, shadows: false },
  high: { nativeResolution: true, antialias: true, shadows: true },
}

export function parseRenderOverrides(raw: string | null): Partial<RenderSettings> {
  if (!raw) return {}
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return {}
    const o = data as Record<string, unknown>
    return Object.fromEntries(RENDER_KEYS.flatMap((key) => (typeof o[key] === 'boolean' ? [[key, o[key]]] : [])))
  } catch {
    return {}
  }
}

export function renderSettingsOf(quality: GraphicsQuality, overrides: Partial<RenderSettings>): RenderSettings {
  return { ...RENDER_PRESETS[quality], ...overrides }
}

export function isCustomRender(quality: GraphicsQuality, overrides: Partial<RenderSettings>): boolean {
  return RENDER_KEYS.some((key) => overrides[key] !== undefined && overrides[key] !== RENDER_PRESETS[quality][key])
}
