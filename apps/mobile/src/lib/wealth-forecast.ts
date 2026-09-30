import type { ExpenseDraft } from '@/lib/onboarding';
import type { RecurringSeries } from '@/lib/recurring-payments-core';

// Previsione del patrimonio (piano Max): la linea prosegue da oggi con il
// risparmio mensile medio degli ultimi mesi completi, più gli eventi
// ricorrenti non mensili (spese annuali, mensilità aggiuntive). La banda è
// l'intervallo all'80% ricavato dalla variabilità dei risparmi mensili.

export const FORECAST_HISTORY_MONTHS = 6;
export const FORECAST_MIN_MONTHS = 2;
const BAND_Z = 1.28;

const EVENT_STEP_MONTHS: Partial<Record<RecurringSeries['frequency'], number>> = {
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export type ForecastEvent = {
  id: string;
  name: string;
  icon: string;
  // Importo con segno: positivo entra, negativo esce.
  amount: number;
  // Mesi da oggi (1 = il prossimo mese) in cui l'evento cade nell'orizzonte.
  offsets: number[];
  // Etichetta della cadenza, es. "ogni anno".
  cadence: string;
};

export type SavingsBaseline = {
  // Risparmio medio mensile, esclusi gli eventi.
  monthly: number;
  // Deviazione standard dei risparmi mensili.
  sigma: number;
  months: number;
};

function monthIndex(date: Date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function signedAmount(transaction: ExpenseDraft) {
  return transaction.kind === 'income' ? transaction.amount : -transaction.amount;
}

function isEventSeries(series: RecurringSeries) {
  return series.status === 'active' && EVENT_STEP_MONTHS[series.frequency] != null;
}

function relevantMovements(
  transactions: ExpenseDraft[],
  financialAccountIds: string[],
) {
  const accountIds = new Set(financialAccountIds);
  return transactions.filter((transaction) =>
    !transaction.internalTransfer
    && (!transaction.bankStatus || transaction.bankStatus === 'booked')
    && transaction.financialAccountId
    && accountIds.has(transaction.financialAccountId)
    && transaction.occurredAt
    && !Number.isNaN(new Date(transaction.occurredAt).getTime()));
}

// Risparmio mensile medio sugli ultimi mesi completi, escludendo i movimenti
// che la previsione conta già come eventi. Il primo mese con movimenti è
// scartato perché probabilmente parziale.
export function computeSavingsBaseline({
  transactions,
  financialAccountIds,
  recurringPayments,
  now = new Date(),
  months = FORECAST_HISTORY_MONTHS,
}: {
  transactions: ExpenseDraft[];
  financialAccountIds: string[];
  recurringPayments: RecurringSeries[];
  now?: Date;
  months?: number;
}): SavingsBaseline | null {
  const eventSeriesIds = new Set(
    recurringPayments.filter(isEventSeries).map((series) => series.id),
  );
  const movements = relevantMovements(transactions, financialAccountIds);
  if (!movements.length) return null;
  const currentMonth = monthIndex(now);
  const firstMonth = Math.min(
    ...movements.map((transaction) => monthIndex(new Date(transaction.occurredAt!))),
  );
  const fromMonth = Math.max(firstMonth + 1, currentMonth - months);
  const totals = new Map<number, number>();
  for (let month = fromMonth; month < currentMonth; month += 1) totals.set(month, 0);
  if (totals.size < FORECAST_MIN_MONTHS) return null;

  for (const transaction of movements) {
    if (transaction.incomeType === 'extra_salary') continue;
    if (transaction.recurringPaymentId && eventSeriesIds.has(transaction.recurringPaymentId)) continue;
    const month = monthIndex(new Date(transaction.occurredAt!));
    if (!totals.has(month)) continue;
    totals.set(month, totals.get(month)! + signedAmount(transaction));
  }

  const values = [...totals.values()];
  const monthly = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - monthly) ** 2, 0)
    / Math.max(1, values.length - 1);
  return { monthly, sigma: Math.sqrt(variance), months: values.length };
}

// Eventi previsti nei prossimi `horizon` mesi: pagamenti ricorrenti
// trimestrali/semestrali/annuali attivi e mensilità aggiuntive incassate
// negli ultimi 12 mesi (ripetute nello stesso mese).
export function buildForecastEvents({
  recurringPayments,
  transactions,
  financialAccountIds,
  horizon,
  now = new Date(),
}: {
  recurringPayments: RecurringSeries[];
  transactions: ExpenseDraft[];
  financialAccountIds: string[];
  horizon: number;
  now?: Date;
}): ForecastEvent[] {
  const currentMonth = monthIndex(now);
  const events: ForecastEvent[] = [];

  for (const series of recurringPayments) {
    if (!isEventSeries(series)) continue;
    const step = EVENT_STEP_MONTHS[series.frequency]!;
    const due = new Date(`${series.nextDueOn.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(due.getTime())) continue;
    let offset = monthIndex(due) - currentMonth;
    // Una scadenza di questo mese è già riflessa (o quasi) nel saldo di oggi.
    while (offset < 1) offset += step;
    const offsets: number[] = [];
    for (; offset <= horizon; offset += step) offsets.push(offset);
    events.push({
      id: `recurring:${series.id}`,
      name: series.name,
      icon: series.direction === 'income' ? 'redeem' : 'event_repeat',
      amount: series.direction === 'income' ? series.amount : -series.amount,
      offsets,
      cadence: { quarterly: 'ogni 3 mesi', semiannual: 'ogni 6 mesi', annual: 'ogni anno' }[
        series.frequency as 'quarterly' | 'semiannual' | 'annual'
      ],
    });
  }

  const extraByMonth = new Map<number, { amount: number; name: string }>();
  for (const transaction of relevantMovements(transactions, financialAccountIds)) {
    if (transaction.incomeType !== 'extra_salary' || transaction.kind !== 'income') continue;
    const date = new Date(transaction.occurredAt!);
    const age = currentMonth - monthIndex(date);
    if (age < 1 || age > 12) continue;
    const month = date.getMonth();
    const current = extraByMonth.get(month);
    extraByMonth.set(month, {
      amount: (current?.amount ?? 0) + transaction.amount,
      name: current?.name ?? (month === 11 ? 'Tredicesima' : month >= 5 && month <= 6 ? 'Quattordicesima' : 'Mensilità aggiuntiva'),
    });
  }
  for (const [month, extra] of extraByMonth) {
    let offset = (month - now.getMonth() + 12) % 12 || 12;
    const offsets: number[] = [];
    for (; offset <= horizon; offset += 12) offsets.push(offset);
    events.push({
      id: `extra:${month}`,
      name: extra.name,
      icon: 'redeem',
      amount: extra.amount,
      offsets,
      cadence: 'ogni anno',
    });
  }

  return events
    .filter((event) => event.offsets.length)
    .sort((a, b) => a.offsets[0] - b.offsets[0]);
}

export function projectNetWorth({
  netWorth,
  monthlySaving,
  events,
  enabledEventIds,
  months,
}: {
  netWorth: number;
  monthlySaving: number;
  events: ForecastEvent[];
  enabledEventIds: ReadonlySet<string>;
  months: number;
}) {
  const eventsByOffset = new Map<number, number>();
  for (const event of events) {
    if (!enabledEventIds.has(event.id)) continue;
    for (const offset of event.offsets) {
      eventsByOffset.set(offset, (eventsByOffset.get(offset) ?? 0) + event.amount);
    }
  }
  const values = [netWorth];
  let value = netWorth;
  for (let month = 1; month <= months; month += 1) {
    value += monthlySaving + (eventsByOffset.get(month) ?? 0);
    values.push(value);
  }
  return values;
}

export function forecastBand(median: number[], sigma: number) {
  const halfWidth = median.map((_, month) => BAND_Z * sigma * Math.sqrt(month));
  return {
    low: median.map((value, month) => value - halfWidth[month]),
    high: median.map((value, month) => value + halfWidth[month]),
  };
}

const MILESTONES = [
  1_000, 2_500, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000,
  75_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000, 500_000,
  750_000, 1_000_000,
];

// Prossimo traguardo "tondo" sopra il patrimonio attuale.
export function nextNetWorthMilestone(netWorth: number) {
  const milestone = MILESTONES.find((value) => value > netWorth);
  if (milestone) return milestone;
  return (Math.floor(netWorth / 1_000_000) + 1) * 1_000_000;
}

// Primo mese (da oggi) in cui la proiezione raggiunge `target`, entro 20 anni.
export function monthsToReach(
  target: number,
  options: Omit<Parameters<typeof projectNetWorth>[0], 'months'>,
) {
  const values = projectNetWorth({ ...options, months: 240 });
  const index = values.findIndex((value) => value >= target);
  return index < 0 ? null : index;
}
