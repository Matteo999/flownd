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

function describe(transaction) {
  const direction = indicator(transaction)
  const lines = remittanceLines(transaction)
  const fullRemittance = clean(lines.join(' '))
  const counterparty = clean(
    direction === 'debit'
      ? transaction.creditor?.name
      : transaction.debtor?.name,
  )
  const merchant = clean(
    transaction.merchant?.name
      || transaction.merchant_name
      || transaction.card_acceptor?.name,
  )
  const conciseRemittance = lines
    .filter((line) => {
      const compact = clean(line)
      const digits = (compact.match(/\d/g) || []).length
      return compact.length >= 3 && digits / compact.length < 0.15
    })
    .sort((first, second) => first.length - second.length)[0] || clean(lines[0])
  const ultimateParty = clean(
    direction === 'debit'
      ? transaction.ultimate_creditor?.name
      : transaction.ultimate_debtor?.name,
  )
  const bankDescription = clean(transaction.bank_transaction_code?.description)

  const description =
    merchant
    || counterparty
    || ultimateParty
    || conciseRemittance
    || bankDescription
    || 'Bank transaction'

  return {
    description: description.slice(0, 180),
    counterparty: (merchant || counterparty || ultimateParty || null),
    merchantName: merchant || null,
    counterpartyName: counterparty || ultimateParty || null,
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
    if (/rimborso|storno|refund/.test(text)) return 'Rimborso spese'
    if (/tredicesima|13ma|13esima/.test(text)) return 'Tredicesima'
    return /stipend|salary|emolument|retribuzion/.test(text)
      ? 'Stipendio'
      : 'Altra entrata'
  }
  if (/preliev|atm|cash withdrawal/.test(text)) return 'ATM (prelievo contante)'
  if (/supermerc|alimentar|grocery|interspar|poli\b|orvea|coop\b|esselunga|conad|lidl|carrefour|eurospin/.test(text)) return 'Cibo e Spesa'
  if (/bar\b|ristor|mcdonald|burger king|sushi|pizzeria|caffe|caffè|deliveroo|glovo|just eat/.test(text)) return 'Bar e ristoranti'
  if (/farmac|medical|sanitar|dentist/.test(text)) return 'Cure sanitarie e Farmacia'
  if (/f24|impost|tass|multa|pagopa/.test(text)) return 'Tasse e Multe'
  if (/benzina|carbur|distributore|\bq8\b|\beni\b|tamoil|esso|trasport|autostr|telepass|parchegg|taxi|trenitalia|italo|officina|gommista/.test(text)) return 'Trasporti e Auto'
  if (/netflix|spotify|disney|prime video|abbonament|subscription|iscrizione|donazione|patreon/.test(text)) return 'Sottoscrizioni e donazioni'
  if (/eurobrico|leroy merlin|ikea|brico|utenza|energia|elettric|gas\b|acqua\b|affitto|condominio/.test(text)) return 'Casa e utenze'
  if (/mediaworld|unieuro|euronics|apple store|elettronica|computer|smartphone/.test(text)) return 'Multimedia e Elettronica'
  if (/universit|scuola|formazione|udemy|coursera|libreria/.test(text)) return 'Educazione'
  if (/cinema|teatro|concerto|museo|palestra|ticketone|steam|playstation|xbox/.test(text)) return 'Tempo libero e intrattenimento'
  if (/kiko|amazon|zara|zalando|h&m|abbigliamento|scarpe|shopping|negozio|decathlon/.test(text)) return 'Shopping'
  if (/viaggio|hotel|albergo|booking|airbnb|aereo|ryanair|easyjet|aeroporto/.test(text)) return 'Viaggi e Vacanze'
  if (/commission|canone|fees?\b/.test(text)) return 'Assicurazioni e Finanza'
  return 'Altro'
}

export function normalizeAccount(account, aspspName) {
  const iban = clean(account.account_id?.iban)
  const last4 = iban ? iban.replace(/\s/g, '').slice(-4) : null
  const product = clean(account.product)
  const details = clean(account.details)
  const providerStatus = clean(account.psu_status).toLowerCase() || null
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
    providerStatus,
    active:
      !providerStatus
      || ['enabled', 'active', 'available'].includes(providerStatus),
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
    rawDescription: described.remittance || described.description,
    merchantName: described.merchantName,
    counterpartyName: described.counterpartyName,
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
  const tokens = (value) =>
    new Set(normalized(value).split(' ').filter((token) => token.length > 2))
  const a = tokens(first)
  const b = tokens(second)
  if (!a.size || !b.size) return 0
  const overlap = [...a].filter((token) => b.has(token)).length
  return overlap / Math.min(a.size, b.size)
}
