import assert from 'node:assert/strict'
import test from 'node:test'

import { AI_LIMITS, aiLimitsFor, quotaDeniedMessage } from './_ai-quota.js'

test('limiti per piano: Free 1 domanda a settimana, niente scansioni e import', () => {
  assert.deepEqual(aiLimitsFor('coach', 'free'), { weekly: 1, daily: 1, minute: 6 })
  assert.equal(aiLimitsFor('scan', 'free'), null)
  assert.equal(aiLimitsFor('import', 'free'), null)
  assert.equal(aiLimitsFor('coach', 'sconosciuto'), AI_LIMITS.coach.free)
})

test('Max raddoppia le quote mensili di Pro', () => {
  for (const feature of ['coach', 'scan', 'import']) {
    assert.equal(aiLimitsFor(feature, 'max').monthly, aiLimitsFor(feature, 'pro').monthly * 2)
  }
  assert.equal(aiLimitsFor('coach', 'pro').monthly, 60)
  assert.equal(aiLimitsFor('scan', 'pro').monthly, 20)
  assert.equal(aiLimitsFor('import', 'pro').monthly, 4)
})

test('funzione sconosciuta', () => {
  assert.throws(() => aiLimitsFor('video', 'pro'))
})

test('messaggi di quota esaurita', () => {
  assert.match(quotaDeniedMessage('coach', 'weekly', 'free'), /1 domanda al Coach a settimana/)
  assert.match(quotaDeniedMessage('scan', 'monthly', 'max'), /Il gruppo ha esaurito/)
  assert.match(quotaDeniedMessage('import', 'monthly', 'pro'), /con Max la quota raddoppia/)
  assert.match(quotaDeniedMessage('coach', 'minute', 'pro'), /Attendi un minuto/)
})
