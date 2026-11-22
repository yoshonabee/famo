import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface AccessBindings {
  ACCESS_HOST?: string
  ACCESS_ISSUER?: string
  ACCESS_AUDIENCE?: string
  ACCESS_SYNC_AUDIENCE?: string
  ACCESS_EMAIL?: string
  ACCESS_SERVICE_CLIENT_ID?: string
  ACCESS_ACCOUNT_ID?: string
  LOCAL_SYNC_TOKEN?: string
}

interface Identity {
  accountID: string
  service: boolean
}

let keys:
  { issuer: string; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined

export async function authorize(
  request: Request,
  env: AccessBindings,
  api: boolean,
): Promise<Identity | null> {
  const url = new URL(request.url)
  if (
    !env.ACCESS_HOST &&
    !env.ACCESS_ISSUER &&
    !env.ACCESS_AUDIENCE &&
    !env.ACCESS_SYNC_AUDIENCE &&
    !env.ACCESS_EMAIL &&
    !env.ACCESS_SERVICE_CLIENT_ID &&
    !env.ACCESS_ACCOUNT_ID &&
    env.LOCAL_SYNC_TOKEN
  ) {
    if (!['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) return null
    const auth = request.headers.get('Authorization')
    if (api && auth !== null) {
      return auth === `Bearer ${env.LOCAL_SYNC_TOKEN}`
        ? { accountID: 'personal', service: true }
        : null
    }
    if (api && request.headers.get('Sec-Fetch-Site') !== 'same-origin')
      return null
    return { accountID: 'personal', service: false }
  }

  const {
    ACCESS_ISSUER: issuer,
    ACCESS_AUDIENCE: audience,
    ACCESS_SYNC_AUDIENCE: apiAudience,
    ACCESS_EMAIL: email,
    ACCESS_SERVICE_CLIENT_ID: clientID,
    ACCESS_ACCOUNT_ID: accountID,
  } = env
  if (
    url.protocol !== 'https:' ||
    url.hostname !== env.ACCESS_HOST ||
    !issuer ||
    !/^https:\/\/[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(issuer) ||
    !audience ||
    !email ||
    !accountID ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(accountID)
  )
    return null

  const assertion = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!assertion) return null

  try {
    if (keys?.issuer !== issuer) {
      keys = {
        issuer,
        jwks: createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer)),
      }
    }
    const { payload } = await jwtVerify(assertion, keys.jwks, {
      issuer,
      audience: api && apiAudience ? [audience, apiAudience] : audience,
      algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat'],
    })
    if (payload.type !== 'app') return null
    if (payload.common_name !== undefined) {
      if (
        !api ||
        !clientID ||
        payload.common_name !== clientID ||
        (apiAudience && !hasAudience(payload.aud, apiAudience))
      )
        return null
      return { accountID, service: true }
    }
    if (
      typeof payload.email === 'string' &&
      payload.email.toLowerCase() === email.toLowerCase()
    ) {
      return { accountID, service: false }
    }
  } catch {
    // Requests with an invalid assertion or unavailable signing keys fail closed.
  }
  return null
}

function hasAudience(
  actual: string | string[] | undefined,
  expected: string,
): boolean {
  return Array.isArray(actual) ? actual.includes(expected) : actual === expected
}
