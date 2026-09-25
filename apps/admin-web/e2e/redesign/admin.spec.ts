// @ts-check
import { expect, test } from '@playwright/test';

const FLAG_OFF_URL = 'http://127.0.0.1:3013';
const FLAG_ON_URL = 'http://127.0.0.1:3014';
const PREVIEW_PATH = '/admin-redesign-preview.html';

// Playwright visual/E2E verification for the flag-gated Admin redesign
// (docs/product/ADMIN_REDESIGN_SPEC.md), mirroring
// apps/portal-web/e2e/redesign/tenant.spec.ts's coverage/pattern for its
// own phase, adapted for Admin's real-auth-only entry point (no
// `?role=`-style dev bypass exists or should exist here — spec §8e(i)).
//
// Two things are verified, on the SAME two dev servers Playwright starts
// (playwright.config.js), one flag-off (3013) one flag-on (3014):
//   1. The real, unauthenticated production entry point (`/`) renders the
//      exact same LoginGate regardless of the flag's value — the
//      redesign never changes anything for a signed-out session, and the
//      Admin redesign chunk is never requested unless BOTH the flag is on
//      AND the session is signed-in (mount-point coverage already at
//      test/redesign/admin-redesign-mount.test.jsx; this is the
//      real-browser-network confirmation of the same claim).
//   2. The dev-only fixture preview (`/admin-redesign-preview.html`,
//      __fixtures__/AdminPreview.jsx) — which stands in for an
//      authenticated, flag-on session using fixture `onboardingApi`/
//      `mediaReviewApi` data, since a real Entra sign-in is not available
//      in this harness — renders the redesigned shell with the expected
//      brand chrome and both real sections' populated content.
test.describe('Admin redesign (flag-gated)', () => {
  test('flag off: the existing (non-redesign) admin console entry point is unaffected', async ({ page }) => {
    await page.goto(FLAG_OFF_URL + '/');
    await expect(page.getByRole('heading', { name: 'Landlord onboarding review' })).toBeVisible();
    await expect(page.locator('.kf-admin-redesign')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-off-login-gate.png', fullPage: true });
  });

  test('flag on, unauthenticated: the real entry point still shows the unmodified LoginGate (redesign never reachable while signed out)', async ({ page }) => {
    await page.goto(FLAG_ON_URL + '/');
    await expect(page.getByRole('heading', { name: 'Landlord onboarding review' })).toBeVisible();
    await expect(page.locator('.kf-admin-redesign')).toHaveCount(0);
  });

  test('flag on, fixture-authenticated preview: the redesigned onboarding queue renders the brand shell with real computed status badges', async ({ page }) => {
    await page.goto(FLAG_ON_URL + PREVIEW_PATH);
    const shell = page.locator('.kf-admin-redesign');
    await expect(shell).toHaveCount(1);
    await expect(page.getByText('Riverside Homes')).toBeVisible();
    await expect(page.getByText('Northgate Property Group')).toBeVisible();
    await expect(page.getByText('Sam T. Rentals')).toBeVisible();
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-admin-onboarding-queue.png', fullPage: true });
  });

  test('flag on, fixture-authenticated preview: switching to the media-review section renders its own pending-only queue', async ({ page }) => {
    await page.goto(FLAG_ON_URL + PREVIEW_PATH);
    await page.getByRole('button', { name: /media review/i }).click();
    await expect(page.getByText('Riverside apartment — Unit 2A')).toBeVisible();
    await expect(page.getByText('Northgate Commons — Unit 5')).toBeVisible();
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-admin-media-review-queue.png', fullPage: true });
  });

  // Copilot-review-style regression guard mirroring
  // landlord.spec.ts/manager.spec.ts/tenant.spec.ts's kicker-contrast
  // coverage.
  test('flag on, fixture-authenticated preview: kicker eyebrow labels compute to the same shared WCAG-AA text color', async ({ page }) => {
    await page.goto(FLAG_ON_URL + PREVIEW_PATH);
    const kicker = page.locator('.kf-kicker').first();
    await expect(kicker).toBeVisible();
    const color = await kicker.evaluate((el) => window.getComputedStyle(el).color);
    expect(color).toBe('rgb(36, 22, 46)');
  });
});
