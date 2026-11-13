import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keepSelectedRow, stepWatch, watchKeyOf, type WatchKey, type WatchView } from './watchNav.ts'

const home = (app: number): WatchView => ({ screen: 'home', app })
const inApp = (app: number, row: number): WatchView => ({ screen: 'app', app, row })

function homeAfter(app: number, key: WatchKey, apps = 5): number {
  const { view } = stepWatch(home(app), key, { apps, rows: 0 })
  assert.equal(view.screen, 'home')
  return view.app
}

test('home grid: left and right walk the apps in reading order and stop at both ends', () => {
  assert.equal(homeAfter(0, 'right'), 1)
  assert.equal(homeAfter(2, 'right'), 3)
  assert.equal(homeAfter(4, 'right'), 4)
  assert.equal(homeAfter(0, 'left'), 0)
})

test('home grid: up and down jump one row of three, and stay put when no app is there', () => {
  assert.equal(homeAfter(1, 'down'), 4)
  assert.equal(homeAfter(2, 'down'), 2)
  assert.equal(homeAfter(4, 'up'), 1)
  assert.equal(homeAfter(0, 'up'), 0)
})

test('home: Enter opens the chosen app on its first row, Backspace closes the watch', () => {
  assert.deepEqual(stepWatch(home(3), 'enter', { apps: 5, rows: 0 }), { view: inApp(3, 0), effect: { kind: 'open', app: 3 } })
  assert.deepEqual(stepWatch(home(3), 'back', { apps: 5, rows: 0 }).effect, { kind: 'close' })
  assert.equal(stepWatch(home(0), 'enter', { apps: 0, rows: 0 }).effect, null)
})

test('app: up and down stay inside the rows', () => {
  assert.deepEqual(stepWatch(inApp(1, 0), 'down', { apps: 5, rows: 3 }).view, inApp(1, 1))
  assert.deepEqual(stepWatch(inApp(1, 2), 'down', { apps: 5, rows: 3 }).view, inApp(1, 2))
  assert.deepEqual(stepWatch(inApp(1, 0), 'up', { apps: 5, rows: 3 }).view, inApp(1, 0))
  assert.deepEqual(stepWatch(inApp(1, 0), 'down', { apps: 5, rows: 0 }).view, inApp(1, 0))
})

test('app: Enter acts on the chosen row, and on the last one when the list got shorter', () => {
  assert.deepEqual(stepWatch(inApp(1, 1), 'enter', { apps: 5, rows: 3 }).effect, { kind: 'activate', app: 1, row: 1 })
  assert.deepEqual(stepWatch(inApp(1, 4), 'enter', { apps: 5, rows: 2 }), { view: inApp(1, 1), effect: { kind: 'activate', app: 1, row: 1 } })
  assert.equal(stepWatch(inApp(1, 0), 'enter', { apps: 5, rows: 0 }).effect, null)
})

test('app: Backspace goes back home on the same app', () => {
  assert.deepEqual(stepWatch(inApp(3, 2), 'back', { apps: 5, rows: 3 }), { view: home(3), effect: null })
})

test('only the arrows, Enter and Backspace drive the watch', () => {
  assert.equal(watchKeyOf('ArrowLeft'), 'left')
  assert.equal(watchKeyOf('NumpadEnter'), 'enter')
  assert.equal(watchKeyOf('KeyW'), null)
  const azerty = (action: string, code: string) => ({ moveForward: 'KeyZ', moveBack: 'KeyS', moveLeft: 'KeyQ', moveRight: 'KeyD' })[action] === code
  assert.equal(watchKeyOf('KeyZ', azerty), 'up')
  assert.equal(watchKeyOf('KeyS', azerty), 'down')
  assert.equal(watchKeyOf('KeyQ', azerty), 'left')
  assert.equal(watchKeyOf('KeyD', azerty), 'right')
  assert.equal(watchKeyOf('KeyE', azerty), null)
})

test('when a list reorders, the selection stays on the same row, or keeps its place if that row is gone', () => {
  assert.deepEqual(keepSelectedRow(inApp(2, 1), ['b', 'lou', 'kim'], ['lou', 'kim']), inApp(2, 0))
  assert.deepEqual(keepSelectedRow(inApp(2, 0), ['lou', 'kim'], ['kim', 'lou']), inApp(2, 1))
  assert.deepEqual(keepSelectedRow(inApp(2, 1), ['b', 'lou'], ['kim']), inApp(2, 1))
  assert.deepEqual(keepSelectedRow(home(2), ['a'], ['b', 'a']), home(2))
})
