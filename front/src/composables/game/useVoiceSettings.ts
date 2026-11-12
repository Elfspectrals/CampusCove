import { reactive, readonly, ref } from 'vue'
import { clampVolume, parseMutedAccounts, parsePlayerVolumes, parseVoiceSettings, toggleMutedAccount, withPlayerVolume, type VoiceMode, type VoiceSettings } from '../../game/voice'

const STORAGE_KEY = 'cc.voice'
const MUTED_KEY = 'cc.voiceMuted'
const VOLUMES_KEY = 'cc.voiceVolumes'

function load(): VoiceSettings {
  try {
    return parseVoiceSettings(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseVoiceSettings(null)
  }
}

const state = reactive<VoiceSettings>(load())

export const voiceSettings = readonly(state)

function save(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    return
  }
}

export function setVoiceMode(mode: VoiceMode): void {
  state.mode = mode
  save()
}

export function setInputDevice(deviceId: string | null): void {
  state.inputDeviceId = deviceId
  save()
}

export function setOutputDevice(deviceId: string | null): void {
  state.outputDeviceId = deviceId
  save()
}

export function setInputVolume(volume: number): void {
  state.inputVolume = clampVolume(volume)
  save()
}

export function setOutputVolume(volume: number): void {
  state.outputVolume = clampVolume(volume)
  save()
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

function loadVolumes(): Record<string, number> {
  try {
    return parsePlayerVolumes(window.localStorage.getItem(VOLUMES_KEY))
  } catch {
    return {}
  }
}

const volumes = ref<Record<string, number>>(loadVolumes())

export const playerVolumes = readonly(volumes)

export function setPlayerVolume(accountId: string, volume: number): void {
  volumes.value = withPlayerVolume(volumes.value, accountId, volume)
  try {
    window.localStorage.setItem(VOLUMES_KEY, JSON.stringify(volumes.value))
  } catch {
    return
  }
}
