import assert from 'node:assert/strict'
import { test } from 'node:test'
import { bindings, clearBinding, keyLabel, matches, matchesRotateCCW, matchesRotateCW, mouseButtonCode, resetBindings, setBinding } from './keybindings.ts'

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

test('right click uses and left click punches by default, like Minecraft', () => {
  resetBindings()
  assert.ok(matches('interact', mouseButtonCode(2)))
  assert.ok(matches('punch', mouseButtonCode(0)))
  assert.equal(keyLabel(mouseButtonCode(2)), 'R-Click')
  assert.equal(keyLabel(mouseButtonCode(4)), 'Mouse 5')
})

test('mouse buttons only bind to interact and punch, and can be swapped', () => {
  resetBindings()
  assert.equal(setBinding('inventory', 0, 'MouseLeft'), null)
  assert.ok(!matches('inventory', 'MouseLeft'))
  assert.equal(setBinding('interact', 0, 'MouseLeft'), 'punch')
  assert.ok(matches('interact', 'MouseLeft') && !matches('punch', 'MouseLeft'))
  resetBindings()
})
