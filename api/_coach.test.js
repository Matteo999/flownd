import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { coachTools, cycleHistoryComparison, geminiCoachTools } from './_coach-data.js'
import { coachErrorLog, conversationTitle } from './coach.js'

const expectedTools = [
  'get_financial_overview',
  'get_transactions',
  'get_goals_and_debts',
  'get_recurring_payments',
  'get_group_finances',
  'add_transaction',
  'create_goal',
  'update_goal',
  'update_budget',
]

test('titolo conversazione normalizzato e limitato a 60 caratteri', () => {
  assert.equal(conversationTitle('  Quanto   ho speso?  '), 'Quanto ho speso?')
  const title = conversationTitle('a'.repeat(100))
  assert.equal(title.length, 60)
  assert.ok(title.endsWith('…'))
})

test('OpenAI e Gemini espongono gli stessi tool del Coach', () => {
  assert.deepEqual(coachTools.map((tool) => tool.name), expectedTools)
  assert.deepEqual(
    geminiCoachTools[0].functionDeclarations.map((tool) => tool.name),
    expectedTools,
  )
  assert.ok(coachTools.every((tool) => tool.strict))
  assert.ok(geminiCoachTools[0].functionDeclarations.every(
    (tool) => !Object.hasOwn(tool.parameters, 'additionalProperties'),
  ))
})

test('il confronto storico usa fino a sei cicli finanziari completati', () => {
  const comparison = cycleHistoryComparison([
    { occurred_at: '2026-07-10T12:00:00.000Z', kind: 'expense', amount: 100 },
    { occurred_at: '2026-07-12T12:00:00.000Z', kind: 'income', amount: 500 },
    { occurred_at: '2026-08-10T12:00:00.000Z', kind: 'expense', amount: 300 },
  ], new Date('2026-08-25T00:00:00.000Z'), 250)

  assert.equal(comparison.sample_size, 2)
  assert.equal(comparison.average_expense, 200)
  assert.equal(comparison.difference, 50)
  assert.equal(comparison.difference_percentage, 25)
})

test('l API limita il contesto e non delega la memoria al provider', async () => {
  const source = await readFile(new URL('./coach.js', import.meta.url), 'utf8')
  assert.match(source, /MODEL_CONTEXT_MESSAGES = 20/)
  assert.match(source, /store: false/)
  assert.match(source, /loadMessages\(client, user\.id, conversation\.id, MODEL_CONTEXT_MESSAGES\)/)
})

test('il log del Coach espone la fase ma oscura credenziali e contenuti sensibili', () => {
  const error = new Error('Gemini rejected Authorization=secret-value Bearer token-value')
  error.code = 'PERMISSION_DENIED'
  error.status = 403
  error.details = 'token=another-secret'
  error.coachContext = {
    phase: 'provider_request',
    provider: 'gemini',
    model: 'gemini-test',
    tool: 'get_financial_overview',
  }
  const log = coachErrorLog(error, {
    requestId: 'request-id',
    method: 'POST',
    userId: 'user-id',
  })

  assert.equal(log.phase, 'provider_request')
  assert.equal(log.provider, 'gemini')
  assert.equal(log.model, 'gemini-test')
  assert.equal(log.tool, 'get_financial_overview')
  assert.equal(log.error.code, 'PERMISSION_DENIED')
  assert.equal(log.error.status, 403)
  assert.doesNotMatch(JSON.stringify(log), /secret-value|token-value|another-secret/)
})

test('la migrazione applica limiti, RLS e risoluzione atomica', async () => {
  const source = await readFile(
    new URL('../supabase/migrations/202609220001_coach_conversation_history.sql', import.meta.url),
    'utf8',
  )
  assert.match(source, /alter table public\.coach_conversations enable row level security/)
  assert.match(source, /alter table public\.coach_messages enable row level security/)
  assert.match(source, /offset 10/)
  assert.match(source, /offset 100/)
  assert.match(source, /create or replace function public\.resolve_coach_action/)
  assert.match(source, /for update/)
  assert.match(source, /proposal\.action_status <> 'pending'/)

  const management = await readFile(
    new URL('../supabase/migrations/202609220002_coach_conversation_management.sql', import.meta.url),
    'utf8',
  )
  assert.match(management, /add column if not exists is_pinned boolean/)
  assert.match(management, /order by older\.is_pinned desc, older\.updated_at desc/)
})
