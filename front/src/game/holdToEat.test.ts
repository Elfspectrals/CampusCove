import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BITE_S, consumeKind, eatStep, isFull } from './holdToEat.ts'

test('bites as soon as the hold starts', () => {
  assert.equal(eatStep(0, 0, true), 'bite')
})

test('waits for the current bite to finish before the next one', () => {
  assert.equal(eatStep(0.5, 1, true), 'wait')
  assert.equal(eatStep(BITE_S - 0.001, 1, true), 'wait')
  assert.equal(eatStep(BITE_S, 1, true), 'bite')
})

test('a short tap still finishes its one bite before stopping', () => {
  assert.equal(eatStep(0.2, 1, false), 'wait')
  assert.equal(eatStep(BITE_S, 1, false), 'stop')
})

test('food fills hunger and drinks fill thirst', () => {
  assert.equal(consumeKind('food_water_bottle'), 'drink')
  assert.equal(consumeKind('grocery_apple'), 'eat')
  assert.equal(isFull({ health: 50, hunger: 100, thirst: 40 }, 'eat'), true)
  assert.equal(isFull({ health: 50, hunger: 100, thirst: 40 }, 'drink'), false)
  assert.equal(isFull({ health: 50, hunger: 99.5, thirst: 100 }, 'eat'), false)
})
