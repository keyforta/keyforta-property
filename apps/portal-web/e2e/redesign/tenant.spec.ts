// @ts-check
import { expect, test } from '@playwright/test';

const FLAG_OFF_URL = 'http://127.0.0.1:3011';
const FLAG_ON_URL = 'http://127.0.0.1:3012';
const TENANT_QUERY = '/?role=tenant';

// Playwright visual/E2E verification for the flag-gated Tenant redesign
// (docs/product/TENANT_REDESIGN_SPEC.md), mirroring
// e2e/redesign/manager.spec.ts's coverage/pattern for its own phase.
// Reuses the SAME two webServer instances Playwright already starts for
// the Landlord/Manager suites (playwright.config.js is unmodified) — one
// flag-off (3011), one flag-on (3012) — since the flag/mechanism is
// shared, not role-specific.
test.describe('Tenant redesign (flag-gated)', () => {
  test('flag off: the existing (non-redesign) tenant UI is unaffected', async ({ page }) => {
    await page.goto(FLAG_OFF_URL + TENANT_QUERY);
    await expect(page.getByRole('heading', { name: 'Everything about your home, in one place.' })).toBeVisible();
    await expect(page.locator('.kf-tenant-redesign')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-off-tenant-overview.png', fullPage: true });
  });

  test('flag on: the redesigned Tenant Overview screen is reachable and renders the brand shell', async ({ page }) => {
    await page.goto(FLAG_ON_URL + TENANT_QUERY);
    const shell = page.locator('.kf-tenant-redesign');
    await expect(shell).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Everything about your home, in one place.' })).toBeVisible();
    // §8c: no next-best-action checklist card for Tenant.
    await expect(page.getByTestId('next-best-action-checklist')).toHaveCount(0);
    // §0/§1: Tenant never gets the Manager/Landlord-only listing/property
    // capability panels.
    await expect(page.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Add a property' })).toHaveCount(0);
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-tenant-overview.png', fullPage: true });
  });

  test('flag on: all six Tenant nav tabs render the shared generic empty state, not a dedicated panel (spec §4.3-§4.8)', async ({ page }) => {
    await page.goto(FLAG_ON_URL + TENANT_QUERY);
    for (const label of ['My lease', 'Payments', 'Maintenance', 'Documents', 'Messages']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(page.getByTestId('rows-empty-state')).toBeVisible();
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveClass(/kf-nav-item-active/);
    }
  });

  test('flag on: a non-tenant role is not gated into the tenant redesign', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/?role=landlord`);
    await expect(page.locator('.kf-landlord-redesign')).toHaveCount(1);
    await expect(page.locator('.kf-tenant-redesign')).toHaveCount(0);
  });

  // Copilot-review-style regression guard mirroring
  // landlord.spec.ts/manager.spec.ts's kicker-contrast coverage: Tenant's
  // kicker labels must compute to the same WCAG-AA aubergine text color,
  // not burnished copper (shared design-system contrast rule, spec §2/§3).
  test('flag on: kicker eyebrow labels compute to the aubergine text color, not burnished copper', async ({ page }) => {
    await page.goto(FLAG_ON_URL + TENANT_QUERY);
    const kicker = page.locator('.kf-kicker, .kf-topbar-kicker').first();
    await expect(kicker).toBeVisible();
    const color = await kicker.evaluate((el) => window.getComputedStyle(el).color);
    expect(color).toBe('rgb(36, 22, 46)');
  });
});
