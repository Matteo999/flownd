import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildContributionPlan,
  calculateMemberBalances,
  coveredContribution,
  splitByContribution,
  totalContributionPercentage,
} from './group-finance.ts';

test('scenario A/B preserves personal ownership', () => {
  const plan = buildContributionPlan([
    { id: 'A', monthlyIncome: 2000, percentage: 40 },
    { id: 'B', monthlyIncome: 1600, percentage: 50 },
  ]);
  assert.deepEqual(plan.map(({ group, personal }) => ({ group, personal })), [
    { group: 800, personal: 1200 },
    { group: 800, personal: 800 },
  ]);
  assert.equal(plan.reduce((total, member) => total + member.group, 0), 1600);
});

test('coverage progresses on actual income without blocking the plan', () => {
  assert.equal(coveredContribution(800, 0, 40), 0);
  assert.equal(coveredContribution(800, 2000, 40), 800);
  assert.equal(coveredContribution(800, 1600, 50), 800);
});

test('equal contributions attribute a 360 euro remainder equally', () => {
  assert.deepEqual(splitByContribution(360, [
    { id: 'A', percentage: 40 },
    { id: 'B', percentage: 40 },
  ]), [
    { memberId: 'A', amount: 180 },
    { memberId: 'B', amount: 180 },
  ]);
});

test('payer balances stay separate from the economic split', () => {
  assert.deepEqual(calculateMemberBalances(['A', 'B'], [{
    paidBy: 'A',
    amount: 100,
    shares: [
      { memberId: 'A', amount: 50 },
      { memberId: 'B', amount: 50 },
    ],
  }]), [
    { memberId: 'A', balance: 50 },
    { memberId: 'B', balance: -50 },
  ]);
});

test('multiple group shares can be rejected above 100 percent', () => {
  assert.equal(totalContributionPercentage([40, 50]), 90);
  assert.ok(totalContributionPercentage([40, 50, 20]) > 100);
});

test('database privacy projection never exposes private transaction fields', async () => {
  const migration = await readFile(
    new URL('../../../../supabase/migrations/202609070001_group_virtual_finances.sql', import.meta.url),
    'utf8',
  );
  const projection = migration.slice(
    migration.indexOf('create or replace function public.shared_group_transactions'),
    migration.indexOf('create or replace function public.family_dashboard_summary'),
  );
  assert.match(projection, /else 'Spesa condivisa'/);
  assert.match(
    projection,
    /when member\.transaction_visibility = 'full' then transaction\.category/,
  );
  assert.match(projection, /else 'Movimento condiviso'/);
  assert.doesNotMatch(projection, /merchant_name|financial_account_id|raw_description/);
});
