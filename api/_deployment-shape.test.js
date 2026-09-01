import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = new URL('../', import.meta.url)

async function filesBelow(relativeDirectory) {
  const directory = new URL(`${relativeDirectory}/`, root)
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = `${relativeDirectory}/${entry.name}`
    return entry.isDirectory() ? filesBelow(relative) : [relative]
  }))
  return nested.flat()
}

async function publicFunctions() {
  const files = (await filesBelow('api')).filter((file) => {
    const name = path.basename(file)
    return name.endsWith('.js') && !name.startsWith('_') && !name.endsWith('.test.js')
  })
  const handlers = []
  for (const file of files) {
    const source = await readFile(new URL(file, root), 'utf8')
    if (source.includes('export default')) handlers.push(file)
  }
  return handlers.sort()
}

test('la forma del deploy rispetta il profilo Vercel dichiarato', async () => {
  const profile = JSON.parse(await readFile(new URL('deployment-profile.json', root), 'utf8'))
  const vercel = JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'))
  const handlers = await publicFunctions()
  const transactionTools = await readFile(new URL('api/transaction-tools.js', root), 'utf8')
  const autoSync = await readFile(new URL('api/eb/auto-sync.js', root), 'utf8')
  const consolidationMarker = 'HOBBY_CONSOLIDATION(pro-split:recurring-payments)'

  if (profile.vercelPlan === 'hobby') {
    assert.ok(handlers.length <= profile.limits.serverlessFunctions,
      `${handlers.length} funzioni pubbliche superano il limite Hobby: ${handlers.join(', ')}`)
    assert.ok((vercel.crons || []).length <= profile.limits.cronJobs,
      `${vercel.crons?.length || 0} cron superano il limite Hobby`)
    assert.ok(transactionTools.includes(consolidationMarker))
    assert.ok(autoSync.includes(consolidationMarker))
    assert.deepEqual(profile.pendingProSplits, ['recurring-payments'])
    return
  }

  assert.equal(profile.vercelPlan, 'pro')
  assert.deepEqual(profile.pendingProSplits, [])
  assert.ok(handlers.includes('api/recurring-payments.js'))
  assert.ok((vercel.crons || []).some((cron) => cron.path === '/api/recurring-payments'))
  assert.ok(!transactionTools.includes(consolidationMarker))
  assert.ok(!autoSync.includes(consolidationMarker))
})
