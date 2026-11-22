import { defineConfig, devices } from '@playwright/test'

const address = 'http://127.0.0.1:8796'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/sync-*.spec.ts',
  use: {
    ...devices['Pixel 7'],
    baseURL: address,
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'vite preview --mode sync --host 127.0.0.1 --port 8796 --strictPort',
    url: address,
    reuseExistingServer: false,
  },
})
