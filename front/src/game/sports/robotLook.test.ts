import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_ROBOT, robotAppearance } from './robotLook.ts'

test('a robot takes the outfit and colours of the model set for its coach: every slot it does not wear is empty, hair included', () => {
  const models = [{ coach: 'boxing_coach', body: '#202020', outfit: [{ slot: 'head_accessory', key: 'robot_dummy', color: '#ff0000' }, { slot: 'top', key: 'robot_tin', color: '#00ff00' }] as const }]
  assert.deepEqual(robotAppearance(models, 'boxing_coach'), {
    slotModels: { hair: null, head_accessory: '/assets/wear/head_accessory/robot_dummy/model.glb', top: '/assets/wear/top/robot_tin/model.glb', bottom: null, shoes: null },
    slotHexes: { body: '#202020', head_accessory: '#ff0000', top: '#00ff00' },
  })
})

test('in a team sport a robot takes its team colour on the head, torso and legs and keeps its own feet', () => {
  const red = robotAppearance([], 'gym_coach', 'red')
  assert.deepEqual([red.slotHexes.head_accessory, red.slotHexes.top, red.slotHexes.bottom, red.slotHexes.shoes], ['#d62a2a', '#d62a2a', '#d62a2a', '#9fe3c0'])
  assert.equal(robotAppearance([], 'gym_coach', 'blue').slotHexes.top, '#2457c5')
  assert.deepEqual(robotAppearance([], 'gym_coach', null), robotAppearance([], 'gym_coach'))
  assert.deepEqual(red.slotModels, robotAppearance([], 'gym_coach').slotModels)
})

test('a coach with no robot model, or a robot with no coach, gets the default droid', () => {
  const fallback = robotAppearance([], 'tennis_coach')
  assert.equal(fallback.slotModels.head_accessory, '/assets/wear/head_accessory/robot_droid/model.glb')
  assert.equal(fallback.slotModels.hair, null)
  assert.equal(fallback.slotHexes.body, DEFAULT_ROBOT.body)
  assert.deepEqual(robotAppearance([{ coach: 'other', body: '#000000', outfit: [] }], undefined), fallback)
})
