import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// Demo credentials live in the gitignored repo-root .env (created by api/scripts/create_demo_users.py).
try {
  // Playwright runs from web/, so the repo-root .env is one level up.
  for (const line of readFileSync(resolve(process.cwd(), '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^((?:DEMO_|VITE_)[A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
} catch {
  /* no .env: e2e tests that need logins will fail with a clear message */
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1, // tests share one dev database and the same demo seats
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
