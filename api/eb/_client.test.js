import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldRetryEnableBankingStatus } from './_client.js'

test('non ritenta immediatamente i rate limit bancari', () => {
  assert.equal(shouldRetryEnableBankingStatus(429), false)
})

test('ritenta soltanto gli errori provider transitori', () => {
  assert.equal(shouldRetryEnableBankingStatus(408), true)
  assert.equal(shouldRetryEnableBankingStatus(503), true)
  assert.equal(shouldRetryEnableBankingStatus(422), false)
})
