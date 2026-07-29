import {
  GAME_ACTIONS,
  getGameSettings,
  type ControlSettings,
  type GameAction,
  type KeyChord,
} from '../game/gameSettings'

/** Compatibility view of the original fixed bindings. New code should use `matchesAction`. */
export const KEY_BINDINGS = {
  moveForward: ['KeyW', 'KeyZ'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA', 'KeyQ'],
  moveRight: ['KeyD'],
  interact: 'KeyI',
  apartmentInventoryToggle: 'KeyE',
  rotateCW: 'KeyR',
  rotateCCW: 'KeyR',
  pushToTalk: 'KeyV',
} as const

export const GAME_ACTION_LABELS: Readonly<Record<GameAction, string>> = {
  moveForward: 'Move forward',
  moveBack: 'Move backward',
  moveLeft: 'Move left',
  moveRight: 'Move right',
  interact: 'Interact',
  inventory: 'Inventory',
  rotateCW: 'Rotate clockwise',
  rotateCCW: 'Rotate counter-clockwise',
  pushToTalk: 'Push to talk',
}

const CODE_LABELS: Readonly<Record<string, string>> = {
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Backquote: '`',
  Backslash: '\\',
  Backspace: 'Backspace',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Delete: 'Delete',
  End: 'End',
  Enter: 'Enter',
  Equal: '=',
  Escape: 'Esc',
  Home: 'Home',
  Insert: 'Insert',
  Minus: '-',
  PageDown: 'Page Down',
  PageUp: 'Page Up',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Tab: 'Tab',
}

const NON_BINDABLE_CODES = new Set([
  'AltLeft',
  'AltRight',
  'Backspace',
  'ControlLeft',
  'ControlRight',
  'Escape',
  'MetaLeft',
  'MetaRight',
  'ShiftLeft',
  'ShiftRight',
  'Tab',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
])

export interface BindingConflict {
  action: GameAction
  bindingIndex: number
  chord: KeyChord
}

export interface RebindResult {
  controls: ControlSettings
  applied: boolean
  conflict: BindingConflict | null
}

export type RebindConflictStrategy = 'reject' | 'swap'

function resolveControls(controls?: ControlSettings): ControlSettings {
  return controls ?? getGameSettings().controls
}

function cloneControls(controls: ControlSettings): ControlSettings {
  const bindings = {} as ControlSettings['bindings']
  for (const action of GAME_ACTIONS) {
    bindings[action] = controls.bindings[action].map((chord) => ({ ...chord }))
  }
  return {
    bindings,
    mouseSensitivity: controls.mouseSensitivity,
    invertY: controls.invertY,
    fov: controls.fov,
  }
}

export function matchesKeyChord(
  event: Pick<KeyboardEvent, 'code' | 'shiftKey'>,
  chord: KeyChord,
): boolean {
  if (event.code !== chord.code) return false
  return chord.shift === null || event.shiftKey === chord.shift
}

export function matchesAction(
  event: Pick<KeyboardEvent, 'code' | 'shiftKey'>,
  action: GameAction,
  controls?: ControlSettings,
): boolean {
  return resolveControls(controls).bindings[action].some((chord) => matchesKeyChord(event, chord))
}

export function isActionPressed(
  pressedCodes: ReadonlySet<string>,
  action: GameAction,
  controls?: ControlSettings,
  shiftPressed = pressedCodes.has('ShiftLeft') || pressedCodes.has('ShiftRight'),
): boolean {
  return resolveControls(controls).bindings[action].some(
    (chord) =>
      pressedCodes.has(chord.code) && (chord.shift === null || chord.shift === shiftPressed),
  )
}

export function chordsConflict(a: KeyChord, b: KeyChord): boolean {
  if (a.code !== b.code) return false
  return a.shift === null || b.shift === null || a.shift === b.shift
}

export function findBindingConflict(
  controls: ControlSettings,
  action: GameAction,
  bindingIndex: number,
  chord: KeyChord,
): BindingConflict | null {
  for (const candidateAction of GAME_ACTIONS) {
    const bindings = controls.bindings[candidateAction]
    for (let index = 0; index < bindings.length; index += 1) {
      if (candidateAction === action && index === bindingIndex) continue
      const candidate = bindings[index]
      if (candidate && chordsConflict(candidate, chord)) {
        return { action: candidateAction, bindingIndex: index, chord: { ...candidate } }
      }
    }
  }
  return null
}

export function rebindAction(
  controls: ControlSettings,
  action: GameAction,
  bindingIndex: number,
  chord: KeyChord,
  strategy: RebindConflictStrategy = 'reject',
): RebindResult {
  const next = cloneControls(controls)
  const bindings = next.bindings[action]
  if (bindingIndex < 0 || bindingIndex > bindings.length) {
    return { controls: next, applied: false, conflict: null }
  }
  const conflict = findBindingConflict(next, action, bindingIndex, chord)
  if (conflict && strategy === 'reject') {
    return { controls: next, applied: false, conflict }
  }

  const previous = bindings[bindingIndex] ? { ...bindings[bindingIndex]! } : null
  if (bindingIndex === bindings.length) {
    bindings.push({ ...chord })
  } else {
    bindings[bindingIndex] = { ...chord }
  }

  if (conflict) {
    const conflictingBindings = next.bindings[conflict.action]
    if (previous) {
      conflictingBindings[conflict.bindingIndex] = previous
    } else {
      conflictingBindings.splice(conflict.bindingIndex, 1)
      if (conflictingBindings.length === 0) {
        return { controls: cloneControls(controls), applied: false, conflict }
      }
    }
  }
  return { controls: next, applied: true, conflict }
}

export function removeActionBinding(
  controls: ControlSettings,
  action: GameAction,
  bindingIndex: number,
): ControlSettings {
  const next = cloneControls(controls)
  const bindings = next.bindings[action]
  if (bindings.length <= 1 || bindingIndex < 0 || bindingIndex >= bindings.length) return next
  bindings.splice(bindingIndex, 1)
  return next
}

export function chordFromKeyboardEvent(
  event: Pick<KeyboardEvent, 'code' | 'shiftKey'>,
): KeyChord | null {
  if (
    !event.code ||
    NON_BINDABLE_CODES.has(event.code) ||
    /^F([1-9]|1[0-2])$/.test(event.code) ||
    /^Browser/.test(event.code)
  ) {
    return null
  }
  return { code: event.code, shift: event.shiftKey }
}

export function keyCodeLabel(code: string): string {
  const known = CODE_LABELS[code]
  if (known) return known
  const key = /^Key([A-Z])$/.exec(code)
  if (key?.[1]) return key[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit?.[1]) return digit[1]
  const numpad = /^Numpad([0-9])$/.exec(code)
  if (numpad?.[1]) return `Numpad ${numpad[1]}`
  const functionKey = /^F([1-9]|1[0-2])$/.exec(code)
  if (functionKey?.[1]) return `F${functionKey[1]}`
  return code.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function keyChordLabel(chord: KeyChord): string {
  const key = keyCodeLabel(chord.code)
  return chord.shift === true ? `Shift + ${key}` : key
}

export function actionBindingLabel(
  action: GameAction,
  controls?: ControlSettings,
  separator = ' / ',
): string {
  return resolveControls(controls).bindings[action].map(keyChordLabel).join(separator)
}

export function movementBindingSummary(controls?: ControlSettings): string {
  const settings = resolveControls(controls)
  return [
    actionBindingLabel('moveForward', settings),
    actionBindingLabel('moveLeft', settings),
    actionBindingLabel('moveBack', settings),
    actionBindingLabel('moveRight', settings),
  ].join(' · ')
}

export function matchesAnyMovementKey(code: string, keys: readonly string[]): boolean {
  return keys.includes(code)
}

/** Compatibility helper for existing placement call sites. */
export function matchesRotateCW(e: KeyboardEvent, controls?: ControlSettings): boolean {
  return matchesAction(e, 'rotateCW', controls)
}

/** Compatibility helper for existing placement call sites. */
export function matchesRotateCCW(e: KeyboardEvent, controls?: ControlSettings): boolean {
  return matchesAction(e, 'rotateCCW', controls)
}
