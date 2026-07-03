import { createPrivateKey } from 'crypto'
import { SignJWT, importPKCS8 } from 'jose'

export async function generateJWT() {
  const appId = process.env.ENABLE_BANKING_APP_ID
  const privateKeyPem = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!appId || !privateKeyPem) {
    throw new Error('ENABLE_BANKING_APP_ID e ENABLE_BANKING_PRIVATE_KEY sono obbligatori')
  }

  const privateKey = privateKeyPem.includes('BEGIN RSA PRIVATE KEY')
    ? createPrivateKey(privateKeyPem)
    : await importPKCS8(privateKeyPem, 'RS256')
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({})
    .setProtectedHeader({
      alg: 'RS256',
      typ: 'JWT',
      kid: appId,
    })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey)
}
