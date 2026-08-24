import assert from 'node:assert/strict'
import test from 'node:test'

import { geminiScan } from './_transaction-scan.js'

test('invia a Gemini 3.7 il MIME enum richiesto per la scansione JSON', async () => {
  const previousFetch = globalThis.fetch
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-key'
  let request
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body)
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ transactions: [] }) }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const parsed = await geminiScan('data:image/jpeg;base64,YQ==')
    assert.deepEqual(parsed, { transactions: [] })
    assert.equal(
      request.generationConfig.responseFormat.text.mimeType,
      'APPLICATION_JSON',
    )
    assert.deepEqual(
      request.generationConfig.responseFormat.text.schema.required,
      ['transactions'],
    )
    assert.equal(request.generationConfig.thinkingConfig.thinkingLevel, 'LOW')
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('non ritenta automaticamente la scansione se Gemini è saturo', async () => {
  const previousFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response(JSON.stringify({
      error: { message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    await assert.rejects(
      geminiScan('data:image/jpeg;base64,YQ=='),
      /high demand/,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = previousFetch
  }
})
