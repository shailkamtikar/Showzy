import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

// envDir '..' makes Vite read the single repo-root .env (only VITE_* vars reach the browser).
export default defineConfig({
  envDir: '..',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'], // e2e/*.spec.ts belong to Playwright

    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
})
