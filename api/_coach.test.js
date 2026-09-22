import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { coachTools, geminiCoachTools } from './_coach-data.js'
import { conversationTitle } from './coach.js'

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

test('l API limita il contesto e non delega la memoria al provider', async () => {
  const source = await readFile(new URL('./coach.js', import.meta.url), 'utf8')
  assert.match(source, /MODEL_CONTEXT_MESSAGES = 20/)
  assert.match(source, /store: false/)
  assert.match(source, /loadMessages\(client, user\.id, conversation\.id, MODEL_CONTEXT_MESSAGES\)/)
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
})
