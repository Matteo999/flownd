import http from 'node:http'

import coachHandler from './coach.js'

const port = Number(process.env.API_PORT || 3000)

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

  if (request.url !== '/api/coach') {
    response.statusCode = 404
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ error: 'Endpoint non trovato' }))
    return
  }

  try {
    request.body = await readJsonBody(request)
  } catch {
    response.statusCode = 400
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ error: 'Corpo della richiesta non valido' }))
    return
  }

  try {
    await coachHandler(request, response)
  } catch (error) {
    console.error('Flownd Coach local server failed', error)
    if (!response.writableEnded) {
      response.status(500).json({
        error: 'Il Coach non è disponibile in questo momento. Riprova tra poco.',
      })
    }
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Flownd Coach API disponibile su http://0.0.0.0:${port}`)
})
