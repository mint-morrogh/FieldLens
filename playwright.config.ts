import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the production build (`vite preview`) with the API in
 * mock mode, so no live keys or real camera are needed.
 * Set PLAYWRIGHT_CHANNEL=chrome to use an installed Google Chrome instead of
 * Playwright's bundled Chromium (e.g. on macOS versions Playwright no longer supports).
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: `npm run build && vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { USE_MOCK_API: 'true' },
  },
});
