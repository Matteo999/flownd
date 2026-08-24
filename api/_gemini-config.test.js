import assert from 'node:assert/strict'
import test from 'node:test'

import { geminiStructuredGenerationConfig } from './_gemini-config.js'

const schema = { type: 'object', properties: {} }

test('usa il responseFormat enum per Gemini 3.7', () => {
  const config = geminiStructuredGenerationConfig('gemini-3.7-flash', schema, 1000)
  assert.equal(config.responseFormat.text.mimeType, 'APPLICATION_JSON')
  assert.equal(config.responseFormat.text.schema, schema)
  assert.equal(config.responseMimeType, undefined)
  assert.equal(config.thinkingConfig.thinkingLevel, 'LOW')
})

test('usa il payload strutturato legacy per Gemini 3.6', () => {
  const config = geminiStructuredGenerationConfig('gemini-3.6-flash', schema, 1000)
  assert.equal(config.responseMimeType, 'application/json')
  assert.equal(config.responseJsonSchema, schema)
  assert.equal(config.responseFormat, undefined)
  assert.equal(config.thinkingConfig.thinkingLevel, 'LOW')
})
