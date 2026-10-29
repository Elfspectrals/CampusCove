import { reactive, readonly } from 'vue'
import { clampFov, parseComfort, type ComfortSettings } from '../../game/comfort'

const STORAGE_KEY = 'cc.comfort'

function load(): ComfortSettings {
  try {
    return parseComfort(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return parseComfort(null)
  }
}

/** One store for the whole app: the camera reads it each frame, the settings dialog writes it. */
const state = reactive<ComfortSettings>(load())

function save(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // private mode / storage blocked: the setting still applies for this session
  }
}

export const comfortSettings = readonly(state)

export function setComfortFov(fov: number): void {
  state.fov = clampFov(fov)
  save()
}

export function setReduceCameraMotion(reduce: boolean): void {
  state.reduceCameraMotion = reduce
  save()
}
