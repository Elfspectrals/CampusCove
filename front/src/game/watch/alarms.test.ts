import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_ALARM_ALERTS, withAlert } from './alarms.ts'

test('the newest alarm comes first', () => {
  const one = withAlert([], { kind: 'away', at: '2026-11-13T10:00:00Z', count: 2 })
  const two = withAlert(one, { kind: 'live', at: '2026-11-13T11:00:00Z', count: 1 })
  assert.deepEqual(two.map((a) => a.kind), ['live', 'away'])
  assert.notEqual(two[0].id, two[1].id)
})

test('the list keeps the 20 newest alarms', () => {
  let alerts = withAlert([], { kind: 'live', at: 'first', count: 1 })
  for (let i = 0; i < MAX_ALARM_ALERTS; i++) alerts = withAlert(alerts, { kind: 'live', at: `t${i}`, count: 1 })
  assert.equal(alerts.length, MAX_ALARM_ALERTS)
  assert.equal(alerts.some((a) => a.at === 'first'), false)
})
