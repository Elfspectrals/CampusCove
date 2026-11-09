import { ref } from 'vue'

const KEY = 'cc.admin.mallEditor.recentColors.v1'
const LIMIT = 12
const HEX = /^#[0-9a-f]{6}$/

function read(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(stored) ? stored.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, LIMIT) : []
  } catch {
    return []
  }
}

export const recentColors = ref<string[]>(read())

export function rememberColor(color: string): void {
  recentColors.value = [color, ...recentColors.value.filter((c) => c !== color)].slice(0, LIMIT)
  try {
    localStorage.setItem(KEY, JSON.stringify(recentColors.value))
  } catch (error) {
    console.warn('[mall editor] recent colours not saved', error)
  }
}
