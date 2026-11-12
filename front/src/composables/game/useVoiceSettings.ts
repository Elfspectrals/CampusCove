import { reactive, readonly, ref } from 'vue'
import { parseMutedAccounts, parseVoiceSettings, toggleMutedAccount, type VoiceMode, type VoiceSettings } from '../../game/voice'

const STORAGE_KEY = 'cc.voice'
const MUTED_KEY = 'cc.voiceMuted'

function load(): VoiceSettings {
  try {
    return parseVoiceSettings(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseVoiceSettings(null)
  }
}

const state = reactive<VoiceSettings>(load())

export const voiceSettings = readonly(state)

export function setVoiceMode(mode: VoiceMode): void {
  state.mode = mode
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    return
  }
}

function loadMuted(): string[] {
  try {
    return parseMutedAccounts(window.localStorage.getItem(MUTED_KEY))
  } catch {
    return []
  }
}

const muted = ref<string[]>(loadMuted())

export const mutedAccounts = readonly(muted)

export function toggleMuteAccount(accountId: string): void {
  muted.value = toggleMutedAccount(muted.value, accountId)
  try {
    window.localStorage.setItem(MUTED_KEY, JSON.stringify(muted.value))
  } catch {
    return
  }
}
