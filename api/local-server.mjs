import http from 'node:http'

import coachHandler from './coach.js'
import ebAuthHandler from './eb/auth.js'
import ebAutoSyncHandler from './eb/auto-sync.js'
import ebBanksHandler from './eb/banks.js'
import ebCallbackHandler from './eb/callback.js'
import ebConnectionsHandler from './eb/connections.js'
import ebSyncHandler from './eb/sync.js'

const port = Number(process.env.API_PORT || 3000)
const handlers = new Map([
  ['/api/coach', coachHandler],
  ['/api/eb/auth', ebAuthHandler],
  ['/api/eb/auto-sync', ebAutoSyncHandler],
  ['/api/eb/banks', ebBanksHandler],
  ['/api/eb/callback', ebCallbackHandler],
  ['/api/eb/connections', ebConnectionsHandler],
  ['/api/eb/sync', ebSyncHandler],
])

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      if (!body) return resolve({})
      try {
        resolve(JSON.parse(body))
      } catch {
        reject(new Error('JSON non valido'))
      }
    })
    request.on('error', reject)
  })
}

const server = http.createServer(async (request, response) => {
  // Match the small Express/Vercel response surface used by api/coach.js.
  response.status = (statusCode) => {
    response.statusCode = statusCode
    return response
  }
  response.json = (payload) => {
    if (!response.headersSent) {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    response.end(JSON.stringify(payload))
    return response
  }
  response.send = (payload) => {
    response.end(payload)
    return response
  }

  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const handler = handlers.get(requestUrl.pathname)
  if (!handler) {
    response.statusCode = 404
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ error: 'Endpoint non trovato' }))
    return
  }

  request.query = Object.fromEntries(requestUrl.searchParams.entries())

  try {
    request.body = ['POST', 'PUT', 'PATCH'].includes(request.method || '')
      ? await readJsonBody(request)
      : {}
  } catch {
    response.statusCode = 400
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ error: 'Corpo della richiesta non valido' }))
    return
  }

  try {
    await handler(request, response)
  } catch (error) {
    console.error('Flownd local API server failed', error)
    if (!response.writableEnded) {
      response.status(500).json({
        error: 'Il servizio non è disponibile in questo momento. Riprova tra poco.',
      })
    }
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Flownd API disponibile su http://0.0.0.0:${port}`)
})
