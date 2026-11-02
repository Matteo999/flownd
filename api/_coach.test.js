import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  budgetIncomeSummary,
  coachTools,
  currentCycleStart,
  cycleBudgetLimits,
  cycleHistoryComparison,
  geminiCoachTools,
} from './_coach-data.js'
import { coachErrorLog, conversationTitle, modelContext } from './coach.js'

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

test('il contesto esclude le domande senza risposta e termina col messaggio corrente', () => {
  const messages = [
    { id: 'u1', role: 'user', content: 'Prima' },
    { id: 'a1', role: 'assistant', content: 'Risposta' },
    { id: 'u2', role: 'user', content: 'Rimasta senza risposta' },
    { id: 'u3', role: 'user', content: 'Ultima domanda' },
  ]
  assert.deepEqual(modelContext(messages, 'u3').map((message) => message.id), ['u1', 'a1', 'u3'])
  assert.deepEqual(modelContext(messages, 'missing').map((message) => message.id), ['u1', 'a1'])
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

test('il ciclo inizia prima se lo stipendio arriva in anticipo', () => {
  const now = new Date(2026, 9, 30, 12)
  assert.equal(currentCycleStart(27, [], now).getTime(), new Date(2026, 9, 27).getTime())
  const salary = [{ kind: 'income', category: 'Stipendio', occurred_at: new Date(2026, 9, 24, 9).toISOString() }]
  assert.equal(currentCycleStart(27, salary, now).getTime(), new Date(2026, 9, 24).getTime())
})

test('la base del budget è la media dei cicli chiusi, non le entrate del ciclo in corso', () => {
  const average = budgetIncomeSummary([
    { amount: 1800, excluded_from_budget: false },
    { amount: 300, excluded_from_budget: true },
  ], {
    planned_monthly_income: 2100, planned_income_source: 'cycle_average', planned_income_cycles: 3,
  }, { allocatedToGroups: 200, personalCarryIn: 50 })
  assert.equal(average.source, 'cycle_average')
  assert.equal(average.reference_income, 2100)
  assert.equal(average.reference_cycles, 3)
  assert.equal(average.current_cycle_income, 1800)
  assert.equal(average.current_cycle_excluded_income, 300)
  assert.equal(average.available_for_budget, 1950)

  const estimate = budgetIncomeSummary([], {
    planned_monthly_income: 1250, planned_income_source: 'onboarding', planned_income_cycles: 0,
  }, null)
  assert.equal(estimate.source, 'onboarding_estimate')
  assert.equal(estimate.available_for_budget, 1250)
})

test('la base unica è calcolata dal database e non scritta dal client', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/202611020002_budget_reference_income.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /limit 3/)
  assert.match(migration, /public\.income_band_reference\(band\)/)
  assert.match(migration, /new\.planned_monthly_income := old\.planned_monthly_income/)
  assert.match(migration, /referencing new table as new_rows/)
  assert.doesNotMatch(
    migration.slice(migration.indexOf('function public.save_budget_allocations')),
    /set planned_monthly_income = p_planned_monthly_income/,
  )
})

test('i limiti del ciclo seguono le percentuali sulla base reale', () => {
  const limits = cycleBudgetLimits([
    { category_key: 'needs', parent_key: 'needs', is_macro: true, allocation_percentage: 50 },
    { category_key: 'casa', parent_key: 'needs', is_macro: false, allocation_percentage: 60 },
    { category_key: 'affitto', parent_key: 'needs', parent_category_key: 'casa', is_macro: false, allocation_percentage: 50 },
    { category_key: 'auto', parent_key: 'needs', is_macro: false, allocation_percentage: 40, budget_enabled: false },
  ], 2000)
  assert.deepEqual(limits.map((row) => row.cycle_limit), [1000, 600, 300, 0])
})

test('le proposte di budget allegano la base del ciclo usata dalla conferma', async () => {
  const source = await readFile(new URL('./coach.js', import.meta.url), 'utf8')
  assert.match(source, /budget_base: budgetIncome\.available_for_budget/)
  const migration = await readFile(
    new URL('../supabase/migrations/202611020001_coach_budget_proposal_cycle_base.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /amount \/ budget_base \* 100/)
  assert.match(migration, /save_budget_allocations\(planned_income, allocations\)/)
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
