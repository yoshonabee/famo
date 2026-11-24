import { readFileSync, writeFileSync } from 'node:fs'

const required = {
  FAMO_D1_DATABASE_ID: /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i,
  FAMO_SYNC_HOST: /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,}$/i,
  FAMO_ACCESS_ISSUER: /^https:\/\/[a-z\d-]+\.cloudflareaccess\.com$/,
  FAMO_ACCESS_AUDIENCE: /^[a-f\d]{64}$/i,
  FAMO_ACCESS_EMAIL: /^[^\s@,*]+@[^\s@,*]+\.[^\s@,*]+$/,
  FAMO_ACCESS_SERVICE_CLIENT_ID: /^[a-f\d]+\.access$/i,
  FAMO_ACCESS_ACCOUNT_ID: /^[a-zA-Z\d][a-zA-Z\d_-]{0,63}$/,
}

const minimumWebProtocol = process.env.FAMO_MIN_WEB_PROTOCOL ?? '0'
if (
  !/^\d+$/.test(minimumWebProtocol) ||
  !Number.isSafeInteger(Number(minimumWebProtocol))
) {
  console.error('FAMO_MIN_WEB_PROTOCOL must be a nonnegative safe integer')
  process.exit(1)
}

const invalid = Object.entries(required).filter(
  ([name, pattern]) => !pattern.test(process.env[name] ?? ''),
)
if (
  invalid.length ||
  process.env.FAMO_SYNC_HOST?.toLowerCase().endsWith('.workers.dev')
) {
  for (const [name] of invalid) console.error(`Missing or invalid ${name}`)
  if (process.env.FAMO_SYNC_HOST?.toLowerCase().endsWith('.workers.dev')) {
    console.error('FAMO_SYNC_HOST must be a custom domain')
  }
  process.exit(1)
}

const config = JSON.parse(
  readFileSync(new URL('wrangler.example.jsonc', import.meta.url), 'utf8'),
)
const host = process.env.FAMO_SYNC_HOST.toLowerCase()
config.routes[0].pattern = host
config.d1_databases[0].database_id = process.env.FAMO_D1_DATABASE_ID
if (process.env.FAMO_D1_DATABASE_NAME) {
  config.d1_databases[0].database_name = process.env.FAMO_D1_DATABASE_NAME
}
config.vars = {
  MIN_WEB_PROTOCOL: minimumWebProtocol,
  ACCESS_HOST: host,
  ACCESS_ISSUER: process.env.FAMO_ACCESS_ISSUER,
  ACCESS_AUDIENCE: process.env.FAMO_ACCESS_AUDIENCE,
  ACCESS_EMAIL: process.env.FAMO_ACCESS_EMAIL,
  ACCESS_SERVICE_CLIENT_ID: process.env.FAMO_ACCESS_SERVICE_CLIENT_ID,
  ACCESS_ACCOUNT_ID: process.env.FAMO_ACCESS_ACCOUNT_ID,
}
try {
  writeFileSync(
    new URL('wrangler.local.jsonc', import.meta.url),
    JSON.stringify(config, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.error(
    'wrangler.local.jsonc already exists. Move it before generating a new file.',
  )
  process.exit(1)
}
