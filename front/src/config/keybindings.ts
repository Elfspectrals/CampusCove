/**
 * Game controls as named actions, bound to physical keys (`KeyboardEvent.code`, so WASD stays in place on AZERTY)
 * or, for interact and punch, to mouse buttons (`MouseLeft`, `MouseRight`, ... see mouseButtonCode).
 * Players can rebind every action from Settings (KeybindingSettings.vue); their bindings are saved in this browser
 * (`cc_keybindings`, listed on the cookies page). Gameplay asks `matches(action, e.code)`, never a raw key.
 */
import { reactive } from 'vue'

const BINDABLE_ACTIONS = [
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
  'jump',
  'interact',
  'punch',
  'inventory',
  'survivalWatch',
  'cook',
  'houseKeys',
  'buyHouse',
  'rotate',
  'putAway',
  'hotbar1',
  'hotbar2',
  'hotbar3',
  'hotbar4',
  'hotbar5',
  'hotbar6',
  'hotbar7',
  'hotbar8',
  'hotbar9',
] as const
export type BindableAction = (typeof BINDABLE_ACTIONS)[number]

/** Up to this many keys per action (e.g. W and Z both move forward, for QWERTY and AZERTY). */
export const KEYS_PER_ACTION = 2

const DEFAULT_BINDINGS: Readonly<Record<BindableAction, readonly string[]>> = {
  moveForward: ['KeyW', 'KeyZ'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA', 'KeyQ'],
  moveRight: ['KeyD'],
  /** Costs stamina. Sprint is Shift (held), not bindable since Shift is reserved. */
  jump: ['Space'],
  /** Use, like Minecraft: doors (lock / unlock with the key in hand), shops, cafe, clinic, then eat / drink what is held. */
  interact: ['MouseRight', 'KeyG'],
  /** Attack, like Minecraft. */
  punch: ['MouseLeft', 'KeyV'],
  inventory: ['KeyE'],
  /** Hold to raise the left wrist and read the survival watch; tap to open the watch apps (trade). */
  survivalWatch: ['KeyT'],
  /** With raw food in hand, at a stove or a barbecue. */
  cook: ['KeyF'],
  houseKeys: ['KeyK'],
  /** At the door of a house for sale. */
  buyHouse: ['F2'],
  /** Rotate the placement ghost clockwise; with Shift, counter-clockwise. */
  rotate: ['KeyR'],
  /** While moving a placed piece of furniture: put it back in the inventory. */
  putAway: ['KeyX'],
  hotbar1: ['Digit1'],
  hotbar2: ['Digit2'],
  hotbar3: ['Digit3'],
  hotbar4: ['Digit4'],
  hotbar5: ['Digit5'],
  hotbar6: ['Digit6'],
  hotbar7: ['Digit7'],
  hotbar8: ['Digit8'],
  hotbar9: ['Digit9'],
}

/** Never bindable: Escape pauses the game and frees the mouse, Shift is sprint and the "reverse" modifier of rotate. */
export const RESERVED_KEYS: readonly string[] = ['Escape', 'ShiftLeft', 'ShiftRight']

/** The only actions a mouse button can be bound to (the others are read from the keyboard). */
export const MOUSE_BINDABLE_ACTIONS: readonly BindableAction[] = ['interact', 'punch']

const MOUSE_BUTTONS = ['MouseLeft', 'MouseMiddle', 'MouseRight']

/** Binding code of a mouse button (`MouseEvent.button`), e.g. 0 → 'MouseLeft', 3 → 'Mouse4'. */
export function mouseButtonCode(button: number): string {
  return MOUSE_BUTTONS[button] ?? `Mouse${button + 1}`
}

function isMouseCode(code: string): boolean {
  return code.startsWith('Mouse')
}

const STORAGE_KEY = 'cc_keybindings'

function defaults(): Record<BindableAction, string[]> {
  return Object.fromEntries(BINDABLE_ACTIONS.map((a) => [a, [...DEFAULT_BINDINGS[a]]])) as Record<BindableAction, string[]>
}

function load(): Record<BindableAction, string[]> {
  const out = defaults()
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      for (const a of BINDABLE_ACTIONS) {
        const keys = (saved as Record<string, unknown>)[a]
        if (Array.isArray(keys)) out[a] = keys.filter((k): k is string => typeof k === 'string' && isBindable(a, k)).slice(0, KEYS_PER_ACTION)
      }
    }
  } catch {
    // unreadable or blocked storage: defaults
  }
  return out
}

/** Current bindings, reactive so the Settings screen and the in-game hints follow every change. */
export const bindings = reactive(load())

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  } catch {
    // private mode: bindings last for this visit only
  }
}

function isBindable(action: BindableAction, code: string): boolean {
  return !RESERVED_KEYS.includes(code) && (!isMouseCode(code) || MOUSE_BINDABLE_ACTIONS.includes(action))
}

export function matches(action: BindableAction, code: string): boolean {
  return bindings[action].includes(code)
}

/** The action already using `code`, if any. */
function actionFor(code: string): BindableAction | null {
  return BINDABLE_ACTIONS.find((a) => bindings[a].includes(code)) ?? null
}

/**
 * Puts `code` in slot `slot` of `action`, replacing the key that was there (or adding one in the empty slot).
 * A key belongs to one action only: if another action had it, it loses it and that action is returned so the
 * screen can say so.
 */
export function setBinding(action: BindableAction, slot: number, code: string): BindableAction | null {
  if (!isBindable(action, code)) return null
  const previous = actionFor(code)
  if (previous && previous !== action) bindings[previous] = bindings[previous].filter((k) => k !== code)
  const keys = [...bindings[action]]
  if (keys[slot] === code) return null
  const twin = keys.indexOf(code) // same key already in the other slot of this action: it just moves
  if (twin >= 0) keys.splice(twin, 1)
  if (slot < keys.length) keys[slot] = code
  else keys.push(code)
  bindings[action] = keys.slice(0, KEYS_PER_ACTION)
  save()
  return previous && previous !== action ? previous : null
}

export function clearBinding(action: BindableAction, slot: number) {
  bindings[action] = bindings[action].filter((_, i) => i !== slot)
  save()
}

export function resetBindings() {
  Object.assign(bindings, defaults())
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing saved
  }
}

/** Rotate clockwise: the rotate key without Shift. */
export function matchesRotateCW(e: KeyboardEvent): boolean {
  return matches('rotate', e.code) && !e.shiftKey
}

/** Rotate counter-clockwise: Shift + the rotate key. */
export function matchesRotateCCW(e: KeyboardEvent): boolean {
  return matches('rotate', e.code) && e.shiftKey
}

// ---------------------------------------------------------------- labels

/** Letter printed on the key for the player's keyboard layout (Chrome / Edge), filled once at load. */
const layoutLabels = reactive(new Map<string, string>())
type KeyboardLayoutApi = { getLayoutMap(): Promise<Map<string, string>> }
const keyboardApi = typeof navigator !== 'undefined' ? (navigator as Navigator & { keyboard?: KeyboardLayoutApi }).keyboard : undefined
void keyboardApi
  ?.getLayoutMap()
  .then((map) => map.forEach((label, code) => layoutLabels.set(code, label.toUpperCase())))
  .catch(() => undefined)

const NAMED_KEYS: Record<string, string> = {
  MouseLeft: 'L-Click',
  MouseMiddle: 'M-Click',
  MouseRight: 'R-Click',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: '⌫',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl R',
  AltLeft: 'Alt',
  AltRight: 'Alt Gr',
  MetaLeft: '⊞',
  CapsLock: 'Caps',
}

/** Short label of a physical key, e.g. 'KeyW' → 'W' (or 'Z' on AZERTY), 'Digit1' → '1', 'Space' → 'Space'. */
export function keyLabel(code: string): string {
  // number row: the digit, not the AZERTY unshifted symbol (& é " ' ( …) players don't think of as "1, 2, 3"
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]!
  const fromLayout = layoutLabels.get(code)
  if (fromLayout) return fromLayout
  if (NAMED_KEYS[code]) return NAMED_KEYS[code]
  const mouse = /^Mouse(\d+)$/.exec(code)
  if (mouse) return `Mouse ${mouse[1]}`
  const m = /^(?:Key|Digit|Numpad)(.+)$/.exec(code)
  return m ? (code.startsWith('Numpad') ? `Num ${m[1]}` : m[1]!) : code
}

/** Labels of every key bound to an action, e.g. ['W', 'Z']. */
export function actionKeyLabels(action: BindableAction): string[] {
  return bindings[action].map(keyLabel)
}
