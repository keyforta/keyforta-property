// @ts-check
import { expect, test } from '@playwright/test';

const FLAG_OFF_URL = 'http://127.0.0.1:3011';
const FLAG_ON_URL = 'http://127.0.0.1:3012';
const LANDLORD_QUERY = '/?role=landlord';

// Playwright visual/E2E verification for the flag-gated landlord redesign
// (docs/product/LANDLORD_REDESIGN_SPEC.md). New devDependency, isolated
// config (playwright.config.js), NOT wired into `pnpm verify` yet — see
// docs/engineering/REQUIREMENTS_GAPS.md "Redesigned per-role UI/UX" row,
// run via `pnpm test:e2e` (apps/portal-web/package.json) only.
test.describe('Landlord redesign (flag-gated)', () => {
  test('flag off: the existing (non-redesign) landlord UI is unaffected', async ({ page }) => {
    await page.goto(FLAG_OFF_URL + LANDLORD_QUERY);
    await expect(page.getByRole('heading', { name: 'A clear view of your property portfolio.' })).toBeVisible();
    // The redesign's scoping class must never be present when the flag is off.
    await expect(page.locator('.kf-landlord-redesign')).toHaveCount(0);
    // Today's unstyled controls/red demo banners are still exactly what
    // renders — this is the explicit "flag-off path is unaffected" check.
    await expect(page.locator('.publication-feedback[data-tone="error"]').first()).toBeVisible();
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-off-landlord-overview.png', fullPage: true });
  });

  test('flag on: the redesigned landlord Overview screen is reachable and renders the brand shell', async ({ page }) => {
    await page.goto(FLAG_ON_URL + LANDLORD_QUERY);
    const shell = page.locator('.kf-landlord-redesign');
    await expect(shell).toHaveCount(1);
    await expect(page.getByRole('heading', { name: 'A clear view of your property portfolio.' })).toBeVisible();
    // Same reused panels/copy, only the shell chrome differs (§6 of the spec).
    await expect(page.getByRole('heading', { name: 'Publish or withdraw assigned listings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add a property' })).toBeVisible();
    // Addendum §10.2: next-best-action checklist, computed from already-
    // fetched data only (no new fetch/endpoint).
    const checklist = page.getByTestId('next-best-action-checklist');
    await expect(checklist).toBeVisible();
    await expect(checklist.getByText('Get your first listing live')).toBeVisible();
    await expect(checklist.getByText('Status unknown')).toBeVisible();
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-landlord-overview.png', fullPage: true });
  });

  test('flag on: the redesigned Properties screen keeps the active nav pill and reused panels', async ({ page }) => {
    await page.goto(FLAG_ON_URL + LANDLORD_QUERY);
    await page.getByRole('button', { name: 'Properties' }).click();
    await expect(page.getByRole('heading', { name: 'Properties', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Properties' })).toHaveClass(/kf-nav-item-active/);
    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-landlord-properties.png', fullPage: true });
  });

  test('flag on: a non-landlord role is not gated into the redesign', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/?role=manager`);
    await expect(page.getByRole('heading', { name: 'Coordinate the work behind every home.' })).toBeVisible();
    await expect(page.locator('.kf-landlord-redesign')).toHaveCount(0);
  });

  // Regression fix — PO live-review finding: a unit's own occupancy
  // "Available" badge sitting next to its listing's "Withdrawn"/"Media
  // approved" badges was read as a contradiction, but these are unrelated
  // fields that can legitimately disagree; the §10.4/§11 visual chunking
  // just grouped them with no distinguishing caption. This uses the
  // dev-only PO-regression preview fixture (never part of the production
  // entry point/build — see src/landlord-redesign-preview.html and
  // src/redesign/landlord/__fixtures__/) to reproduce the exact reported
  // combination and assert the two groups now render distinguishable
  // captions in a real browser (jsdom cannot compute pseudo-element
  // `content` — see the paired vitest spec for the JS-side wiring
  // assertion).
  test('flag on: the unit-status and listing-status badge groups render distinguishable captions (PO regression fix)', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/landlord-redesign-preview.html`);
    const unitStatus = page.locator('.unit-row > .status');
    const listingStatusGroup = page.locator('.public-listing-status');
    await expect(unitStatus).toContainText('Available');
    await expect(listingStatusGroup).toContainText('Withdrawn');
    await expect(listingStatusGroup).toContainText('Media approved');

    const [unitCaption, listingCaption] = await Promise.all([
      unitStatus.evaluate((el) => window.getComputedStyle(el, '::before').content),
      listingStatusGroup.evaluate((el) => window.getComputedStyle(el, '::before').content),
    ]);
    expect(unitCaption).toBe('"Unit status"');
    expect(listingCaption).toBe('"Listing status"');
    expect(unitCaption).not.toBe(listingCaption);

    await page.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-landlord-properties-status-distinction.png', fullPage: true });
  });

  // Copilot PR #134 review finding #2: the withdrawn listing's `.status`
  // badge must not render with the same green "positive" color as the
  // unit's own "Available" badge — this asserts the actual COMPUTED
  // background/color in a real browser (jsdom cannot compute this),
  // using the same PO-regression preview fixture (available unit +
  // withdrawn listing, the exact reported combination).
  test('flag on: a withdrawn listing\'s status badge no longer computes to the green "positive" color used for genuinely positive statuses', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/landlord-redesign-preview.html`);
    const unitStatus = page.locator('.unit-row > .status');
    const listingStatus = page.locator('.public-listing-status .status');
    await expect(unitStatus).toHaveText('Available');
    await expect(listingStatus).toHaveText('Withdrawn');

    const [unitColor, listingColor] = await Promise.all([
      unitStatus.evaluate((el) => window.getComputedStyle(el).color),
      listingStatus.evaluate((el) => window.getComputedStyle(el).color),
    ]);
    // The unit's "Available" badge keeps the base reused green (unchanged,
    // positive is correct here); the listing's "Withdrawn" badge must
    // compute to a visibly different color.
    expect(listingColor).not.toBe(unitColor);
    await expect(listingStatus).toHaveAttribute('data-kf-tone', 'negative');
  });
});
