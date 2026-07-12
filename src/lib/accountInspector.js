function maskText(value, visible = 6) {
  if (!value) return null
  const text = String(value)
  if (text.length <= visible) return text
  return `${text.slice(0, visible)}...${text.slice(-4)}`
}

export function sanitizeAccount(account, index) {
  return {
    index,
    uid: account.uid || null,
    uidPreview: maskText(account.uid),
    name: account.name || null,
    product: account.product || null,
    psuStatus: account.psu_status || null,
    usage: account.usage || null,
    cashAccountType: account.cash_account_type || null,
    currency: account.currency || null,
    hasIban: Boolean(account.account_id?.iban || account.iban),
    ibanPreview: maskText(account.account_id?.iban || account.iban),
    hasOtherAccountId: Boolean(account.account_id?.other),
    allAccountIdsCount: account.all_account_ids?.length || 0,
    identificationHashesCount: account.identification_hashes?.length || 0,
  }
}

export function buildAccountsInspector(accounts = []) {
  return {
    generatedAt: new Date().toISOString(),
    count: accounts.length,
    accounts: accounts.map((account, index) => sanitizeAccount(account, index)),
  }
}

export function getStoredAccountsInspector() {
  return JSON.parse(localStorage.getItem('eb_accounts_inspector') || 'null')
}

export function storeAccountsInspector(accounts) {
  const inspector = buildAccountsInspector(accounts)
  localStorage.setItem('eb_accounts_inspector', JSON.stringify(inspector, null, 2))
  return inspector
}

export function clearAccountsInspector() {
  localStorage.removeItem('eb_accounts_inspector')
}
