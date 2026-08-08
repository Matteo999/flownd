import { createHash } from 'crypto'

const BALANCE_PRIORITY = {
  ITAV: 100,
  CLAV: 95,
  ITBD: 90,
  CLBD: 85,
  XPCD: 70,
  OTHR: 10,
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalized(value) {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function remittanceLines(transaction) {
  const value = transaction.remittance_information
  if (Array.isArray(value)) return value.map(clean).filter(Boolean)
  return clean(value) ? [clean(value)] : []
}

function indicator(transaction) {
  const value = clean(transaction.credit_debit_indicator).toUpperCase()
  return value.includes('CRDT') || value.includes('CREDIT') ? 'credit' : 'debit'
}

function extractMerchant(text) {
  const patterns = [
    /\bpresso\s+(.+?)(?=\s+(?:tessera|causale|data|via\b|[-–]\s*transazione)|$)/i,
    /\beserc\.?\s+(.+?)(?=\s+(?:tessera|causale|data)|$)/i,
    /\bc\/o\s+(.+?)(?=\s+(?:tessera|causale|data)|$)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return clean(match[1])
  }
  return null
}

function extractLabeledValue(text, label) {
  const match = text.match(new RegExp(`\\b${label}\\s*:\\s*(.+?)(?=\\s+(?:Causale|Data|Cod\\.|Banca|Cro|Note|Id\\.)\\b|$)`, 'i'))
  return match?.[1] ? clean(match[1]) : null
}

function genericBankDescription(value) {
  return /^(pmnt|pagamento carta|bonifico|storno scrittura)$/i.test(clean(value))
}

function describe(transaction) {
  const direction = indicator(transaction)
  const lines = remittanceLines(transaction)
  const fullRemittance = clean(lines.join(' '))
  const counterparty = clean(
    direction === 'debit'
      ? transaction.creditor?.name
      : transaction.debtor?.name,
  )
  const merchant = extractMerchant(fullRemittance)
  const labeledCounterparty =
    extractLabeledValue(fullRemittance, 'Ordinante')
    || extractLabeledValue(fullRemittance, 'Beneficiario')
  const bankDescription = clean(transaction.bank_transaction_code?.description)
  const genericTransfer = /bonifico a (?:vostro|vs) favore/i.test(lines[0] || '')
  const secondLine = genericTransfer ? clean(lines[1]) : ''

  const description =
    counterparty
    || merchant
    || secondLine
    || labeledCounterparty
    || (!genericBankDescription(bankDescription) ? bankDescription : '')
    || clean(lines[0])
    || bankDescription
    || 'Transazione bancaria'

  return {
    description: description.slice(0, 180),
    counterparty: (counterparty || merchant || secondLine || labeledCounterparty || null),
    remittance: fullRemittance,
  }
}

function status(value) {
  const code = clean(value).toUpperCase()
  if (code === 'BOOK') return 'booked'
  if (code === 'PDNG' || code === 'HOLD' || code === 'SCHD') return 'pending'
  if (code === 'CNCL') return 'cancelled'
  if (code === 'RJCT') return 'rejected'
  return 'other'
}

function categoryFor({ description, remittance, direction, bankCode, bankSubCode }) {
  const text = normalized(`${description} ${remittance} ${bankCode} ${bankSubCode}`)
  if (direction === 'credit') {
    return /stipend|salary|emolument|retribuzion/.test(text) ? 'Stipendio' : 'Entrata'
  }
  if (/preliev|atm|cash withdrawal/.test(text)) return 'ATM (prelievo contante)'
  if (/supermerc|alimentar|grocery|interspar|poli\b/.test(text)) return 'Cibo e Spesa'
  if (/bar\b|ristor|mcdonald|sushi|pizzeria|caffe|caffè/.test(text)) return 'Bar e ristoranti'
  if (/farmac|medical|sanitar|dentist/.test(text)) return 'Cure sanitarie e Farmacia'
  if (/f24|impost|tass|multa|pagopa/.test(text)) return 'Tasse e Multe'
  if (/benzina|carbur|trasport|autostr|parchegg|taxi|trenitalia/.test(text)) return 'Trasporti e Auto'
  if (/netflix|spotify|abbonament|subscription|iscrizione/.test(text)) return 'Sottoscrizioni e donazioni'
  if (/eurobrico|utenza|energia|elettric|gas\b|acqua\b|affitto/.test(text)) return 'Casa e utenze'
  if (/kiko|amazon|shopping|negozio/.test(text)) return 'Shopping'
  if (/viaggio|hotel|booking|airbnb|aereo/.test(text)) return 'Viaggi e Vacanze'
  if (/commission|canone|fees?\b/.test(text)) return 'Assicurazioni e Finanza'
  return 'Altro'
}

export function normalizeAccount(account, aspspName) {
  const iban = clean(account.account_id?.iban)
  const last4 = iban ? iban.replace(/\s/g, '').slice(-4) : null
  const product = clean(account.product)
  const details = clean(account.details)
  const displayName =
    details
    || product
    || `${clean(aspspName) || 'Conto'}${last4 ? ` •${last4}` : ''}`
  return {
    providerAccountUid: account.uid,
    identificationHash: account.identification_hash,
    ibanLast4: last4,
    name: displayName,
    currency: clean(account.currency) || 'EUR',
    accountType: clean(account.cash_account_type) || null,
    product: product || null,
  }
}

export function chooseBalance(payload) {
  const choices = (payload?.balances || [])
    .map((balance, index) => ({
      raw: balance,
      index,
      priority: BALANCE_PRIORITY[balance.balance_type] || 0,
      amount: Number(balance.balance_amount?.amount),
    }))
    .filter((item) => Number.isFinite(item.amount))
    .sort((first, second) =>
      second.priority - first.priority || first.index - second.index,
    )
  const selected = choices[0]
  return selected
    ? {
        amount: selected.amount,
        currency: clean(selected.raw.balance_amount?.currency) || 'EUR',
        type: clean(selected.raw.balance_type) || null,
        referenceDate:
          selected.raw.reference_date || selected.raw.last_change_date_time || null,
      }
    : null
}

export function normalizeBankTransaction(transaction, accountIdentity) {
  const direction = indicator(transaction)
  const amount = Math.abs(Number(transaction.transaction_amount?.amount) || 0)
  const currency = clean(transaction.transaction_amount?.currency) || 'EUR'
  const bookingDate = transaction.booking_date || null
  const valueDate = transaction.value_date || null
  const transactionDate = transaction.transaction_date || null
  // Nei payload italiani ING e CR la value_date è la data più vicina
  // all’operazione reale; booking_date rimane disponibile separatamente.
  const occurredOn = valueDate || transactionDate || bookingDate
  const described = describe(transaction)
  const bankCode = clean(transaction.bank_transaction_code?.code) || null
  const bankSubCode = clean(transaction.bank_transaction_code?.sub_code) || null
  const entryReference = clean(transaction.entry_reference) || null
  const providerTransactionId = clean(transaction.transaction_id) || null
  const transferHint = /trasferiment|giroconto|bonifico|da conto .* a /i.test(
    `${described.description} ${described.remittance}`,
  ) || ['ICDT', 'RCDT'].includes(bankCode)
  const refundHint = /storno|rimborso|refund/i.test(
    `${described.description} ${described.remittance}`,
  )
  const identityParts = [
    accountIdentity,
    direction,
    amount.toFixed(2),
    currency,
    occurredOn,
    normalized(described.remittance || described.description),
  ]
  const contentFingerprint = sha256(identityParts.join('|'))
  const stableKey = entryReference
    ? `entry:${entryReference}`
    : `fingerprint:${contentFingerprint}`
  const normalizedStatus = status(transaction.status)

  return {
    stableKey,
    contentFingerprint,
    entryReference,
    providerTransactionId,
    status: normalizedStatus,
    direction,
    kind: direction === 'credit' ? 'income' : 'expense',
    amount,
    currency,
    bookingDate,
    valueDate,
    transactionDate,
    occurredOn,
    description: described.description,
    counterparty: described.counterparty,
    category: categoryFor({
      description: described.description,
      remittance: described.remittance,
      direction,
      bankCode,
      bankSubCode,
    }),
    bankCode,
    bankSubCode,
    merchantCategoryCode: clean(transaction.merchant_category_code) || null,
    transferHint,
    refundHint,
  }
}

export function redactBankPayload(value) {
  if (Array.isArray(value)) return value.map(redactBankPayload)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key.toLowerCase() === 'iban' && typeof item === 'string') {
        const compact = item.replace(/\s/g, '')
        return [key, compact ? `••••${compact.slice(-4)}` : null]
      }
      return [key, redactBankPayload(item)]
    }),
  )
}

export function descriptionSimilarity(first, second) {
  const ignored = new Set(['del', 'della', 'con', 'presso', 'pagamento', 'transazione'])
  const tokens = (value) =>
    new Set(normalized(value).split(' ').filter((token) => token.length > 2 && !ignored.has(token)))
  const a = tokens(first)
  const b = tokens(second)
  if (!a.size || !b.size) return 0
  const overlap = [...a].filter((token) => b.has(token)).length
  return overlap / Math.min(a.size, b.size)
}
