import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdminRedesignEnabled } from '../src/feature-flags.js';

// Mirrors apps/portal-web/test/feature-flags.test.js's coverage for
// isLandlordRedesignEnabled (Copilot PR #134 review, finding #1): the
// redesign flag must be unreachable in a production build/mode by
// construction, even if VITE_REDESIGN_ENABLED is somehow set to the
// literal string 'true' (e.g. a misconfigured env file leaking into a
// prod deploy). Gate on Vite's own DEV/MODE signals in addition to the
// literal flag value, so a production build can never enable the route
// regardless of the env var.
describe('isAdminRedesignEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false in a simulated production mode even when the env var is "true"', () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', true);

    expect(isAdminRedesignEnabled()).toBe(false);
  });

  it('is true in development mode when the env var is "true"', () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);

    expect(isAdminRedesignEnabled()).toBe(true);
  });

  it('is true in preview mode when the env var is "true"', () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', 'true');
    vi.stubEnv('MODE', 'preview');
    vi.stubEnv('DEV', false);
    vi.stubEnv('PROD', false);

    expect(isAdminRedesignEnabled()).toBe(true);
  });

  it('is false in development mode when the env var is unset', () => {
    vi.stubEnv('VITE_REDESIGN_ENABLED', undefined);
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('DEV', true);
    vi.stubEnv('PROD', false);

    expect(isAdminRedesignEnabled()).toBe(false);
  });
});
