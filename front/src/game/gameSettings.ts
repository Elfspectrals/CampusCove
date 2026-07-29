export const GAME_SETTINGS_VERSION = 1 as const
export const GAME_SETTINGS_STORAGE_KEY = 'cc_game_settings_v1'
export const LEGACY_GRAPHICS_QUALITY_STORAGE_KEY = 'cc_graphics_quality'

export const GAME_ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'interact',
  'inventory',
  'rotateCW',
  'rotateCCW',
  'pushToTalk',
] as const

export type GameAction = (typeof GAME_ACTIONS)[number]
export type GraphicsPresetId = 'low' | 'medium' | 'high'
export type ShadowMode = 'off' | 'hard' | 'soft'
export type FpsCap = 30 | 60 | 120 | 0
export type ParticleLevel = 'off' | 'low' | 'high'
export type PostprocessingMode = 'off' | 'bloom'

/**
 * `shift: null` ignores Shift, while true/false requires its exact state.
 * Ignoring Shift is useful for movement; exact matching keeps R and Shift+R distinct.
 */
export interface KeyChord {
  code: string
  shift: boolean | null
}

export type GameBindings = Record<GameAction, KeyChord[]>

export interface ControlSettings {
  bindings: GameBindings
  mouseSensitivity: number
  invertY: boolean
  fov: number
}

export interface GraphicsSettings {
  preset: GraphicsPresetId
  shadows: ShadowMode
  antialias: boolean
  resolutionScale: number
  maxDevicePixelRatio: number
  fpsCap: FpsCap
  environmentMap: boolean
  particles: ParticleLevel
  postprocessing: PostprocessingMode
  showFps: boolean
}

export interface GameSettings {
  version: typeof GAME_SETTINGS_VERSION
  controls: ControlSettings
  graphics: GraphicsSettings
}

export type GraphicsPresetValues = Omit<GraphicsSettings, 'preset' | 'showFps'>

export interface GameSettingsIssue {
  path: string
  code:
    | 'invalid_json'
    | 'invalid_type'
    | 'invalid_value'
    | 'clamped'
    | 'unsupported_version'
    | 'storage_error'
  message: string
}

export interface GameSettingsLoadResult {
  settings: GameSettings
  issues: GameSettingsIssue[]
  source: 'defaults' | 'stored' | 'migrated'
}

export interface GameSettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const GRAPHICS_PRESETS: Readonly<Record<GraphicsPresetId, GraphicsPresetValues>> = {
  low: {
    shadows: 'off',
    antialias: false,
    resolutionScale: 0.8,
    maxDevicePixelRatio: 1,
    fpsCap: 30,
    environmentMap: false,
    particles: 'off',
    postprocessing: 'off',
  },
  medium: {
    shadows: 'hard',
    antialias: true,
    resolutionScale: 1,
    maxDevicePixelRatio: 1.25,
    fpsCap: 60,
    environmentMap: true,
    particles: 'low',
    postprocessing: 'off',
  },
  high: {
    shadows: 'soft',
    antialias: true,
    resolutionScale: 1,
    maxDevicePixelRatio: 1.5,
    fpsCap: 60,
    environmentMap: true,
    particles: 'high',
    postprocessing: 'bloom',
  },
}

function defaultBindings(): GameBindings {
  return {
    moveForward: [
      { code: 'KeyW', shift: null },
      { code: 'KeyZ', shift: null },
    ],
    moveBack: [{ code: 'KeyS', shift: null }],
    moveLeft: [
      { code: 'KeyA', shift: null },
      { code: 'KeyQ', shift: null },
    ],
    moveRight: [{ code: 'KeyD', shift: null }],
    interact: [{ code: 'KeyI', shift: null }],
    inventory: [{ code: 'KeyE', shift: null }],
    rotateCW: [{ code: 'KeyR', shift: false }],
    rotateCCW: [{ code: 'KeyR', shift: true }],
    pushToTalk: [{ code: 'KeyV', shift: null }],
  }
}

export function createDefaultGameSettings(): GameSettings {
  return {
    version: GAME_SETTINGS_VERSION,
    controls: {
      bindings: defaultBindings(),
      mouseSensitivity: 1,
      invertY: false,
      fov: 75,
    },
    graphics: {
      preset: 'low',
      ...GRAPHICS_PRESETS.low,
      showFps: false,
    },
  }
}

/** A safe snapshot for display/tests. Use `createDefaultGameSettings` for a mutable copy. */
export const DEFAULT_GAME_SETTINGS: Readonly<GameSettings> = createDefaultGameSettings()

let cachedSettings: GameSettings | null = null
let didReportIssues = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneChord(chord: KeyChord): KeyChord {
  return { code: chord.code, shift: chord.shift }
}

export function cloneGameSettings(settings: GameSettings): GameSettings {
  const bindings = {} as GameBindings
  for (const action of GAME_ACTIONS) {
    bindings[action] = settings.controls.bindings[action].map(cloneChord)
  }
  return {
    version: GAME_SETTINGS_VERSION,
    controls: {
      bindings,
      mouseSensitivity: settings.controls.mouseSensitivity,
      invertY: settings.controls.invertY,
      fov: settings.controls.fov,
    },
    graphics: { ...settings.graphics },
  }
}

function resolveStorage(): GameSettingsStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function addIssue(
  issues: GameSettingsIssue[],
  path: string,
  code: GameSettingsIssue['code'],
  message: string,
): void {
  issues.push({ path, code, message })
}

function sanitizeBoolean(
  value: unknown,
  fallback: boolean,
  path: string,
  issues: GameSettingsIssue[],
): boolean {
  if (value === undefined) return fallback
  if (typeof value === 'boolean') return value
  addIssue(issues, path, 'invalid_type', 'Expected a boolean; the safe default was used.')
  return fallback
}

function sanitizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  path: string,
  issues: GameSettingsIssue[],
): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(issues, path, 'invalid_type', 'Expected a finite number; the safe default was used.')
    return fallback
  }
  const clamped = Math.min(max, Math.max(min, value))
  if (clamped !== value) {
    addIssue(issues, path, 'clamped', `Value was clamped to the supported range ${min}–${max}.`)
  }
  return clamped
}

function sanitizeChoice<T extends string | number>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
  path: string,
  issues: GameSettingsIssue[],
): T {
  if (value === undefined) return fallback
  if (choices.some((choice) => choice === value)) return value as T
  addIssue(issues, path, 'invalid_value', 'Unsupported value; the safe default was used.')
  return fallback
}

function sanitizeChord(
  value: unknown,
  fallback: KeyChord,
  path: string,
  issues: GameSettingsIssue[],
): KeyChord {
  if (!isRecord(value)) {
    addIssue(issues, path, 'invalid_type', 'Expected a key binding object; the safe default was used.')
    return cloneChord(fallback)
  }
  const rawCode = value.code
  const code =
    typeof rawCode === 'string' &&
    rawCode.length > 0 &&
    rawCode.length <= 64 &&
    /^[A-Za-z0-9]+$/.test(rawCode)
      ? rawCode
      : fallback.code
  if (code !== rawCode) {
    addIssue(issues, `${path}.code`, 'invalid_value', 'Invalid KeyboardEvent.code; the safe default was used.')
  }
  const rawShift = value.shift
  let shift = fallback.shift
  if (rawShift === null || typeof rawShift === 'boolean') {
    shift = rawShift
  } else if (rawShift !== undefined) {
    addIssue(issues, `${path}.shift`, 'invalid_type', 'Expected true, false, or null; the safe default was used.')
  }
  return { code, shift }
}

function sanitizeBindings(
  value: unknown,
  fallback: GameBindings,
  issues: GameSettingsIssue[],
): GameBindings {
  const source = isRecord(value) ? value : {}
  if (value !== undefined && !isRecord(value)) {
    addIssue(issues, 'controls.bindings', 'invalid_type', 'Expected an action map; safe defaults were used.')
  }
  const bindings = {} as GameBindings
  for (const action of GAME_ACTIONS) {
    const path = `controls.bindings.${action}`
    const raw = source[action]
    if (raw === undefined) {
      bindings[action] = fallback[action].map(cloneChord)
      continue
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      addIssue(issues, path, 'invalid_type', 'Expected at least one key binding; the safe default was used.')
      bindings[action] = fallback[action].map(cloneChord)
      continue
    }
    const limited = raw.slice(0, 4)
    if (raw.length > limited.length) {
      addIssue(issues, path, 'invalid_value', 'Only the first four bindings were kept.')
    }
    bindings[action] = limited.map((entry, index) =>
      sanitizeChord(entry, fallback[action][Math.min(index, fallback[action].length - 1)]!, `${path}.${index}`, issues),
    )
  }
  return bindings
}

export function applyGraphicsPreset(
  graphics: GraphicsSettings,
  preset: GraphicsPresetId,
): GraphicsSettings {
  return {
    preset,
    ...GRAPHICS_PRESETS[preset],
    showFps: graphics.showFps,
  }
}

function sanitizeSettings(value: unknown, initialIssues: GameSettingsIssue[] = []): GameSettingsLoadResult {
  const issues = [...initialIssues]
  const defaults = createDefaultGameSettings()
  const root = isRecord(value) ? value : {}
  if (!isRecord(value)) {
    addIssue(issues, '$', 'invalid_type', 'Expected a settings object; safe defaults were used.')
  }
  if (root.version !== GAME_SETTINGS_VERSION) {
    addIssue(
      issues,
      'version',
      'unsupported_version',
      `Missing or unsupported settings version; compatible fields were recovered into version ${GAME_SETTINGS_VERSION}.`,
    )
  }

  const rawControls = isRecord(root.controls) ? root.controls : {}
  if (root.controls !== undefined && !isRecord(root.controls)) {
    addIssue(issues, 'controls', 'invalid_type', 'Expected a controls object; safe defaults were used.')
  }
  const controls: ControlSettings = {
    bindings: sanitizeBindings(rawControls.bindings, defaults.controls.bindings, issues),
    mouseSensitivity: sanitizeNumber(
      rawControls.mouseSensitivity,
      defaults.controls.mouseSensitivity,
      0.1,
      3,
      'controls.mouseSensitivity',
      issues,
    ),
    invertY: sanitizeBoolean(rawControls.invertY, defaults.controls.invertY, 'controls.invertY', issues),
    fov: sanitizeNumber(rawControls.fov, defaults.controls.fov, 60, 100, 'controls.fov', issues),
  }

  const rawGraphics = isRecord(root.graphics) ? root.graphics : {}
  if (root.graphics !== undefined && !isRecord(root.graphics)) {
    addIssue(issues, 'graphics', 'invalid_type', 'Expected a graphics object; safe defaults were used.')
  }
  const preset = sanitizeChoice(
    rawGraphics.preset,
    ['low', 'medium', 'high'] as const,
    defaults.graphics.preset,
    'graphics.preset',
    issues,
  )
  const presetDefaults: GraphicsSettings = {
    preset,
    ...GRAPHICS_PRESETS[preset],
    showFps: defaults.graphics.showFps,
  }
  const graphics: GraphicsSettings = {
    preset,
    shadows: sanitizeChoice(
      rawGraphics.shadows,
      ['off', 'hard', 'soft'] as const,
      presetDefaults.shadows,
      'graphics.shadows',
      issues,
    ),
    antialias: sanitizeBoolean(
      rawGraphics.antialias,
      presetDefaults.antialias,
      'graphics.antialias',
      issues,
    ),
    resolutionScale: sanitizeNumber(
      rawGraphics.resolutionScale,
      presetDefaults.resolutionScale,
      0.5,
      1.5,
      'graphics.resolutionScale',
      issues,
    ),
    maxDevicePixelRatio: sanitizeNumber(
      rawGraphics.maxDevicePixelRatio,
      presetDefaults.maxDevicePixelRatio,
      0.5,
      2,
      'graphics.maxDevicePixelRatio',
      issues,
    ),
    fpsCap: sanitizeChoice(
      rawGraphics.fpsCap,
      [0, 30, 60, 120] as const,
      presetDefaults.fpsCap,
      'graphics.fpsCap',
      issues,
    ),
    environmentMap: sanitizeBoolean(
      rawGraphics.environmentMap,
      presetDefaults.environmentMap,
      'graphics.environmentMap',
      issues,
    ),
    particles: sanitizeChoice(
      rawGraphics.particles,
      ['off', 'low', 'high'] as const,
      presetDefaults.particles,
      'graphics.particles',
      issues,
    ),
    postprocessing: sanitizeChoice(
      rawGraphics.postprocessing,
      ['off', 'bloom'] as const,
      presetDefaults.postprocessing,
      'graphics.postprocessing',
      issues,
    ),
    showFps: sanitizeBoolean(rawGraphics.showFps, presetDefaults.showFps, 'graphics.showFps', issues),
  }

  return {
    settings: {
      version: GAME_SETTINGS_VERSION,
      controls,
      graphics,
    },
    issues,
    source: 'stored',
  }
}

function migrateLegacySettings(
  storage: GameSettingsStorage,
  issues: GameSettingsIssue[],
): GameSettingsLoadResult | null {
  let legacy: string | null
  try {
    legacy = storage.getItem(LEGACY_GRAPHICS_QUALITY_STORAGE_KEY)
  } catch {
    addIssue(issues, LEGACY_GRAPHICS_QUALITY_STORAGE_KEY, 'storage_error', 'Legacy settings could not be read.')
    return null
  }
  if (legacy === null) return null
  if (legacy !== 'low' && legacy !== 'high') {
    addIssue(
      issues,
      LEGACY_GRAPHICS_QUALITY_STORAGE_KEY,
      'invalid_value',
      'Legacy graphics quality was invalid; safe defaults were used.',
    )
    return null
  }
  const settings = createDefaultGameSettings()
  settings.graphics = applyGraphicsPreset(settings.graphics, legacy)
  try {
    storage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    storage.removeItem(LEGACY_GRAPHICS_QUALITY_STORAGE_KEY)
  } catch {
    addIssue(issues, GAME_SETTINGS_STORAGE_KEY, 'storage_error', 'Migrated settings could not be persisted.')
  }
  return { settings, issues, source: 'migrated' }
}

export function loadGameSettings(storage: GameSettingsStorage | null = resolveStorage()): GameSettingsLoadResult {
  if (!storage) {
    return { settings: createDefaultGameSettings(), issues: [], source: 'defaults' }
  }
  const issues: GameSettingsIssue[] = []
  let raw: string | null
  try {
    raw = storage.getItem(GAME_SETTINGS_STORAGE_KEY)
  } catch {
    addIssue(issues, GAME_SETTINGS_STORAGE_KEY, 'storage_error', 'Settings storage could not be read.')
    return { settings: createDefaultGameSettings(), issues, source: 'defaults' }
  }
  if (raw === null) {
    const migrated = migrateLegacySettings(storage, issues)
    return migrated ?? { settings: createDefaultGameSettings(), issues, source: 'defaults' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    addIssue(issues, '$', 'invalid_json', 'Stored settings were not valid JSON; safe defaults were used.')
    return { settings: createDefaultGameSettings(), issues, source: 'stored' }
  }
  return sanitizeSettings(parsed, issues)
}

export function getGameSettings(): GameSettings {
  if (!cachedSettings) {
    const result = loadGameSettings()
    cachedSettings = result.settings
    if (result.issues.length > 0 && !didReportIssues) {
      didReportIssues = true
      console.warn('[game-settings] Stored settings required recovery.', result.issues)
    }
  }
  return cachedSettings
}

export function saveGameSettings(
  value: unknown,
  storage: GameSettingsStorage | null = resolveStorage(),
): GameSettingsLoadResult {
  const result = sanitizeSettings(value)
  cachedSettings = result.settings
  if (!storage) {
    if (typeof window !== 'undefined') {
      addIssue(
        result.issues,
        GAME_SETTINGS_STORAGE_KEY,
        'storage_error',
        'Settings were applied for this session, but browser storage is unavailable.',
      )
    }
    return { ...result, source: 'stored' }
  }
  try {
    storage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(result.settings))
  } catch {
    addIssue(
      result.issues,
      GAME_SETTINGS_STORAGE_KEY,
      'storage_error',
      'Settings were applied for this session but could not be persisted.',
    )
  }
  return { ...result, source: 'stored' }
}

export function resetGameSettings(storage: GameSettingsStorage | null = resolveStorage()): GameSettingsLoadResult {
  return saveGameSettings(createDefaultGameSettings(), storage)
}

export function graphicsSettingsRequireReload(
  before: GraphicsSettings,
  after: GraphicsSettings,
): boolean {
  const beforeUsesLowAssets = before.preset === 'low'
  const afterUsesLowAssets = after.preset === 'low'
  return (
    beforeUsesLowAssets !== afterUsesLowAssets ||
    before.antialias !== after.antialias ||
    before.postprocessing !== after.postprocessing
  )
}
