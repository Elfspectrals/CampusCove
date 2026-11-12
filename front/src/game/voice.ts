export const VOICE_RELEASE_RANGE = 34
export const VOICE_FULL_VOLUME_DISTANCE = 2

export const VOICE_MODES = ['pushToTalk', 'openMic'] as const
export type VoiceMode = (typeof VOICE_MODES)[number]

export interface VoiceSettings {
  mode: VoiceMode
  inputDeviceId: string | null
  outputDeviceId: string | null
  inputVolume: number
  outputVolume: number
}

export const MAX_VOLUME = 2
const STEPS_PER_UNIT = 20

const DEFAULT_VOICE: VoiceSettings = { mode: 'pushToTalk', inputDeviceId: null, outputDeviceId: null, inputVolume: 1, outputVolume: 1 }

export function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(MAX_VOLUME, Math.max(0, Math.round(value * STEPS_PER_UNIT) / STEPS_PER_UNIT))
}

function deviceId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

export function parseVoiceSettings(raw: string | null): VoiceSettings {
  if (!raw) return { ...DEFAULT_VOICE }
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return { ...DEFAULT_VOICE }
    const json = data as Record<string, unknown>
    return {
      mode: VOICE_MODES.includes(json.mode as VoiceMode) ? (json.mode as VoiceMode) : DEFAULT_VOICE.mode,
      inputDeviceId: deviceId(json.inputDeviceId),
      outputDeviceId: deviceId(json.outputDeviceId),
      inputVolume: json.inputVolume === undefined ? 1 : clampVolume(json.inputVolume),
      outputVolume: json.outputVolume === undefined ? 1 : clampVolume(json.outputVolume),
    }
  } catch {
    return { ...DEFAULT_VOICE }
  }
}

export function micLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}

export function parseMutedAccounts(raw: string | null): string[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    return Array.isArray(data) ? [...new Set(data.filter((id): id is string => typeof id === 'string' && id.length > 0))] : []
  } catch {
    return []
  }
}

export function toggleMutedAccount(muted: readonly string[], accountId: string): string[] {
  return muted.includes(accountId) ? muted.filter((id) => id !== accountId) : [...muted, accountId]
}

export function parsePlayerVolumes(raw: string | null): Record<string, number> {
  if (!raw) return {}
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {}
    return Object.fromEntries(
      Object.entries(data).filter(([id, v]) => /^\d+$/.test(id) && typeof v === 'number' && Number.isFinite(v)).map(([id, v]) => [id, clampVolume(v)]),
    )
  } catch {
    return {}
  }
}

export function withPlayerVolume(volumes: Readonly<Record<string, number>>, accountId: string, volume: number): Record<string, number> {
  const { [accountId]: _previous, ...others } = volumes
  const clamped = clampVolume(volume)
  return clamped === 1 ? others : { ...others, [accountId]: clamped }
}

export function liveKitUrl(tokenUrl: string, override: string | undefined, page: { protocol: string; host: string }): string {
  if (!override) return tokenUrl
  if (!override.startsWith('/')) return override
  return `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}${override}`
}
