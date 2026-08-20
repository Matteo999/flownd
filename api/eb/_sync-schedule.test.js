import assert from 'node:assert/strict'
import test from 'node:test'

import { nextAutomaticSyncAt } from './_sync-schedule.js'

test('pianifica il prossimo sync esattamente sei ore dopo', () => {
  const start = new Date('2026-08-18T00:00:00.000Z')
  const next = nextAutomaticSyncAt('connection-a', start)
  assert.equal(next.toISOString(), '2026-08-18T06:00:00.000Z')
})
