import assert from 'node:assert/strict'
import test from 'node:test'

import {
  nextAutomaticSyncAt,
  stableConnectionJitter,
} from './_sync-schedule.js'

test('distribuisce stabilmente le connessioni entro trenta minuti', () => {
  const first = stableConnectionJitter('connection-a')
  assert.equal(first, stableConnectionJitter('connection-a'))
  assert.ok(first >= 0)
  assert.ok(first < 30 * 60 * 1000)
  assert.notEqual(first, stableConnectionJitter('connection-b'))
})

test('pianifica il prossimo sync non prima di sei ore', () => {
  const start = new Date('2026-08-18T00:00:00.000Z')
  const next = nextAutomaticSyncAt('connection-a', start)
  const elapsed = next.getTime() - start.getTime()
  assert.ok(elapsed >= 6 * 60 * 60 * 1000)
  assert.ok(elapsed < 6.5 * 60 * 60 * 1000)
})
