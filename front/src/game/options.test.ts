import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_OPTIONS, clampSensitivity, clampVolume, isCustomRender, parseOptions, parseRenderOverrides, renderSettingsOf } from './options.ts'

test('the mouse sensitivity stays between 0.2 and 3 in steps of 0.1, and a volume between 0 and 1', () => {
  assert.deepEqual([0, 0.2, 0.24, 1, 1.26, 3, 9, Number.NaN].map(clampSensitivity), [0.2, 0.2, 0.2, 1, 1.3, 3, 3, 1])
  assert.deepEqual([-1, 0, 0.456, 1, 2, Number.NaN].map(clampVolume), [0, 0, 0.46, 1, 1, 1])
})

test('saved options are read field by field: a missing or broken one takes its default, never the whole set', () => {
  assert.deepEqual(parseOptions(null), DEFAULT_OPTIONS)
  assert.deepEqual(parseOptions('not json'), DEFAULT_OPTIONS)
  assert.deepEqual(parseOptions('{"mouseSensitivity":2.5,"invertY":true,"masterVolume":0.3,"effectsVolume":"loud","showCoordinates":false}'), {
    mouseSensitivity: 2.5,
    invertY: true,
    masterVolume: 0.3,
    effectsVolume: 1,
    musicVolume: 1,
    showCoordinates: false,
  })
})

test('a graphics preset sets resolution, anti-aliasing and shadows, and an override changes one of them', () => {
  assert.deepEqual(renderSettingsOf('low', {}), { nativeResolution: false, antialias: false, shadows: false })
  assert.deepEqual(renderSettingsOf('high', {}), { nativeResolution: true, antialias: true, shadows: true })
  assert.deepEqual(renderSettingsOf('medium', { shadows: true }), { nativeResolution: false, antialias: true, shadows: true })
  assert.equal(isCustomRender('medium', { shadows: true }), true)
  assert.equal(isCustomRender('medium', { antialias: true }), false)
  assert.equal(isCustomRender('high', {}), false)
  assert.deepEqual(parseRenderOverrides('{"shadows":true,"antialias":"yes","other":true}'), { shadows: true })
  assert.deepEqual(parseRenderOverrides('broken'), {})
})
