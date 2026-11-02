const PERIODS = ['week', 'month', 'year', 'cycle']

const readTools = [
  {
    type: 'function',
    name: 'get_financial_overview',
    description: 'Legge la panoramica personale: entrate, uscite, budget gerarchico, ciclo finanziario, conti, obiettivi, ricorrenze, prestiti e quota destinata ai gruppi. budget_income è la base del budget del ciclo corrente; i cycle_limit dei budget sono calcolati su quella base.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS },
      },
      required: ['period'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_transactions',
    description: 'Legge i movimenti personali contabilizzati, dal più recente, con filtri e un massimo di 50 risultati.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: PERIODS },
        kind: { type: 'string', enum: ['all', 'expense', 'income'] },
        category: { type: ['string', 'null'] },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['period', 'kind', 'category', 'limit'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_goals_and_debts',
    description: 'Legge tutti gli obiettivi personali attivi, i contributi recenti e i finanziamenti attivi.',
    strict: true,
    parameters: {
      type: 'object', properties: {}, required: [], additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_recurring_payments',
    description: 'Legge entrate e uscite ricorrenti personali, incluse frequenza, prossima scadenza e stato.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['active', 'paused', 'all'] } },
      required: ['status'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_group_finances',
    description: 'Legge le finanze dei gruppi accessibili. Rispetta permessi e visibilità dei movimenti, categorie e conti impostati dai membri.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { group_id: { type: ['string', 'null'] } },
      required: ['group_id'],
      additionalProperties: false,
    },
  },
]

const mutationTools = [
  {
    type: 'function', name: 'add_transaction',
    description: 'Propone una nuova spesa. Non salva: richiede sempre conferma nell’app.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        description: { type: 'string' }, amount: { type: 'number' }, category: { type: 'string' },
        occurred_at: { type: ['string', 'null'], description: 'Data ISO, oppure null per oggi.' },
      },
      required: ['description', 'amount', 'category', 'occurred_at'], additionalProperties: false,
    },
  },
  {
    type: 'function', name: 'create_goal',
    description: 'Propone un nuovo obiettivo personale. Non salva senza conferma.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' }, target_amount: { type: 'number' },
        deadline: { type: ['string', 'null'], description: 'Data ISO o null.' },
      },
      required: ['name', 'target_amount', 'deadline'], additionalProperties: false,
    },
  },
  {
    type: 'function', name: 'update_goal',
    description: 'Propone modifiche a un obiettivo personale attivo. Recupera prima il goal_id con get_goals_and_debts. Non salva senza conferma.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        goal_id: { type: ['string', 'null'] }, name: { type: ['string', 'null'] },
        target_amount: { type: ['number', 'null'] }, deadline: { type: ['string', 'null'] },
      },
      required: ['goal_id', 'name', 'target_amount', 'deadline'], additionalProperties: false,
    },
  },
  {
    type: 'function', name: 'update_budget',
    description: 'Propone la modifica di una quota macro del budget personale, con monthly_limit in euro per il ciclo corrente (base: budget_income.available_for_budget). Non salva senza conferma.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        category_key: { type: 'string', enum: ['needs', 'wants', 'savings'] },
        monthly_limit: { type: 'number' },
      },
      required: ['category_key', 'monthly_limit'], additionalProperties: false,
    },
  },
]

export const coachTools = [...readTools, ...mutationTools]
export const coachMutationToolNames = new Set(mutationTools.map((tool) => tool.name))

function geminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(geminiSchema)
  if (!schema || typeof schema !== 'object') return schema
  const next = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue
    if (key === 'type' && Array.isArray(value)) {
      next.type = value.find((item) => item !== 'null')
      if (value.includes('null')) next.nullable = true
      continue
    }
    next[key] = geminiSchema(value)
  }
  return next
}

export const geminiCoachTools = [{
  functionDeclarations: coachTools.map(({ name, description, parameters }) => ({
    name, description, parameters: geminiSchema(parameters),
  })),
}]

function startForCalendarPeriod(period, now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  if (period === 'week') start.setDate(start.getDate() - 6)
  if (period === 'month') start.setDate(1)
  if (period === 'year') start.setMonth(0, 1)
  return start
}

// Stessa regola dell'app (apps/mobile/src/lib/financial-cycle.ts): uno stipendio
// arrivato nei dieci giorni prima del giorno configurato anticipa il ciclo.
const EARLY_SALARY_WINDOW_DAYS = 10

function isSalary(row) {
  return row.kind === 'income' && (row.income_type === 'salary' || row.category === 'Stipendio')
}

export function currentCycleStart(startDay, rows = [], now = new Date()) {
  const day = Math.min(28, Math.max(1, Math.round(Number(startDay) || 1)))
  const salaries = rows.filter(isSalary).map((row) => new Date(row.occurred_at))
    .filter((occurredAt) => !Number.isNaN(occurredAt.getTime()))
  const boundaries = [-2, -1, 0, 1, 2].map((offset) => {
    const nominal = new Date(now.getFullYear(), now.getMonth() + offset, day)
    const earliest = new Date(nominal)
    earliest.setDate(earliest.getDate() - EARLY_SALARY_WINDOW_DAYS)
    const salary = salaries
      .filter((occurredAt) => occurredAt >= earliest && occurredAt < nominal)
      .sort((first, second) => second - first)[0]
    const boundary = salary ? new Date(salary) : nominal
    boundary.setHours(0, 0, 0, 0)
    return boundary
  }).sort((first, second) => first - second)
  return boundaries.findLast((boundary) => boundary <= now) ?? boundaries[0]
}

async function cycleStartAndIncome(client, userId) {
  const { data, error } = await client.from('profiles')
    .select('budget_cycle_start_day').eq('id', userId).single()
  if (error) throw error
  const now = new Date()
  const lookback = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const { data: incomeRows, error: incomeError } = await client.from('transactions')
    .select('amount,kind,category,income_type,occurred_at,excluded_from_budget')
    .eq('user_id', userId).eq('kind', 'income')
    .gte('occurred_at', lookback.toISOString())
  if (incomeError) throw incomeError
  const start = currentCycleStart(data.budget_cycle_start_day, incomeRows || [], now)
  const cycleIncome = (incomeRows || []).filter((row) => new Date(row.occurred_at) >= start)
  return { start, cycleIncome }
}

async function periodStart(client, userId, period) {
  if (!PERIODS.includes(period)) throw new Error('Periodo non valido')
  if (period !== 'cycle') return startForCalendarPeriod(period)
  return (await cycleStartAndIncome(client, userId)).start
}

// Base del budget come nell'app (grossBudgetMonthlyIncome / budgetMonthlyIncome):
// entrate del ciclo incluse nel budget, e solo senza entrate nel ciclo la stima
// salvata nel profilo; poi si sottrae la quota ai gruppi.
export function budgetIncomeSummary(cycleIncome, plannedIncome, groupAllocation) {
  const included = cycleIncome.filter((row) => !row.excluded_from_budget)
  const sum = (rows) => rows.reduce((total, row) => total + Number(row.amount), 0)
  const hasIncome = cycleIncome.length > 0
  const gross = hasIncome ? sum(included) : Number(plannedIncome || 0)
  const allocatedToGroups = Number(groupAllocation?.allocatedToGroups || 0)
  const groupCarryIn = Number(groupAllocation?.personalCarryIn || 0)
  return {
    source: hasIncome ? 'cycle_income' : 'onboarding_estimate',
    gross_income: gross,
    included_income_count: included.length,
    excluded_income: sum(cycleIncome.filter((row) => row.excluded_from_budget)),
    allocated_to_groups: allocatedToGroups,
    group_carry_in: groupCarryIn,
    available_for_budget: Math.max(0, gross - allocatedToGroups + groupCarryIn),
  }
}

export async function getBudgetIncome(client, userId) {
  const [{ cycleIncome }, profile, groupAllocation] = await Promise.all([
    cycleStartAndIncome(client, userId),
    client.from('profiles').select('planned_monthly_income').eq('id', userId).single(),
    client.rpc('my_group_allocation_summary'),
  ])
  throwFirstError([profile, groupAllocation])
  return budgetIncomeSummary(cycleIncome, profile.data.planned_monthly_income, groupAllocation.data)
}

// Porta di materializeBudgetAmounts (apps/mobile/src/lib/onboarding.ts): i
// monthly_limit salvati sono calcolati sulla stima del profilo, non sul ciclo.
export function cycleBudgetLimits(budgets, base) {
  const amounts = new Map()
  for (const row of budgets) {
    if (row.is_macro) amounts.set(row.category_key, Math.round(base * row.allocation_percentage / 100))
  }
  const macroKey = (row) => budgets.find((item) => item.is_macro && item.parent_key === row.parent_key)?.category_key
  for (const row of budgets) {
    if (row.is_macro || row.parent_category_key) continue
    const parent = amounts.get(macroKey(row)) ?? 0
    amounts.set(row.category_key, row.budget_enabled === false ? 0 : Math.round(parent * row.allocation_percentage / 100))
  }
  return budgets.map((row) => {
    if (row.is_macro || !row.parent_category_key) return { ...row, cycle_limit: amounts.get(row.category_key) ?? 0 }
    const parent = amounts.get(row.parent_category_key) ?? 0
    return { ...row, cycle_limit: row.budget_enabled === false ? 0 : Math.round(parent * row.allocation_percentage / 100) }
  })
}

function throwFirstError(results) {
  const error = results.find((result) => result.error)?.error
  if (error) throw error
}

export async function getFinancialOverview(client, userId, period) {
  if (!PERIODS.includes(period)) throw new Error('Periodo non valido')
  const cycle = await cycleStartAndIncome(client, userId)
  const start = period === 'cycle' ? cycle.start : startForCalendarPeriod(period)
  const historyStart = period === 'cycle' ? shiftCycle(start, -6) : null
  const results = await Promise.all([
    client.from('profiles')
      .select('planned_monthly_income,budget_cycle_start_day,budget_rollover_mode,goal_allocation_mode')
      .eq('id', userId).single(),
    client.from('transactions')
      .select('amount,kind,category,excluded_from_budget')
      .eq('user_id', userId).eq('excluded_from_totals', false)
      .gte('occurred_at', start.toISOString()),
    client.from('budget_categories')
      .select('category_key,name,monthly_limit,allocation_percentage,parent_key,parent_category_key,budget_enabled,is_macro')
      .eq('user_id', userId).order('created_at'),
    client.from('goals')
      .select('id,name,target_amount,saved_amount,deadline_label,monthly_contribution,allocation_percentage,priority,status')
      .eq('user_id', userId).is('group_id', null).eq('active', true).order('priority'),
    client.from('financial_accounts')
      .select('id,name,current_balance,source,account_kind,balance_as_of,last_synced_at,institution_name,currency')
      .eq('user_id', userId).eq('active', true).order('created_at'),
    client.from('recurring_payments')
      .select('id,name,amount,next_due_on,series_type,direction,status,frequency,category')
      .eq('user_id', userId).in('status', ['active', 'paused']).order('next_due_on'),
    client.from('loans')
      .select('id,name,financed_amount,down_payment,installment_count,monthly_payment,interest_rate,start_date,final_balloon')
      .eq('user_id', userId).eq('active', true).order('created_at'),
    client.rpc('my_group_allocation_summary'),
    historyStart
      ? client.from('transactions')
        .select('amount,kind,occurred_at')
        .eq('user_id', userId).eq('excluded_from_totals', false)
        .gte('occurred_at', historyStart.toISOString()).lt('occurred_at', start.toISOString())
      : Promise.resolve({ data: [], error: null }),
  ])
  throwFirstError(results)
  const [profile, transactions, budgets, goals, accounts, recurring, loans, groupAllocation, history] = results
  const rows = transactions.data || []
  const income = rows.filter((row) => row.kind === 'income')
    .reduce((sum, row) => sum + Number(row.amount), 0)
  const expenseRows = rows.filter((row) => row.kind !== 'income')
  const expense = expenseRows.reduce((sum, row) => sum + Number(row.amount), 0)
  const budgetExpense = expenseRows.filter((row) => !row.excluded_from_budget)
    .reduce((sum, row) => sum + Number(row.amount), 0)
  const categories = expenseRows.reduce((summary, row) => {
    const category = row.category || 'Altro'
    summary[category] = (summary[category] || 0) + Number(row.amount)
    return summary
  }, {})
  const accountRows = accounts.data || []
  const { planned_monthly_income: plannedIncome, ...profileSettings } = profile.data
  const budgetIncome = budgetIncomeSummary(cycle.cycleIncome, plannedIncome, groupAllocation.data)
  const {
    plannedIncome: _plannedIncome, personalAvailable: _personalAvailable, ...groupAllocationData
  } = groupAllocation.data || {}
  return {
    period, period_start: start.toISOString(), income, expense,
    budget_expense: budgetExpense, net: income - expense, categories,
    profile: profileSettings,
    cycle_start: cycle.start.toISOString(),
    budget_income: budgetIncome,
    budgets: cycleBudgetLimits((budgets.data || []).map(({ monthly_limit: _limit, ...row }) => ({
      ...row, allocation_percentage: Number(row.allocation_percentage),
    })), budgetIncome.available_for_budget),
    goals: (goals.data || []).map(numericGoal),
    accounts: accountRows.map((row) => ({ ...row, current_balance: Number(row.current_balance) })),
    net_worth: accountRows.reduce((sum, row) => sum + Number(row.current_balance), 0),
    recurring_payments: (recurring.data || []).map(numericAmount),
    loans: (loans.data || []).map(numericLoan),
    group_allocation: groupAllocation.data ? groupAllocationData : null,
    historical_comparison: period === 'cycle'
      ? cycleHistoryComparison(history.data || [], start, expense)
      : null,
  }
}

function shiftCycle(start, monthOffset) {
  const shifted = new Date(start)
  shifted.setMonth(shifted.getMonth() + monthOffset)
  return shifted
}

export function cycleHistoryComparison(rows, currentCycleStart, currentExpense) {
  const cycles = []
  for (let offset = -6; offset < 0; offset += 1) {
    const cycleStart = shiftCycle(currentCycleStart, offset)
    const cycleEnd = shiftCycle(currentCycleStart, offset + 1)
    const cycleRows = rows.filter((row) => {
      const occurredAt = new Date(row.occurred_at)
      return occurredAt >= cycleStart && occurredAt < cycleEnd
    })
    if (!cycleRows.length) continue
    cycles.push({
      start: cycleStart.toISOString(),
      end: cycleEnd.toISOString(),
      expense: cycleRows.filter((row) => row.kind !== 'income')
        .reduce((sum, row) => sum + Number(row.amount), 0),
    })
  }
  if (!cycles.length) {
    return {
      completed_cycles: [], sample_size: 0, average_expense: null,
      current_expense: currentExpense, difference: null, difference_percentage: null,
    }
  }
  const average = cycles.reduce((sum, cycle) => sum + cycle.expense, 0) / cycles.length
  const difference = currentExpense - average
  return {
    completed_cycles: cycles,
    sample_size: cycles.length,
    average_expense: average,
    current_expense: currentExpense,
    difference,
    difference_percentage: average > 0 ? difference / average * 100 : null,
  }
}

export async function getTransactions(client, userId, args) {
  const start = await periodStart(client, userId, args.period)
  let query = client.from('transactions')
    .select('id,description,amount,category,kind,occurred_at,source,financial_account_id,excluded_from_budget')
    .eq('user_id', userId).eq('excluded_from_totals', false)
    .gte('occurred_at', start.toISOString())
    .order('occurred_at', { ascending: false })
    .limit(Math.min(50, Math.max(1, Number(args.limit) || 20)))
  if (args.kind !== 'all') query = query.eq('kind', args.kind)
  if (args.category) query = query.ilike('category', `%${args.category}%`)
  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row) => ({ ...row, amount: Number(row.amount) }))
}

export async function getGoalsAndDebts(client, userId) {
  const contributionStart = new Date()
  contributionStart.setFullYear(contributionStart.getFullYear() - 1)
  const results = await Promise.all([
    client.from('goals')
      .select('id,name,target_amount,saved_amount,deadline_label,monthly_contribution,allocation_percentage,priority,status')
      .eq('user_id', userId).is('group_id', null).eq('active', true).order('priority'),
    client.from('goal_contributions')
      .select('id,goal_id,amount,source,occurred_at').eq('user_id', userId)
      .is('group_id', null).gte('occurred_at', contributionStart.toISOString())
      .order('occurred_at', { ascending: false }).limit(50),
    client.from('loans')
      .select('id,name,financed_amount,down_payment,installment_count,monthly_payment,interest_rate,start_date,final_balloon')
      .eq('user_id', userId).eq('active', true).order('created_at'),
  ])
  throwFirstError(results)
  return {
    goals: (results[0].data || []).map(numericGoal),
    contributions: (results[1].data || []).map((row) => ({ ...row, amount: Number(row.amount) })),
    loans: (results[2].data || []).map(numericLoan),
  }
}

export async function getRecurringPayments(client, userId, status) {
  let query = client.from('recurring_payments')
    .select('id,name,amount,next_due_on,series_type,direction,origin,status,frequency,category,anchor_on,settlement_mode,occurrence_limit,occurrences_completed')
    .eq('user_id', userId).order('next_due_on')
  if (status !== 'all') query = query.eq('status', status)
  else query = query.in('status', ['active', 'paused'])
  const { data, error } = await query
  if (error) throw error
  return (data || []).map(numericAmount)
}

export async function getGroupFinances(client, userId, requestedGroupId) {
  const { data: memberships, error } = await client.from('group_members')
    .select('group_id,role,transactions_access,budgets_access,goals_access')
    .eq('user_id', userId).order('joined_at')
  if (error) throw error
  const selected = requestedGroupId
    ? (memberships || []).filter((membership) => membership.group_id === requestedGroupId)
    : (memberships || [])
  if (requestedGroupId && !selected.length) throw new Error('Gruppo non accessibile')
  return Promise.all(selected.map(async (membership) => {
    const results = await Promise.all([
      client.rpc('family_dashboard_summary', { p_group_id: membership.group_id }),
      client.rpc('group_finance_overview', { p_group_id: membership.group_id }),
      client.rpc('shared_group_transactions', { p_group_id: membership.group_id }),
      client.from('group_budgets').select('id,category,monthly_limit,percentage')
        .eq('group_id', membership.group_id).order('category'),
      client.from('goals').select('id,name,target_amount,saved_amount,deadline_label,status')
        .eq('group_id', membership.group_id).eq('active', true).order('priority'),
      client.from('goal_group_shares').select('goal_id').eq('group_id', membership.group_id),
      client.rpc('group_member_balances', { p_group_id: membership.group_id }),
    ])
    throwFirstError(results)
    const sharedGoalIds = (results[5].data || []).map((item) => item.goal_id)
    const sharedGoalsResult = sharedGoalIds.length
      ? await client.from('goals')
        .select('id,name,target_amount,saved_amount,deadline_label,status')
        .in('id', sharedGoalIds).eq('active', true)
      : { data: [], error: null }
    if (sharedGoalsResult.error) throw sharedGoalsResult.error
    const goals = [...(results[4].data || []), ...(sharedGoalsResult.data || [])]
      .filter((goal, index, rows) => rows.findIndex((row) => row.id === goal.id) === index)
      .map((goal) => ({
        ...goal,
        target_amount: Number(goal.target_amount),
        saved_amount: Number(goal.saved_amount),
      }))
    return {
      group_id: membership.group_id,
      access: membership,
      dashboard: results[0].data,
      current_cycle: results[1].data,
      recent_visible_transactions: results[2].data,
      budgets: (results[3].data || []).map((budget) => ({
        ...budget,
        monthly_limit: Number(budget.monthly_limit),
        percentage: budget.percentage == null ? null : Number(budget.percentage),
      })),
      goals,
      member_balances: results[6].data,
    }
  }))
}

function numericAmount(row) {
  return { ...row, amount: Number(row.amount) }
}

function numericGoal(row) {
  return {
    ...row,
    target_amount: Number(row.target_amount), saved_amount: Number(row.saved_amount),
    monthly_contribution: Number(row.monthly_contribution),
    allocation_percentage: Number(row.allocation_percentage),
  }
}

function numericLoan(row) {
  return {
    ...row,
    financed_amount: Number(row.financed_amount), down_payment: Number(row.down_payment),
    monthly_payment: Number(row.monthly_payment),
    interest_rate: row.interest_rate == null ? null : Number(row.interest_rate),
    final_balloon: row.final_balloon == null ? null : Number(row.final_balloon),
  }
}

export async function executeCoachReadTool(client, userId, name, args = {}) {
  if (name === 'get_financial_overview') return getFinancialOverview(client, userId, args.period)
  if (name === 'get_transactions') return getTransactions(client, userId, args)
  if (name === 'get_goals_and_debts') return getGoalsAndDebts(client, userId)
  if (name === 'get_recurring_payments') return getRecurringPayments(client, userId, args.status)
  if (name === 'get_group_finances') return getGroupFinances(client, userId, args.group_id)
  return { error: 'Tool non supportato' }
}
