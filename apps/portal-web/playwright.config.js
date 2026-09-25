import { defineConfig, devices } from '@playwright/test';

// New, isolated Playwright config for the flag-gated landlord redesign
// (docs/product/LANDLORD_REDESIGN_SPEC.md). Deliberately NOT wired into
// `pnpm verify`'s required CI chain yet — see
// docs/engineering/REQUIREMENTS_GAPS.md, "Redesigned per-role UI/UX",
// acceptance criterion (b): run via the separate `pnpm test:e2e` script
// only.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3011',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // Flag-off server: the existing (unmodified) landlord UI must be the
      // only thing reachable here.
      command: 'npx vite --host 127.0.0.1 --port 3011',
      url: 'http://127.0.0.1:3011',
      reuseExistingServer: !process.env.CI,
      env: { VITE_REDESIGN_ENABLED: 'false' },
    },
    {
      // Flag-on server: only the redesigned landlord routes are exercised
      // here, on a separate port, so both control and treatment cases run
      // in the same `pnpm test:e2e` invocation without needing a rebuild
      // between them.
      command: 'npx vite --host 127.0.0.1 --port 3012',
      url: 'http://127.0.0.1:3012',
      reuseExistingServer: !process.env.CI,
      env: { VITE_REDESIGN_ENABLED: 'true' },
    },
  ],
});
