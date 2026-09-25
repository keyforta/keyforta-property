// @ts-check
import { expect, test } from '@playwright/test';

const FLAG_OFF_URL = 'http://127.0.0.1:3011';
const FLAG_ON_URL = 'http://127.0.0.1:3012';
const MANAGER_QUERY = '/?role=manager';

// Playwright visual/E2E verification for the flag-gated Manager redesign
// (docs/product/MANAGER_REDESIGN_SPEC.md), mirroring
// e2e/redesign/landlord.spec.ts's coverage/pattern for its own phase.
// Reuses the SAME two webServer instances Playwright already starts for
// the Landlord suite (playwright.config.js is unmodified) — one flag-off
// (3011), one flag-on (3012) — since the flag/mechanism is shared, not
// role-specific.
test.describe('Manager redesign (flag-gated)', () => {
  test('flag off: the existing (non-redesign) manager UI is unaffected', async ({ page }) => {
    await page.goto(FLAG_OFF_URL + MANAGER_QUERY);
    await expect(page.getByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeVisible();
    await expect(page.locator('.kf-manager-redesign')).toHaveCount(0);
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-off-manager-overview.png', fullPage: true });
  });

  test('flag on: the redesigned Manager Overview screen is reachable and renders the brand shell', async ({ page }) => {
    await page.goto(FLAG_ON_URL + MANAGER_QUERY);
    const shell = page.locator('.kf-manager-redesign');
    await expect(shell).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeVisible();
    // Same reused panel/copy, only the shell chrome differs (§6 of the spec).
    await expect(page.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeVisible();
    // §8.1(c): no next-best-action checklist card for Manager.
    await expect(page.getByTestId('next-best-action-checklist')).toHaveCount(0);
    // §0/§1: Manager never gets the landlord-only property-management panel.
    await expect(page.getByRole('heading', { name: 'Add a property' })).toHaveCount(0);
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-manager-overview.png', fullPage: true });
  });

  test('flag on: the redesigned Portfolio screen keeps the active nav pill, the status legend, and the reused listing panel', async ({ page }) => {
    await page.goto(FLAG_ON_URL + MANAGER_QUERY);
    await page.getByRole('button', { name: 'Portfolio' }).click();
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Portfolio' })).toHaveClass(/kf-nav-item-active/);
    await expect(page.getByTestId('portfolio-status-legend')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeVisible();
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-manager-portfolio.png', fullPage: true });
  });

  test('flag on: the six non-implemented Manager nav tabs render the shared generic empty state, not a dedicated panel', async ({ page }) => {
    await page.goto(FLAG_ON_URL + MANAGER_QUERY);
    for (const label of ['Applications', 'Occupancy', 'Payments', 'Work orders', 'Documents', 'Messages']) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
      await expect(page.getByTestId('rows-empty-state')).toBeVisible();
      // No listing publication panel and no status legend on these tabs.
      await expect(page.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toHaveCount(0);
    }
  });

  test('flag on: a non-manager role is not gated into the manager redesign', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/?role=landlord`);
    await expect(page.locator('.kf-landlord-redesign')).toHaveCount(1);
    await expect(page.locator('.kf-manager-redesign')).toHaveCount(0);
  });

  // Copilot-review-style regression guard mirroring landlord.spec.ts's
  // kicker-contrast coverage: Manager's kicker labels must compute to the
  // same WCAG-AA aubergine text color, not burnished copper (shared
  // design-system contrast rule, spec §2/§3).
  test('flag on: kicker eyebrow labels compute to the aubergine text color, not burnished copper', async ({ page }) => {
    await page.goto(FLAG_ON_URL + MANAGER_QUERY);
    const kicker = page.locator('.kf-kicker, .kf-topbar-kicker').first();
    await expect(kicker).toBeVisible();
    const color = await kicker.evaluate((el) => window.getComputedStyle(el).color);
    expect(color).toBe('rgb(36, 22, 46)');
  });
});
