import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bootPercent, completeStage, createBootProgress, isBootDone, stageState, withFiles } from './bootProgress.ts'

test('a fresh boot is at 0 % with the character stage in progress', () => {
  const progress = createBootProgress(0)
  assert.equal(bootPercent(progress), 0)
  assert.equal(stageState(progress, 'character'), 'active')
  assert.equal(stageState(progress, 'world'), 'pending')
})

test('the first unfinished stage is the active one, even when a later one finished first', () => {
  let progress = createBootProgress(0)
  progress = completeStage(progress, 'server', 300)
  assert.equal(stageState(progress, 'server'), 'done')
  assert.equal(stageState(progress, 'character'), 'active')
  progress = completeStage(progress, 'character', 400)
  assert.equal(stageState(progress, 'world'), 'active')
})

test('files move the bar but never to 100 before every stage is done', () => {
  let progress = completeStage(createBootProgress(0), 'character', 5)
  progress = withFiles(progress, 50, 100)
  const half = bootPercent(progress)
  assert.ok(half > 5 && half < 50)
  progress = withFiles(progress, 100, 100)
  assert.ok(bootPercent(progress) < 100)
  for (const stage of ['character', 'world', 'decor'] as const) progress = completeStage(progress, stage, 1)
  assert.ok(bootPercent(progress) < 100)
  progress = completeStage(progress, 'server', 2)
  assert.equal(isBootDone(progress), true)
  assert.equal(bootPercent(progress), 100)
})

test('the bar never goes back when more files are queued', () => {
  let progress = completeStage(createBootProgress(0), 'character', 10)
  progress = withFiles(progress, 10, 10)
  const before = bootPercent(progress)
  progress = withFiles(progress, 10, 80)
  assert.equal(bootPercent(progress, before), before)
  progress = completeStage(progress, 'world', 20)
  assert.ok(bootPercent(progress, before) > before)
})

test('completing a stage twice keeps its first timing', () => {
  let progress = completeStage(createBootProgress(1000), 'world', 4000)
  progress = completeStage(progress, 'world', 9000)
  assert.equal(progress.timings.world, 3000)
})

test('loaded files never exceed the total', () => {
  assert.deepEqual(withFiles(createBootProgress(0), 12, 10).files, { loaded: 10, total: 10 })
})
