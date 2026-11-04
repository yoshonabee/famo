import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const db = join(tmpdir(), `famo-e2e-${process.pid}.db`)
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:8788', trace: 'retain-on-failure' },
  webServer: {
    command: `go run ./cmd/famo -addr 127.0.0.1:8788 -db "${db}"`,
    cwd: '..',
    url: 'http://127.0.0.1:8788/api/health',
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
