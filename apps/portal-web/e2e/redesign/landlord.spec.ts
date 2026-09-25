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

  // Copilot PR #134 review, cycle-3/4 finding #4: kicker labels (12px,
  // uppercase eyebrow text) must compute to a WCAG-AA-passing color in a
  // real browser (jsdom cannot compute this) — confirms the aubergine-on-
  // near-white pairing actually renders as intended, not just that the
  // stylesheet source no longer mentions burnished-copper as the text
  // color (see the paired vitest spec for that static check).
  test('flag on: kicker eyebrow labels compute to the aubergine text color, not burnished copper (contrast fix)', async ({ page }) => {
    await page.goto(FLAG_ON_URL + LANDLORD_QUERY);
    const kicker = page.locator('.kf-kicker, .kf-topbar-kicker').first();
    await expect(kicker).toBeVisible();
    const color = await kicker.evaluate((el) => window.getComputedStyle(el).color);
    // --kf-aubergine is #24162E → rgb(36, 22, 46); --kf-burnished-copper
    // is #C47A4A → rgb(196, 122, 74). Asserting the exact aubergine rgb()
    // (rather than just "not copper") pins the fix to the specific
    // spec-approved token instead of any incidental other color.
    expect(color).toBe('rgb(36, 22, 46)');
  });

  // Copilot PR #134 review, cycle-3/4 finding #2/#3: the "Set pricing &
  // availability" checklist row is a navigation/click-through action, not
  // a toggle — it must have no `aria-pressed`, and clicking it must
  // actually open the existing (protected) "Manage this unit" control
  // rather than only scrolling the page.
  //
  // Copilot PR #134 review, comment 4099299613: this test was previously
  // titled as verifying that clicking the pricing row opens the existing
  // Manage-this-unit control, but only checked the absence of
  // `aria-pressed` and never clicked the row or asserted the form opened
  // — a regression in the browser wiring could pass it. Renamed to match
  // exactly what it verifies; the actual open-behavior assertion now
  // lives in the dedicated test below.
  test('flag on: the pricing/availability checklist row has no aria-pressed attribute on any checklist button', async ({ page }) => {
    await page.goto(FLAG_ON_URL + LANDLORD_QUERY);
    const checklist = page.getByTestId('next-best-action-checklist');
    await expect(checklist).toBeVisible();
    const rows = checklist.locator('button');
    const count = await rows.count();
    for (let i = 0; i < count; i += 1) {
      await expect(rows.nth(i)).not.toHaveAttribute('aria-pressed', /.+/);
    }
  });

  // Copilot PR #134 review, cycle-4 finding #2/#4 (comments 4099022268,
  // 4099299613): a real, end-to-end behavioral assertion — click the
  // "Set pricing & availability" checklist row and assert the existing
  // (protected) "Manage this unit" control genuinely opens, rather than
  // only checking an absent attribute. This uses the dev-only
  // checklist-open preview fixture (never part of the production entry
  // point/build — see src/landlord-redesign-checklist-preview.html and
  // src/redesign/landlord/__fixtures__/checklistOpenFixture.js), which
  // supplies exactly one property/unit (the §10.2 "exactly one" condition)
  // and a non-demo, token-ready session, so
  // `property-management-panel.jsx`'s own (protected, unmodified)
  // token-resolution effect reaches `tokenStatus === 'ready'` and its real
  // "Manage this unit" toggle is genuinely enabled/clickable — a demo
  // session (as used by the rest of this file's `?role=landlord` tests)
  // can never reach that state, so this exercise is not possible against
  // those routes. The fixture's token resolution is deliberately delayed
  // (see checklistOpenFixture.js), so this test clicks the checklist row
  // immediately (the toggle is still `disabled` at click time) and then
  // waits for the control to open — genuinely exercising
  // `openSoleUnitManagementControl`'s enable-then-click scheduling, not
  // just its already-enabled fast path.
  test('flag on: clicking the pricing/availability checklist row genuinely opens the existing Manage this unit control', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/landlord-redesign-checklist-preview.html`);
    const checklist = page.getByTestId('next-best-action-checklist');
    await expect(checklist).toBeVisible();

    const manageUnitForm = page.getByRole('heading', { name: 'Pricing & availability' });
    await expect(manageUnitForm).not.toBeVisible();

    // Clicked while the real toggle button is still disabled (the
    // fixture's silent token acquisition has not resolved yet) —
    // deliberately not waiting for it to become enabled first.
    const toggleButton = page.getByRole('button', { name: 'Set pricing & availability' }).last();
    await expect(toggleButton).toBeDisabled();

    const checklistRow = checklist.getByRole('button', { name: /Set pricing & availability/ });
    await expect(checklistRow).toBeVisible();
    await checklistRow.click();

    // Playwright's `expect(...).toBeVisible()` polls/retries, so this
    // genuinely waits for the control to open once the fixture's delayed
    // token resolves and `openSoleUnitManagementControl`'s scheduled click
    // fires — it does not just check an already-open control.
    await expect(manageUnitForm).toBeVisible();
    await expect(page.getByRole('form', { name: 'Pricing' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Availability' })).toBeVisible();
  });

  // Bug fix (PO report): the "Set pricing & availability" panel's section
  // captions (`.unit-pricing-availability form.unit-form ::before`)
  // rendered BESIDE the form's fields instead of ABOVE them as a heading,
  // and the availability caption's `border-top` divider rendered as a
  // short, disconnected line floating in its own auto-fill grid column —
  // because the protected `.unit-form` (styles.css) is a CSS Grid
  // container and the `::before` pseudo (a grid item with no explicit
  // `grid-column`) was auto-placed into its own column rather than
  // spanning the row. jsdom cannot lay out CSS Grid (see the paired
  // vitest source-text spec for the static-source-only assertion), so
  // this is a real-browser bounding-box assertion using the same
  // checklist-open preview fixture as the test above (needed to reach the
  // real, protected, token-ready "Manage this unit" control rather than
  // the always-`tokenStatus: 'demo'` `?role=landlord` routes).
  test('flag on: the pricing/availability section captions span the full form width as a heading, not a narrow side column', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/landlord-redesign-checklist-preview.html`);
    const checklistRow = page.getByTestId('next-best-action-checklist').getByRole('button', { name: /Set pricing & availability/ });
    await checklistRow.click();
    await expect(page.getByRole('heading', { name: 'Pricing & availability' })).toBeVisible();

    const panel = page.locator('.unit-pricing-availability');
    await expect(panel).toBeVisible();

    const diagnostics = await panel.evaluate((panelEl) => {
      const forms = Array.from(panelEl.querySelectorAll('form.unit-form'));
      return forms.map((form) => {
        const formRect = form.getBoundingClientRect();
        const beforeStyle = window.getComputedStyle(form, '::before');
        return {
          formWidth: formRect.width,
          beforeGridColumn: beforeStyle.gridColumn,
        };
      });
    });

    // Both captions' `::before` must resolve to spanning every column
    // (`1 / -1` or an equivalent computed span), not the default `auto`
    // single-column placement that caused the reported bug.
    for (const form of diagnostics) {
      expect(form.beforeGridColumn).not.toBe('auto');
      expect(form.beforeGridColumn).toMatch(/1\s*\/\s*(-1|auto)|span/);
    }

    // The two submit buttons must render at a visually consistent width
    // (previously they differed because the caption ate one of the
    // auto-fill columns unevenly between the two forms).
    const buttonWidths = await panel.evaluate((panelEl) => Array.from(
      panelEl.querySelectorAll("button[type='submit']"),
    ).map((button) => button.getBoundingClientRect().width));
    expect(buttonWidths).toHaveLength(2);
    expect(Math.abs(buttonWidths[0] - buttonWidths[1])).toBeLessThanOrEqual(2);

    // Copilot PR #135 review, cycle-1 finding: an earlier version of this
    // fix added a visible border to the Cancel button, but the approved
    // spec (LANDLORD_REDESIGN_SPEC.md §5.1) explicitly documents `subtle`
    // (Cancel/nav/sign-out/language toggle) as transparent/borderless —
    // that is the intentional, approved treatment. Assert it stays that
    // way (no resting border) rather than reintroducing the reverted
    // override.
    const cancelButton = panel.locator("> button[type='button']").last();
    await expect(cancelButton).toHaveText(/Cancel/);
    // Fluent's own `subtle` Button already renders a 1px solid border by
    // default (kept transparent, purely for layout/box-model stability
    // across appearances) — so `borderTopStyle` alone can't distinguish
    // "spec-compliant borderless subtle" from "a real visible border was
    // added". Assert the border stays invisible (transparent), which is
    // what the spec's "no border" actually means visually.
    const cancelBorderColor = await cancelButton.evaluate((el) => window.getComputedStyle(el).borderTopColor);
    expect(cancelBorderColor).toMatch(/^rgba\([^)]*,\s*0\)$|^transparent$/);

    await panel.screenshot({ path: 'e2e/redesign/__screenshots__/flag-on-unit-pricing-availability-caption-fix.png' });
  });

  // Copilot PR #135 review, cycle-1 finding: a bare `min-width` on the
  // submit buttons is only a lower bound — with `justify-self: start` the
  // button still shrinks to fit its own label, so the English-only
  // assertion above passed while the French labels (fr: "Définir le
  // prix" 15 chars vs. "Mettre à jour la disponibilité" 30 chars) could
  // still render at visibly different widths. Switch the app's stored
  // language (see `src/i18n.js`'s `kf-language` localStorage key) to
  // French and re-run the same width-parity assertion in that locale.
  test('flag on: the pricing/availability submit buttons stay width-consistent in French (longest currently approved label)', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('kf-language', 'fr'));
    await page.goto(`${FLAG_ON_URL}/landlord-redesign-checklist-preview.html`);
    const checklistRow = page.getByTestId('next-best-action-checklist').getByRole('button', { name: /prix et (la )?disponibilité/i });
    await checklistRow.click();

    const panel = page.locator('.unit-pricing-availability');
    await expect(panel).toBeVisible();

    const buttonWidths = await panel.evaluate((panelEl) => Array.from(
      panelEl.querySelectorAll("button[type='submit']"),
    ).map((button) => button.getBoundingClientRect().width));
    expect(buttonWidths).toHaveLength(2);
    expect(Math.abs(buttonWidths[0] - buttonWidths[1])).toBeLessThanOrEqual(2);

    // Neither button's label should overflow its own box at the shared
    // min-width (would indicate the min-width is still too small for a
    // real translation, not just an English-only guess).
    const overflow = await panel.evaluate((panelEl) => Array.from(
      panelEl.querySelectorAll("button[type='submit']"),
    ).map((button) => button.scrollWidth > button.clientWidth + 1));
    expect(overflow).toEqual([false, false]);
  });

  // renders as a separate DOM copy inside ListingPublicationPanel, a
  // sibling of the property-management anchor rather than a descendant
  // of it. That copy must get the same non-green treatment, not just the
  // one nested inside PropertyManagementPanel's read-only view.
  test('flag on: the withdrawn listing\'s badge inside the separate Listing Publication panel is also tinted negative, not left green', async ({ page }) => {
    await page.goto(`${FLAG_ON_URL}/landlord-redesign-preview.html`);
    const unitStatus = page.locator('.unit-row > .status');
    const publicationPanelStatus = page.locator('.listing-row .status');
    await expect(unitStatus).toHaveText('Available');
    await expect(publicationPanelStatus).toHaveText('Withdrawn');

    const [unitColor, publicationPanelColor] = await Promise.all([
      unitStatus.evaluate((el) => window.getComputedStyle(el).color),
      publicationPanelStatus.evaluate((el) => window.getComputedStyle(el).color),
    ]);
    expect(publicationPanelColor).not.toBe(unitColor);
    await expect(publicationPanelStatus).toHaveAttribute('data-kf-tone', 'negative');
  });
});
