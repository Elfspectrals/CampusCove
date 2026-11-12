export const VOICE_RELEASE_RANGE = 34
export const VOICE_FULL_VOLUME_DISTANCE = 2

export const VOICE_MODES = ['pushToTalk', 'openMic'] as const
export type VoiceMode = (typeof VOICE_MODES)[number]

export interface VoiceSettings {
  mode: VoiceMode
}

const DEFAULT_VOICE: VoiceSettings = { mode: 'pushToTalk' }

export function parseVoiceSettings(raw: string | null): VoiceSettings {
  if (!raw) return { ...DEFAULT_VOICE }
  try {
    const data: unknown = JSON.parse(raw)
    const mode = typeof data === 'object' && data !== null ? (data as Record<string, unknown>).mode : undefined
    return VOICE_MODES.includes(mode as VoiceMode) ? { mode: mode as VoiceMode } : { ...DEFAULT_VOICE }
  } catch {
    return { ...DEFAULT_VOICE }
  }
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
