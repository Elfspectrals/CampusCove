import { reactive, readonly } from 'vue'
import { clampSensitivity, clampVolume, parseOptions, type GameOptions } from '../../game/options'

const STORAGE_KEY = 'cc.options'

function load(): GameOptions {
  try {
    return parseOptions(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseOptions(null)
  }
}

const state = reactive<GameOptions>(load())

function save(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    return
  }
}

export const gameOptions = readonly(state)

export function setMouseSensitivity(value: number): void {
  state.mouseSensitivity = clampSensitivity(value)
  save()
}

export function setVolume(key: 'masterVolume' | 'effectsVolume' | 'musicVolume', value: number): void {
  state[key] = clampVolume(value)
  save()
}

export function setOptionFlag(key: 'invertY' | 'showCoordinates', value: boolean): void {
  state[key] = value
  save()
}

export function musicGain(): number {
  return state.masterVolume * state.musicVolume
}
