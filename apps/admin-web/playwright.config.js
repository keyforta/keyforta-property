import { defineConfig, devices } from '@playwright/test';

// New, isolated Playwright config for the flag-gated Admin redesign
// (docs/product/ADMIN_REDESIGN_SPEC.md). Deliberately NOT wired into
// `pnpm verify`'s required CI chain yet — mirrors
// apps/portal-web/playwright.config.js's own note for the identical
// reason: run via the separate `pnpm test:e2e` script only.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3013',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Flag-off server: the existing (unmodified) admin console must be
      // the only thing reachable at `/` here.
      command: 'npx vite --host 127.0.0.1 --port 3013',
      url: 'http://127.0.0.1:3013',
      reuseExistingServer: !process.env.CI,
      env: { VITE_REDESIGN_ENABLED: 'false' },
    },
    {
      // Flag-on server: `/` still shows the unauthenticated LoginGate
      // (Admin has no dev auth bypass), but the dev-only fixture preview
      // at /admin-redesign-preview.html mounts the redesigned shell
      // directly with fixture data, on the same server, since the
      // redesign chunk itself is only requested when the flag is on.
      command: 'npx vite --host 127.0.0.1 --port 3014',
      url: 'http://127.0.0.1:3014',
      reuseExistingServer: !process.env.CI,
      env: { VITE_REDESIGN_ENABLED: 'true' },
    },
  ],
});
