const HOME_COLUMNS = 3

export type WatchView = { screen: 'home'; app: number } | { screen: 'app'; app: number; row: number }

export type WatchKey = 'up' | 'down' | 'left' | 'right' | 'enter' | 'back'

type WatchEffect = { kind: 'open'; app: number } | { kind: 'activate'; app: number; row: number } | { kind: 'close' } | null

export interface WatchStep {
  view: WatchView
  effect: WatchEffect
}

const KEY_CODES: Readonly<Record<string, WatchKey>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Backspace: 'back',
}

const MOVE_KEYS: ReadonlyArray<[MoveAction, WatchKey]> = [
  ['moveForward', 'up'],
  ['moveBack', 'down'],
  ['moveLeft', 'left'],
  ['moveRight', 'right'],
]

export type MoveAction = 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight'

/** The movement keys (ZQSD / WASD, as bound by the player) steer the watch too. */
export function watchKeyOf(code: string, isMoveKey: (action: MoveAction, code: string) => boolean = () => false): WatchKey | null {
  const fixed = KEY_CODES[code]
  if (fixed) return fixed
  return MOVE_KEYS.find(([action]) => isMoveKey(action, code))?.[1] ?? null
}

export const WATCH_HOME: WatchView = { screen: 'home', app: 0 }

function moveOnGrid(app: number, key: WatchKey, appCount: number): number {
  const delta = { up: -HOME_COLUMNS, down: HOME_COLUMNS, left: -1, right: 1 }[key as 'up' | 'down' | 'left' | 'right']
  const next = app + delta
  return next >= 0 && next < appCount ? next : app
}

export function stepWatch(view: WatchView, key: WatchKey, counts: { apps: number; rows: number }): WatchStep {
  if (view.screen === 'home') {
    if (key === 'back') return { view, effect: { kind: 'close' } }
    if (key === 'enter') {
      if (counts.apps === 0) return { view, effect: null }
      return { view: { screen: 'app', app: view.app, row: 0 }, effect: { kind: 'open', app: view.app } }
    }
    return { view: { screen: 'home', app: moveOnGrid(view.app, key, counts.apps) }, effect: null }
  }
  if (key === 'back') return { view: { screen: 'home', app: view.app }, effect: null }
  const row = Math.min(view.row, Math.max(counts.rows - 1, 0))
  if (key === 'enter') return { view: { ...view, row }, effect: counts.rows > 0 ? { kind: 'activate', app: view.app, row } : null }
  if (key === 'up') return { view: { ...view, row: Math.max(row - 1, 0) }, effect: null }
  if (key === 'down') return { view: { ...view, row: Math.min(row + 1, Math.max(counts.rows - 1, 0)) }, effect: null }
  return { view: { ...view, row }, effect: null }
}

export function keepSelectedRow(view: WatchView, previousKeys: readonly string[], keys: readonly string[]): WatchView {
  if (view.screen !== 'app') return view
  const selectedKey = previousKeys[view.row]
  const row = selectedKey === undefined ? -1 : keys.indexOf(selectedKey)
  return row >= 0 && row !== view.row ? { ...view, row } : view
}
