import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindings, clearBinding, keyLabel, matches, matchesRotateCCW, matchesRotateCW, resetBindings, setBinding } from './keybindings.ts'

test('default bindings cover QWERTY and AZERTY movement', () => {
  resetBindings()
  assert.ok(matches('moveForward', 'KeyW') && matches('moveForward', 'KeyZ'))
  assert.ok(matches('moveLeft', 'KeyA') && matches('moveLeft', 'KeyQ'))
  assert.ok(matches('hotbar1', 'Digit1'))
})

test('a key taken by another action moves to the new one', () => {
  resetBindings()
  const movedFrom = setBinding('cook', 0, 'KeyE')
  assert.equal(movedFrom, 'inventory')
  assert.ok(matches('cook', 'KeyE'))
  assert.ok(!matches('inventory', 'KeyE'))
  assert.deepEqual(bindings.cook, ['KeyE'])
})

test('reserved keys are refused and an action keeps at most two keys', () => {
  resetBindings()
  assert.equal(setBinding('interact', 0, 'Escape'), null)
  assert.ok(!matches('interact', 'Escape'))
  setBinding('interact', 1, 'KeyG')
  setBinding('interact', 2, 'KeyH')
  assert.equal(bindings.interact.length, 2)
})

test('clearing and resetting', () => {
  resetBindings()
  clearBinding('moveForward', 1)
  assert.deepEqual(bindings.moveForward, ['KeyW'])
  resetBindings()
  assert.deepEqual(bindings.moveForward, ['KeyW', 'KeyZ'])
})

test('rotate uses Shift for the reverse direction', () => {
  resetBindings()
  setBinding('rotate', 0, 'KeyG')
  assert.ok(matchesRotateCW({ code: 'KeyG', shiftKey: false } as KeyboardEvent))
  assert.ok(matchesRotateCCW({ code: 'KeyG', shiftKey: true } as KeyboardEvent))
  assert.ok(!matchesRotateCW({ code: 'KeyR', shiftKey: false } as KeyboardEvent))
})

test('key labels', () => {
  assert.equal(keyLabel('KeyW'), 'W')
  assert.equal(keyLabel('Digit3'), '3')
  assert.equal(keyLabel('Numpad5'), 'Num 5')
  assert.equal(keyLabel('ArrowUp'), '↑')
})
