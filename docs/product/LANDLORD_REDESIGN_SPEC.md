# Landlord Portal Redesign — UX/Visual Design Spec (Phase 1)

> **Location note:** the task asked for this spec at `docs/design/landlord-
> redesign-spec.md`. That directory does not yet exist in the repository and
> my available tooling can only create files inside existing directories
> (no directory-creation capability). This document is placed under
> `docs/product/` instead, alongside the other product/UX specs
> (`RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md`, `REQ-037-...md`,
> `REQ-038-...md`). If a `docs/design/` convention is later created (e.g. by
> someone with shell access), this file should move there unchanged.

Status: **Draft, pending Product Owner sign-off.** Tracked under
`docs/engineering/REQUIREMENTS_GAPS.md` → "Redesigned per-role UI/UX with
KEYFORTA branding" (approved-in-principle scope, final sign-off pending).
This document is the design artifact called for by that row's open decision
"(d) the per-role UX design spec itself does not yet exist."

Scope owner: UX Designer (this document). Implementation owner: Frontend
Engineer, in `apps/portal-web/src/redesign/landlord/` only, flag-gated,
**additive** — no existing file under `apps/portal-web/src` may be modified.

This spec covers **Phase 1: Landlord** only (Overview + Properties screens),
matching the phase ordering already recorded in `REQUIREMENTS_GAPS.md`
("Landlord first ... then Manager, then Tenant, then Admin").

---

## 0. What this redesign is and is not

**Is:** a presentation-layer redesign of the *existing* landlord
capabilities — the same data, same API calls, same auth/session hooks, same
states — with a professional, on-brand visual system replacing today's
unstyled controls and jarring red demo banner.

**Is not:** a new feature. No new screens, fields, or actions are designed
beyond what `apps/portal-web/src/portal-app.jsx`,
`property-management-panel.jsx`, and `listing-publication-panel.jsx`
implement today. Section 6 explicitly maps every existing interactive
element so none is silently dropped or expanded in scope. Section 8 flags
everything I found that looks like a gap but is **not** approved to add.

---

## 1. Reviewed source of truth

Read in full before writing this spec:

- `apps/portal-web/src/portal-app.jsx` — app shell, sidebar nav, role
  routing, `showPropertyManagement` / `showListingPublication` gating,
  overview stats/rows empty states, quick actions panel.
- `apps/portal-web/src/property-management-panel.jsx` — property/unit
  creation forms, pricing/availability forms, draft listing create/edit
  form, `ListingImageManager` (upload/list/delete), all token/feed/message
  states.
- `apps/portal-web/src/listing-publication-panel.jsx` — publish/withdraw
  action, status badges, all token/feed/message states.
- `apps/portal-web/src/styles.css` — current (non-brand) visual system:
  green/teal-ish palette, `Inter` font, ad hoc radii/spacing, the red-toned
  `.publication-feedback[data-tone='error']` banner the PO called out.
- `packages/brand/src/index.js`, `packages/brand/src/assets.json` — brand
  color/font tokens and logo/symbol/wordmark asset inventory.
- `packages/ui/src/AppBrand.jsx` — **finding:** today's `AppBrand` renders
  plain text (`KEYFORTA / {surface}`), not the actual logo/wordmark SVG
  assets cataloged in `packages/brand/src/assets.json`. See §8, open
  question (a).
- `apps/portal-web/src/locales/en.json` — exact copy for every state string
  referenced below (kept as-is; this is a visual/IA spec, not a content
  rewrite).
- `apps/portal-web/package.json` — confirms `@fluentui/react-components`
  `9.72.5` (Fluent UI v9) and React 19 are already in use.

---

## 2. Technology decision: reuse Fluent UI v9 (no library change)

**Recommendation: stay on Fluent UI v9**, themed with brand tokens via a new
custom theme object (see §3.1). This is the default per the task's own
constraint, and I have no strong reason to deviate:

- Fluent v9 already ships accessible primitives (`Field`, `Input`, `Select`,
  `Textarea`, `Checkbox`, `Button`, `Spinner`, `Badge`, `MessageBar`) that
  directly replace the current raw `<select>`/`<input>` elements — this
  alone fixes the PO's "plain unstyled browser-default" complaint without
  any new dependency.
- `FluentProvider` + a custom `Theme` object (built with
  `createLightTheme`/`BrandVariants` from `@fluentui/react-theme`, already a
  transitive dependency of `@fluentui/react-components`) is the supported,
  documented way to theme Fluent with brand colors — no ad hoc CSS overrides
  needed for most components.
- Switching UI libraries would be a technology decision requiring separate
  ADR/PO approval per the task constraints — **not recommended, not
  requested, not designed here.**

**Flag for engineering (not a design decision, but blocking implementation
detail):** Fluent's `BrandVariants` theming API expects a 16-step ramp
(`10`...`160`) per brand color, not a single hex. `packages/brand` defines
only one flat hex per brand color. The Frontend Engineer must generate a
ramp *anchored so that a specific named step reproduces the exact brand hex
used for primary actions* (commonly step `80` or `90` for
`colorBrandBackground`) — e.g. via Fluent's theme designer tool or
`@fluentui/react-theme`'s ramp generator — and that generated ramp must be
reviewed against the brand palette before merge, since an automatically
interpolated ramp can visually drift from the approved hex at intermediate
steps. This is a one-time token-generation task, not a per-screen design
decision, but I'm flagging it here so it isn't silently improvised into
"whatever the generator outputs."

---

## 3. Design tokens

### 3.1 Color — brand palette usage rules

Only these four hexes exist as approved brand color. No new colors. Roles
below are assigned by **contrast-verified purpose**, not preference — see
the WCAG table.

| Token | Hex | Role |
|---|---|---|
| `aubergine` | `#24162E` | Primary text color on light surfaces; sidebar/nav surface color (dark); primary heading color; also used as *text* color on top of `burnishedCopper` (see contrast note below) |
| `mineralTeal` | `#267C78` | Primary interactive/brand accent — primary button fill, active nav state, links, focus-adjacent accent, success-adjacent iconography (not the success color itself — see §3.1.2) |
| `burnishedCopper` | `#C47A4A` | Secondary/warm accent — used sparingly for badges, highlight borders, quick-action icon chips, and the "attention" (not error) state; **never** as a small-text color or small-text background (fails AA, see table) |
| `softBone` | `#F3EEE7` | Page/app background, card background alternative, subtle section dividers, text-on-dark (e.g. sidebar body text on `aubergine`) |

#### 3.1.1 Contrast verification (WCAG AA, computed from the four hexes)

Normal text requires ≥ 4.5:1; large text (≥ 24px, or ≥ 19px bold) and
non-text UI (borders, icons) require ≥ 3:1.

| Foreground | Background | Ratio | AA normal text? | AA large text/UI? |
|---|---|---|---|---|
| `aubergine` | `softBone` | **14.8:1** | ✅ | ✅ |
| `aubergine` | white | **17.1:1** | ✅ | ✅ |
| `softBone` | `aubergine` | **14.8:1** | ✅ | ✅ (use for sidebar body text) |
| white | `mineralTeal` | **4.96:1** | ✅ (barely) | ✅ |
| `mineralTeal` | `softBone` | **4.29:1** | ❌ | ✅ |
| `mineralTeal` | white | **4.96:1** | ✅ (barely) | ✅ |
| `aubergine` | `burnishedCopper` | **5.07:1** | ✅ | ✅ |
| white | `burnishedCopper` | **3.37:1** | ❌ | ✅ only |
| `burnishedCopper` | `softBone` | **2.92:1** | ❌ | ❌ |

**Resulting rules (binding for implementation):**

1. `mineralTeal` **must not** be used as small/body text color directly on
   the `softBone` app background (fails AA). It may be used as small text on
   pure white card surfaces (passes, barely — treat 4.96:1 as a floor, don't
   also apply low-contrast font-weight/size reductions on top of it).
2. Primary buttons: `mineralTeal` fill + **white** text passes (4.96:1).
   Keep button text at normal Fluent button weight/size; do not shrink it.
3. `burnishedCopper` is **never** a text color on `softBone`, and never a
   background for small white text. Approved copper usage: (a) thin
   accent borders/underlines, (b) icon fill, (c) a badge/chip **background**
   with `aubergine` text (5.07:1, passes), (d) large bold headings only if
   ever used as text-on-light (not recommended; prefer aubergine for
   headings).
4. Sidebar (`aubergine` background) always uses `softBone` or white text —
   never `mineralTeal` or `burnishedCopper` text on `aubergine` for body
   copy (untested/likely low contrast combos, not needed since aubergine
   pairs cleanly with the two neutrals already).

#### 3.1.2 Semantic (non-brand) status colors

The brand palette has no red/amber/green. Existing states already need
error/success/warning semantics (form validation, publish/withdraw
feedback, token/feed errors). Per "no ad hoc colors" for **brand** surfaces,
but functional status color is a separate, narrower exception commonly
carved out even in strict brand systems:

- **Success:** use Fluent's theme-provided semantic success token
  (`colorPaletteGreenForeground1`/`colorPaletteGreenBackground2` in Fluent's
  default ramps) — *not* `mineralTeal`, so a successful save is never
  visually confused with a neutral brand accent.
- **Error/danger:** Fluent's default semantic red tokens
  (`colorPaletteRedForeground1`/`colorPaletteRedBackground2`), restyled only
  to match brand radii/typography, not brand hue. This directly replaces
  today's raw `#fff1f2`/`#9f1239` ad hoc red banner — same semantic color
  family (red = error is a universal, accessibility-relevant convention),
  but delivered through Fluent's accessible, theme-integrated tokens instead
  of hardcoded hex, and with quieter, less saturated presentation (smaller
  left accent bar rather than a full jarring red block — see §5).
- **Warning/attention** (e.g. "sign-in required", "demo session,
  read-only"): Fluent's semantic amber/marigold tokens, *or* — since these
  are brand-safe, non-urgent, informational states — `burnishedCopper` as an
  accent bar/icon with `aubergine` text on `softBone`/white body (passes
  AA per §3.1.1). This is the specific fix for the PO's "jarring red demo
  banner" complaint: demo/read-only notices move from red to a quiet
  copper-accented informational treatment. See §5.2.

**Open question (flag for PO/engineering, §8b):** confirm it's acceptable
for error/success semantic color to come from Fluent's default palette
rather than a bespoke brand red/green, since none is defined in
`packages/brand`.

### 3.2 Typography

Brand fonts only: **Instrument Sans** (display) and **Source Sans 3**
(body). Load both as self-hosted or approved web fonts (flag in §8: current
`styles.css` loads no web font at all and defaults to `Inter`/system-ui —
sourcing/licensing/self-hosting the two brand fonts is an implementation
detail the Frontend Engineer must resolve, e.g. via `@fontsource` packages
or static assets, not invented here).

| Role | Font | Size | Weight | Line-height | Usage |
|---|---|---|---|---|---|
| Display / page title | Instrument Sans | 32px (clamp 28–40px) | 700 | 1.1 | `<h1>` topbar title (e.g. "A clear view of your property portfolio.") |
| Section heading | Instrument Sans | 22px | 700 | 1.2 | Panel `<h2>` (e.g. "Property management", "Listing publication") |
| Subsection heading | Instrument Sans | 17px | 700 | 1.3 | Form legends (e.g. "Add a property", "Manage this unit") |
| Eyebrow/kicker | Instrument Sans | 12px | 700, uppercase, 0.08em tracking | 1.2 | `.kicker` labels ("Owner workspace", "Listing publication") |
| Body | Source Sans 3 | 15px | 400 | 1.5 | Paragraph copy, descriptions, empty states |
| Body strong | Source Sans 3 | 15px | 600 | 1.5 | Property/listing names, field labels |
| Small / meta | Source Sans 3 | 13px | 400 | 1.4 | Listing IDs, unit meta, timestamps |
| Button label | Source Sans 3 | 15px | 600 | 1 | All button text |

Type scale ratio ≈ 1.25 (major third), 6 steps, matching the sizes above.

### 3.3 Spacing & sizing scale

4px base unit, exposed as design tokens (not literal pixels in component
code):

`space-1: 4px · space-2: 8px · space-3: 12px · space-4: 16px · space-5: 24px
· space-6: 32px · space-7: 48px · space-8: 64px`

- Card/panel internal padding: `space-5` (24px), matching current `.panel`
  padding — keep, it already reads fine.
- Field-to-field gap inside forms: `space-4` (16px), up from the current
  bare `10px`/`14px` mix in `.property-form`/`.manual-listing-form`.
- Section-to-section gap: `space-5`–`space-6`.
- Border radius scale: `radius-sm: 8px` (inputs, badges), `radius-md: 12px`
  (buttons, small cards), `radius-lg: 16px` (panels), `radius-pill: 999px`
  (status badges). This **replaces** the current asymmetric
  `border-radius: 4px 10px 10px 10px` button treatment (an idiosyncratic
  "clipped corner" look with no evident brand rationale) with a consistent,
  calmer radius system — flagged as a visual decision in §8, not silently
  carried over.
- Minimum touch target: 40px height for all interactive controls (buttons,
  inputs, selects), meeting WCAG 2.5.5 / 2.5.8 target-size guidance.

### 3.4 Elevation & surfaces

- App background: `softBone`.
- Card/panel surface: white, 1px border `aubergine` at 8% opacity (a tint,
  not a new hex — implemented as an alpha-blended `aubergine`, e.g.
  `rgba(36,22,46,0.08)`, so it stays traceable to the approved token), plus
  a soft shadow (`0 8px 24px rgba(36,22,46,0.06)`), replacing today's flat
  `#dce8e0` grey-green border that doesn't relate to the brand palette at
  all.
- Sidebar surface: `aubergine` solid fill (replaces today's unrelated
  `#132b25` dark green).

---

## 4. Information architecture & layout

### 4.1 App shell (applies to every landlord screen)

Unchanged structural IA from today (left sidebar + main content), restyled:

- **Sidebar** (`aubergine` fill): logo/wordmark lockup at top (using the
  real SVG asset — see §8a), workspace eyebrow label ("Owner workspace"),
  vertical nav list (`Overview, Properties, Applications, Leases, Payments,
  Maintenance, Documents, Messages` — same 8 items, same order, same
  language-independent `roleNavKeys.landlord` keys; **no new nav items are
  designed**), language toggle, sign-out — pinned to bottom as today.
  - Nav items beyond Overview/Properties (Applications, Leases, Payments,
    Maintenance, Documents, Messages) currently render only the generic
    stats/rows empty-state copy (no dedicated panel exists yet). The
    redesign keeps that same generic empty-state treatment for those tabs
    — styled per §5.3 — rather than inventing new panels for them.
- **Topbar**: eyebrow + `<h1>` title + subtitle (Overview) or section label
  (other tabs), user chip (avatar + email) at top right — unchanged
  structure, restyled per typography/spacing tokens.
- **Content grid**: unchanged 2-column layout on desktop
  (`minmax(0,1.7fr) minmax(260px,1fr)`) — main panel(s) left, "quick
  actions" aside right — collapsing to 1 column ≤900px, matching today's
  breakpoint behavior (see §7).

### 4.2 Overview screen

Same three existing regions, restyled, no new regions:

1. **Stats strip** — today shows only a single empty-state sentence
   (`role.statsEmptyState`) because no landlord stats API exists yet. Keep
   as a single full-width quiet placeholder card (not four empty boxes
   pretending to be populated stat tiles) — see §5.3 empty state. Do **not**
   invent stat tiles/numbers.
2. **Content grid**:
   - Left: `ListingPublicationPanel` **and** `PropertyManagementPanel`
     both render here today when `active === 'overview'` (per
     `showListingPublication`/`showPropertyManagement` gating in
     `portal-app.jsx`) — same stacking order, restyled as bordered cards
     with clear visual separation (§4.4 for exact panel treatment), plus
     the "Needs attention" activity panel (currently always empty-state).
   - Right (aside): "Quick actions" panel — same action list from
     `actions.landlord` i18n, restyled as icon-chip list buttons; API
     boundary note at the bottom, restyled as a quiet footnote block, not a
     bordered "warning" box.

### 4.3 Properties screen

Same content as Overview's property-related content, but as the focused
primary view (only `PropertyManagementPanel` + `ListingPublicationPanel`
render; the generic "Needs attention"/quick-actions aside continues to
render exactly as it does today, since `active === 'properties'` also
satisfies both gates in `portal-app.jsx`).

Layout, unchanged data model, restyled presentation:

- **Property list** as a vertical stack of **property cards** (not the
  current plain unbordered rows), each card containing:
  - Property name (body-strong) + property-type badge (pill, `softBone`
    fill, `aubergine` text, 1px `aubergine`-tint border).
  - A nested **unit list**: each unit as a compact row/sub-card with unit
    label, unit-type meta, an **availability status badge** (see §5.5 badge
    color mapping), and the two existing per-unit actions ("Manage this
    unit" → pricing/availability form; listing create/edit control).
- **"Add a property"** — the #1 called-out pain point. Redesign as a
  clearly demarcated **card-style form** (not a plain unbordered form,
  which is today's actual look despite the `.property-form` class having a
  border — the *fields themselves* are unstyled native controls, which is
  what actually reads as "unpolished"). All fields become Fluent `Field` +
  `Input`/`Select` pairs (already used in code, just unstyled by Fluent's
  default un-themed look until brand theming is applied) with:
  - A clear two-column responsive grid (already present in CSS, keep) but
    with confident label/hint typography (label = body-strong 15px,
    optional helper/validation text = small 13px in the error-semantic
    color).
  - Grouped visual sections within the same form (not literally separate
    forms — the API is a single create-property call): "Property details"
    (name, type, address fields, timezone, jurisdiction) then "First unit"
    (unit label, type, bedrooms, bathrooms, furnishing) as two labeled
    fieldset groups inside the one form, improving scanability without
    changing the single-submit behavior.
  - Primary submit button (`mineralTeal` fill, white text, `radius-md`,
    40px height, right- or left-aligned per existing DOM order).

---

## 5. Component treatment

### 5.1 Buttons

| Fluent `appearance` | Usage today | Redesigned treatment |
|---|---|---|
| `primary` | Submit buttons (Create property, Add unit, Set pricing/availability, Save listing) | `mineralTeal` fill, white text, `radius-md` (12px), 40px height, `600` weight label |
| `secondary` | Toggle/open buttons (Add unit, Manage unit, Create/Edit listing, Sign-in-to-continue, Retry) | White fill, 1.5px `mineralTeal` border, `mineralTeal` text, same radius/height |
| `outline` | Quick action buttons | `softBone`/white fill, `aubergine`-tint border, `aubergine` text, leading icon chip |
| `subtle` | Cancel, nav items, sign-out, language toggle | Transparent fill, `aubergine` text (light surfaces) or `softBone` text (dark sidebar), no border; nav-active state gets a `mineralTeal`-tinted background pill |

All buttons: visible **focus ring** = 2px solid `mineralTeal` offset 2px
(Fluent's default focus-indicator token, remapped to `mineralTeal` via
theme `colorStrokeFocus2`), never removed via `outline: none`.

### 5.2 Banners / inline feedback (`.publication-feedback` today)

Today: every state (loading, demo-mode, sign-in-required, error, success)
renders through the *same* flat two-tone class, and the PO specifically
called out the **red** demo-mode banner as jarring. Redesigned into
distinct, purpose-built banner styles, all sharing the same shape language
(left accent bar + icon + text, `radius-sm`, `space-4` padding):

| Existing state (`tokenStatus`/message tone) | Today | Redesigned |
|---|---|---|
| `loading` / feed loading (`data-tone='success'`, informational) | Green-ish text | Neutral **informational** banner: `softBone` fill, `aubergine` text, small inline `Spinner`, thin `mineralTeal` left accent bar |
| `demo` (read-only/demo session) | Flat red block, `role='alert'` | **Quiet informational banner**, not an alert-severity treatment: white/`softBone` fill, `aubergine` text, thin `burnishedCopper` left accent bar, small "info" icon — communicates "read-only demo" without alarming red. *(Still uses `role='status'`, not `role='alert'`, since a fully-expected read-only mode is not an error — flagged in §8 as a semantics change from today's `role='alert'`, needs confirmation it's not relied upon by any test asserting `role='alert'` for this exact state.)* |
| `organization-unavailable`, `unavailable` (config/environment problems) | Flat red block | **Error banner**: `radius-sm`, white fill, semantic-red left accent bar + icon (§3.1.2), `aubergine` body text (not red body text, to preserve strong contrast — only the accent bar/icon carries the red semantic), `role='alert'` preserved |
| `sign-in-required` | Flat red block + button | Same error-banner shell, plus the existing "Sign in to continue" secondary button inline |
| Feed error / rejected base URL | Flat red block + optional retry button | Same error-banner shell + existing retry `Button` |
| Success message (`messageTone==='success'`) | Green-ish `#eaf5ee`/`#38634f` | Semantic-success banner (Fluent green tokens), `role='status'` unchanged |
| Error message (`messageTone==='error'`) | Red `#fff1f2`/`#9f1239` | Semantic-error banner per row above, `role='alert'` unchanged |

No banner text content changes — same i18n strings, same conditions, same
`role`/`aria-live` semantics **except** the one flagged demo-mode
`role` question above.

### 5.3 Empty / loading / error / offline / denied states — canonical treatment

These five states recur across Overview stats, "Needs attention" rows,
property list, listing list, and image list. One consistent pattern for
all of them:

- **Loading:** centered or inline `Spinner` (`tiny` for inline-with-button,
  `small` for panel-level) + body text, inside a quiet neutral card, never
  a red/error-colored container.
- **Empty:** a soft-bordered placeholder block (`softBone` fill, dashed
  1px `aubergine`-tint border, `radius-lg`) containing a short body-text
  sentence (existing i18n empty-state copy, unchanged) — visually distinct
  from an error, using no accent color at all (neutral = "nothing to show
  yet", not "something's wrong").
- **Error:** the error-banner treatment from §5.2, plus a `Button
  appearance='secondary'` retry action wherever `onRetryFeed`/
  `onRetryListingsFeed`/`onRetryFeed` already exists in code today. No new
  retry affordances where none exists today (e.g. form-submission errors
  stay inline under the field via `Field`'s `validationMessage`, matching
  current behavior).
- **Offline:** **no dedicated offline state exists in the current code**
  (no `navigator.onLine` handling, no network-status banner). This redesign
  does not add one — a generic network failure surfaces today only as
  whatever error the API client throws, handled by the existing
  `messageTone==='error'` / `feedError` paths above. Flagged as an explicit
  non-decision in §8: *if* PO wants a distinct offline affordance, that is
  a new capability requiring its own approval, not something to add here.
- **Denied:** the existing `PendingWorkspaceAccess` screen (shown when a
  signed-in identity has no landlord/manager/tenant membership) and the
  existing `tokenStatus === 'demo'`/`'organization-unavailable'`/
  `'unavailable'` read-only gates *are* the product's denied/restricted
  states today. Redesign `PendingWorkspaceAccess` visually to match the new
  `auth-card` treatment (see §5.6) but do not change its trigger condition
  or copy. No new "access denied" screen is designed beyond what exists.

### 5.4 Forms — field-by-field visual rules

All Fluent `Field`/`Input`/`Select`/`Textarea`/`Checkbox` (already the
components used in code — see §6 mapping) get:

- Label: body-strong, `aubergine`, `space-1` above the control.
- Control: white fill, 1.5px `aubergine`-tint (12–15% alpha) border,
  `radius-sm`, 40px height (`Textarea` min-height 88px), `space-3`
  horizontal padding.
- Focus: border becomes solid 2px `mineralTeal` + 2px outer focus ring
  (§5.1) — never a bare color-only change (fails 1.4.1 Use of Color if
  color were the *only* focus indicator, though Fluent's default box-shadow
  ring already avoids this).
- Required marker: Fluent's built-in `*` via `required` prop — unchanged
  behavior, restyled color only (`burnishedCopper` asterisk, meeting the
  "accent, not error" role since a required-field marker is not an error
  until validated).
- Validation error (`validationMessage` prop already used, e.g.
  "reason code required", "amount invalid"): small 13px semantic-error text
  below the field + 2px semantic-error border on the control, `aria-live`
  unaffected (Fluent's `Field` already wires this correctly).
- Disabled (e.g. `disabled={anyBusy}`/`disableActions`): 45% opacity,
  `not-allowed` cursor, no color change beyond opacity (avoids a fifth ad
  hoc "disabled grey").

### 5.5 Badges (status pills)

Single pill component, `radius-pill`, `space-1`×`space-3` padding, 13px
body-strong text, used for: property type, unit type, unit availability
status, listing status (`draft`/`published`/`withdrawn`), media review
status.

| Status | Fill | Text | Rationale |
|---|---|---|---|
| Neutral / informational (property type, unit type, "draft") | `softBone` | `aubergine` | Passes AA (§3.1.1), calm default |
| Positive (unit "available", listing "published") | Fluent semantic-success tint | Fluent semantic-success foreground | Success ≠ brand teal, per §3.1.2 |
| Attention (unit "unavailable", "pending review") | `burnishedCopper` fill | `aubergine` text (5.07:1, passes) | Matches §3.1.1 rule 3 |
| Negative (listing "withdrawn", "rejected") | Fluent semantic-error tint | Fluent semantic-error foreground | Consistent with error banners |
| Occupied (lease-derived, locked) | `aubergine` fill (10% tint) | `aubergine` text | Distinguish "locked/derived" from "available/unavailable" toggle states without introducing a new hue |

### 5.6 Auth screens (`LoginGate`, `PendingWorkspaceAccess`)

Same content/copy/conditions, restyled `auth-card`: `softBone` page
background, white card, `radius-lg`, soft shadow, logo lockup at top (real
asset, §8a), Instrument Sans `<h1>`, Source Sans 3 body, primary button per
§5.1.

### 5.7 Listing image manager

- Upload form: same fields (room `Select`, native file `<input
  type=file>`, attestation `Checkbox`), restyled per §5.4. The native file
  input keeps its native control (styling native file pickers consistently
  cross-browser is out of scope / not a brand issue) but gets a
  brand-styled surrounding label/container and a visible focus state.
- Image list: each row becomes a small card: room-label badge (§5.5 neutral
  style) + filename/thumbnail-less row (no thumbnail preview exists in code
  today — **not adding one**, see §8) + delete button (`subtle` appearance,
  semantic-error text on hover/focus only, not at rest, to avoid a
  permanently "alarming" delete control).
- Cap-reached / room-required / file-too-large / type-invalid messages: all
  route through the same inline field-error treatment (§5.4), not a full
  banner, matching current `<p className='field-error'>` placement.

---

## 6. Existing interactive element → redesigned treatment map

Every element below exists in code today; none is new, none is dropped.

| Existing element (file:approx.) | Component today | Redesigned treatment |
|---|---|---|
| Sidebar nav buttons (`portal-app.jsx`) | `Button appearance='subtle'` | §5.1 subtle + active-pill state |
| Language toggle / Sign out (`portal-app.jsx`) | `Button appearance='subtle'` | §5.1 subtle, bottom-pinned, unchanged position |
| Quick action buttons (`portal-app.jsx`) | `Button appearance='outline'` | §5.1 outline + icon chip |
| "Create property" form — all 16 fields (name, type, street, number, quartier, commune, city, province, country code, postal code, time zone, jurisdiction code, unit label, unit type, bedrooms, bathrooms, furnishing status) (`property-management-panel.jsx` `CreatePropertyForm`) | `Field`+`Input`/`Select` | §5.4 field styling, §4.3 grouped "Property details"/"First unit" sections, same single submit |
| "Add unit" toggle + form (label, type, bedrooms, bathrooms, furnishing) (`AddUnitForm`) | `Field`+`Input`/`Select`, collapsed-by-default `Button` | §5.4 fields; toggle button styled per §5.1 secondary |
| "Manage this unit" toggle + pricing form (amount, currency) (`UnitPricingAvailabilityForm`) | `Field`+`Input`/`Select` | §5.4 fields; amount validation message per §5.4 |
| Availability form (status select, conditional reason code) incl. occupied-lock note | `Field`+`Select`/`Input`, static `<p>` note | §5.4 fields; occupied note styled as quiet neutral caption, not an error |
| "Create/Edit listing" toggle + form (title, summary, attestation checkbox) (`PublicListingForm`) | `Field`+`Input`/`Textarea`/`Checkbox` | §5.4 fields; read-only published/withdrawn status view uses §5.5 badges |
| Listing image upload form (room select, file input, attestation checkbox) (`ListingImageManager`) | `Field`+`Select`, native file input, `Checkbox` | §5.7 |
| Listing image delete button per row | `Button appearance='subtle'` | §5.7 |
| Listing publication publish/withdraw button per row (`ListingPublicationPanel`) | `Button` (default appearance) | §5.1 primary (this is the key state-changing CTA per row) |
| "Sign in to continue" (both panels) | `Button appearance='secondary'` | §5.1 secondary |
| Feed retry buttons (both panels) | `Button appearance='secondary'` | §5.1 secondary |
| All `Spinner` busy indicators | `Spinner size='tiny'` | Unchanged component, recolored via theme (`mineralTeal` spinner stroke) |
| Property/unit/listing rows | Plain `<div>` rows | §4.3 cards |
| Status text (`.status` class) | Plain colored `<span>` | §5.5 badges |
| Demo/error/success feedback banners (both panels) | `.publication-feedback` | §5.2 |

---

## 7. Responsive & accessibility

### 7.1 Breakpoints (unchanged from current CSS, restyled only)

- **> 900px:** sidebar 248px fixed + 2-column content grid.
- **≤ 900px:** sidebar narrows to 205px; stats collapse to 2 columns;
  content grid collapses to 1 column; forms collapse to 1 column.
- **≤ 620px:** sidebar becomes a full-width top bar with horizontally
  scrollable nav (unchanged behavior); topbar stacks; stats 2-up.

### 7.2 Accessibility requirements (binding)

- All color pairings used for text must meet the ratios verified in §3.1.1;
  no new color combination may be introduced without a matching contrast
  check added to this table.
- Every interactive element keeps a visible 2px focus ring (§5.1); never
  `outline: none` without a replacement indicator.
- All existing `aria-label`, `role='alert'`/`role='status'`,
  `aria-labelledby`, and `role='list'`/`role='listitem'` usages in the
  current code are preserved as-is (redesign is presentation-only); the one
  proposed exception (demo-mode banner `role`, §5.2) is called out
  explicitly for confirmation, not silently changed.
- Minimum 40px touch targets (§3.3).
- Reduced motion: any new hover/focus micro-transitions (e.g. nav-active
  pill, banner accent bar) must respect `prefers-reduced-motion` — no
  motion is essential to understanding any state.
- Semantic HTML structure (headings, form labels, fieldset/legend grouping
  for the property-details/first-unit sections in §4.3) must remain
  screen-reader navigable; grouping is visual **and** structural
  (`fieldset`/`legend`), not CSS-only.

---

## 8. Open questions / assumptions requiring PO or engineering sign-off

These are explicitly **not** decided by this document:

a. **Logo asset usage.** `AppBrand` (`packages/ui/src/AppBrand.jsx`)
   currently renders text only, not the actual SVG assets cataloged in
   `packages/brand/src/assets.json` (wordmark/symbol/reversed variants
   exist but are unused). Since `AppBrand.jsx` is an existing shared file
   this redesign must not modify, the redesigned landlord shell needs its
   own brand-header component under
   `apps/portal-web/src/redesign/landlord/` that imports the real
   wordmark/symbol SVG via `assetPath()` — confirming this approach (new
   component, not modifying `AppBrand`) is a decision for the Frontend
   Engineer/Solution Architect, not silently assumed correct by this spec.
b. **Non-brand semantic status colors.** Confirmed approach in §3.1.2 uses
   Fluent's default success/error/warning palette (not a brand hex) since
   `packages/brand` defines none. Needs explicit PO/brand-owner
   acknowledgment that functional red/green may come from outside the
   four approved hexes.
c. **Font sourcing/licensing.** No web-font loading exists in
   `apps/portal-web` today (`styles.css` uses `Inter`/system-ui, not even
   the brand fonts). Actually self-hosting or licensing Instrument Sans and
   Source Sans 3 (both are open, Google-Fonts-available families, but
   confirm hosting method — self-hosted static assets vs. an external CDN
   `<link>`, which may have its own privacy/CSP implications) is an
   implementation decision, not covered here.
d. **Fluent `BrandVariants` ramp generation** (§2) — who generates/reviews
   the 16-step ramp derived from `mineralTeal`, and which step is pinned to
   the exact approved hex.
e. **Demo-mode banner `role` change** (`role='alert'` → `role='status'`,
   §5.2) — flagged as a proposed accessibility-semantics correction (a
   read-only demo notice is not an error), not yet confirmed against any
   existing test expectations.
f. **Icon set choice.** This spec uses icon *concepts* (info, warning,
   spinner, delete) but does not select a specific icon library. Fluent UI
   v9 ships `@fluentui/react-icons` as a natural, already-aligned choice
   (no new dependency), but confirming that (vs. a custom brand icon set,
   which does not currently exist) is an open decision.
g. **Illustration style for empty states.** §5.3 specifies a text-only
   quiet placeholder card with **no illustration**, since no brand
   illustration style exists today. If the PO wants illustrated empty
   states, that requires a new brand-asset decision, not assumed here.
h. **No Property edit capability** (confirmed **not** in scope). Per
   `REQUIREMENTS_GAPS.md`'s "No Property edit/update capability" row, no
   edit UI is designed for property name/address after creation — this
   spec does not design one, consistent with the task's explicit
   constraint.
i. **Offline state** (§5.3) — confirmed **not** added; flagged as a
   possible future capability, not decided here.
j. **Image thumbnails in `ListingImageManager`** (§5.7) — the current API
   returns no thumbnail/preview URL in the image-list response consumed by
   the panel; this spec keeps the list text-only. Adding thumbnails would
   need an API-shape confirmation first (out of this design task's
   authority).
k. **Flag name/mechanism** — this spec assumes the proposed
   `VITE_REDESIGN_ENABLED` flag from `REQUIREMENTS_GAPS.md` but that name is
   explicitly still "proposed, not confirmed" per that row; Frontend
   Engineer + PO own final naming.
l. **File location** (this note) — `docs/design/` does not exist; this file
   lives at `docs/product/LANDLORD_REDESIGN_SPEC.md` until someone with
   directory-creation capability relocates it, per the note at the top of
   this document.

---

## 9. Acceptance checklist for Frontend Engineer implementation review

- [ ] All new code lives under `apps/portal-web/src/redesign/landlord/`;
      zero lines changed in any existing file.
- [ ] Flag-gated; flag-off path renders byte-for-byte identical to today.
- [ ] Fluent UI v9 continues to be used; theme built from brand tokens per
      §2/§3.1, no ad hoc hex outside the documented brand palette + Fluent
      semantic status tokens.
- [ ] Every element in §6's map is present, calling the same existing
      hooks/API client functions (no reimplemented auth/session logic).
- [ ] All contrast pairings match §3.1.1's verified table.
- [ ] All states in §5.3 (loading/empty/error/success/denied) are
      implemented for every panel that has them today; no offline state
      added (§8i); no new denied state added beyond existing gates.
- [ ] Every open question in §8 has either been answered by the PO/owner
      named, or the implementation defers that specific piece rather than
      guessing.

---

## 10. Addendum — interaction design & information architecture (2026-09-24)

**Why this addendum exists.** The PO reviewed the initial spec and said the
redesign "should not only be about changing styling" — i.e. Sections 0–9
above (color, type, spacing, component skins, banner recoloring) are
necessary but not sufficient. The PO was unavailable for further
clarification, so this addendum extends the spec **conservatively**: it
improves *interaction design and information architecture for capabilities
that already exist today*, using only data already returned by existing API
calls. It adds **no new API calls, no new data views, no analytics
dashboards, and no property-edit capability** — those remain unapproved
gaps tracked in `REQUIREMENTS_GAPS.md` and are explicitly *not* reopened
here (see §10.6). Sections 0–9 are unchanged and still apply; this section
only adds to them.

### 10.1 "Add a property" — progressive grouped flow (not one flat form)

**Problem this fixes:** `CreatePropertyForm` (`property-management-panel.jsx`)
renders all 16 fields in one flat auto-fill grid submitted by a single
button. Even restyled per §5.4, 16 simultaneous fields read as
overwhelming — this is an interaction/IA problem, not a color problem.

**Fix (still one existing `POST properties` call, same payload shape,
same single component's submit handler — only the *presentation and
input sequencing* change):**

Reorganize the same fields into three visually and behaviorally distinct
**steps within the same form** (a "wizard-style" progressive disclosure,
not separate routes/pages, and not separate API calls):

| Step | Fields (unchanged from today) | Step heading (Instrument Sans, §3.2 subsection style) |
|---|---|---|
| 1. Property basics | `name`, `propertyType`, `timeZone`, `jurisdictionCode` (optional) | "Property basics" |
| 2. Address | `avenueOrStreet`, `number`, `quartier`, `commune`, `city`, `province`, `countryCode`, `postalCode` (optional) | "Address" |
| 3. First unit | `unitLabel`, `unitType`, `bedrooms`, `bathrooms`, `furnishingStatus` | "First unit" |

Interaction rules:
- Only the active step's fields are visible/focusable at a time; prior
  steps collapse to a compact one-line summary (e.g. "Property basics ·
  Apartment building · Africa/Kinshasa") with an inline "Edit" link back to
  that step — this keeps the DOM data model identical (`form` state object
  is unchanged) while reducing visual load.
  - A landlord may still see the full form as **one scrollable sequence**
    with clear step headers and progress indicator (e.g. "Step 2 of 3"),
    rather than a hard modal-per-step wizard — safer for accessibility
    (avoids trapping focus across route-like transitions) and simpler to
    implement without touching the existing single-submit handler.
- "Next" / "Back" are **client-side only** navigation between steps within
  the same open form; no partial submit, no draft persistence, no new
  endpoint. Client-side per-step required-field validation (already present
  via `required`) gates "Next" the same way HTML5 `required` already gates
  today's single submit.
- Final step's submit button remains the existing `create_property_submit`
  action and calls the exact same `onSubmit`/`submitCreateProperty`
  handler.
- This step grouping is presentation-only; it must not change the
  `emptyPropertyForm` shape, field names, or validation rules in
  `property-management-panel.jsx`.

**New locale keys needed** (content only, not UI logic — safe to add per
the PO's framing that locale files are content, not "existing UI"):
`property_management.create_property_step_1_title` ("Property basics"),
`_step_2_title` ("Address"), `_step_3_title` ("First unit"),
`property_management.create_property_step_label` ("Step {{current}} of
{{total}}"), `property_management.create_property_back` ("Back"),
`property_management.create_property_next` ("Next"). Flagged for the
Frontend Engineer to add to `apps/portal-web/src/locales/en.json` (and the
`fr.json` equivalent) — existing keys (`create_property_title`,
`create_property_submit`, all `field.*` keys) are unchanged and reused.

### 10.2 Overview — landlord's next-best-action as a checklist, using only existing data

**Problem this fixes:** today's Overview is two independent panels
(property management, listing publication) with no visual connection
between them, even though they represent one real workflow: *create a
property → price/make a unit available → add listing photos → publish*.
The PO's "not just styling" objection is exactly this: no dashboard/
analytics is being added (that remains excluded, §10.6), but the *existing*
data already fetched by `useRentalProperties` and `useManagerListings` is
enough to compute, client-side, "where is this landlord in the workflow"
and surface it as a **checklist**, not a new data view.

**Design:** add a single new card at the top of the Overview content grid
(above the existing property-management/listing-publication panels),
titled e.g. "Get your first listing live" (or, once at least one listing is
published, a lighter "Keep your listings up to date" framing — exact copy
is a new locale-key decision, not fixed here). It renders four checklist
rows, each **derived purely from data already in `properties`/`listings`
props already passed into these panels today** — no new fetch:

1. **Add a property** — done if `properties.length > 0`.
2. **Set pricing & availability** — done if any unit across `properties`
   has a pricing version set (i.e. `unit.currentPricing`/equivalent field
   already present in the unit shape returned today) — if the current
   payload does not actually expose a computed "has pricing" boolean per
   unit, this step must be inferred from whatever *already-returned* fields
   allow it (e.g. presence of a rent amount field) — **if no existing field
   can determine this without a new query, this checklist row must be
   marked "status unknown / open item" rather than guessed, and flagged
   back to the Frontend Engineer as a data-availability question — do not
   invent a new endpoint to answer it.**
3. **Add listing photos** — done if any listing has ≥1 image (from the
   already-fetched listing/image data used by `ListingImageManager` — note
   this may require the panel to already have fetched image counts, which
   today only happens per-listing when its manager is opened; if image
   count is not available at the Overview level without an extra fetch,
   mark this row "status unknown" for the same reason as above, do not add
   a new fetch to populate it).
4. **Publish the listing** — done if any listing has `status === 'published'`
   (directly available from `managerListings` today).

Each row is a simple checkbox-style list item (checked/unchecked icon +
label), not a progress bar with invented percentages. Clicking an
unchecked row scrolls to / opens the relevant existing control (e.g.
clicking "Set pricing & availability" scrolls to the property list and, if
exactly one property/unit exists, opens that unit's existing "Manage this
unit" toggle) — this is pure client-side UI orchestration of already-
rendered controls, not a new capability.

**Explicit constraint:** if any checklist row genuinely cannot be computed
from data the app already fetches without a new/changed query, that row
must render as an honest "status unknown" state (see §5.3 empty-state
tone) rather than a fabricated status — flagged as open question §10.6(a).

### 10.3 Friendlier microcopy for empty/error/demo-mode states

Keep all existing i18n **keys** and their conditions; this only proposes
**copy** changes (content, explicitly allowed per the PO's framing) plus a
short list of genuinely new keys where today's copy is purely technical/
absent a warmer alternative. All existing keys not listed below are
unchanged.

| Key | Current copy | Proposed friendlier copy | New key? |
|---|---|---|---|
| `property_management.empty_state` | "You have not created any properties yet. Use the form below to add your first property." | "Let's get your first property set up. Fill in the form below — it only takes a few minutes." | Reuse existing key, copy edit only |
| `listing_publication.empty_state_portfolio` | "No listings are currently assigned to you. Listings you are assigned to manage will appear here automatically." | "Once you create a listing from one of your units below, it will show up here for you to publish." | Reuse existing key, copy edit only |
| `property_management.demo_session` | "Demo portal sessions cannot create or manage properties. Sign in with Microsoft Entra before adding a property or unit." | "You're viewing a demo workspace, so changes can't be saved yet. Sign in with your real account to create and manage properties." | Reuse existing key, copy edit only |
| `listing_publication.demo_session` | "Demo portal sessions cannot change listing publication. Sign in with Microsoft Entra before sending publish or withdraw commands." | "You're viewing a demo workspace, so publishing changes can't be saved yet. Sign in with your real account to publish or withdraw listings." | Reuse existing key, copy edit only |
| `property_management.feed_error` / `listing_publication.feed_error` | "We couldn't load your properties/listings. This does not mean you have none — try again." | Keep as-is — already good, reassuring, non-alarming copy; no change needed. | — |
| *(new)* `property_management.listing_images_empty_helper` | *(none today — `listing_images_empty` is just "No photos uploaded yet.")* | Add a second, optional line under the existing empty copy: "Listings with photos get more attention — add at least one to get started." | **New key**, additive only, does not replace `listing_images_empty` |
| *(new)* `property_management.create_property_success_next_step` | *(none today)* | After `create_property_success` shows, optionally surface: "Next: set pricing and availability for your first unit below." | **New key**, purely additive copy, no logic/state change — flagged for Frontend Engineer, may be deferred if it complicates the success-message timeout logic already in `portal-app.jsx`'s `complete()` |

All proposed copy keeps the same tone register as existing strings (plain,
reassuring, non-technical) and the same `role='alert'`/`role='status'`
semantics already assigned in §5.2 — only the sentence text changes.

### 10.4 Visual chunking of related actions (grouping, not just recoloring)

Extends §5.7 (which only specified colors/shapes for the image manager) to
require actual **spatial/structural grouping** wherever today's DOM
already places related controls adjacent but undifferentiated:

- **Listing photo actions** (`ListingImageManager`): the upload form,
  the existing photo list, and any cap-reached messaging must render inside
  one visually bounded "Photos" card with its own heading — not just an
  inline `<div>` in the middle of the unit row as today. This is a
  container/grouping change, not a new control.
- **Unit management actions** (`UnitPricingAvailabilityForm`): pricing and
  availability are two separate existing forms rendered back-to-back today
  with no visual separator beyond a shared parent `<div>`. Group them under
  one "Manage this unit" card with two clearly labeled sub-sections
  ("Pricing" / "Availability", matching the existing
  `pricing_form_label`/`availability_form_label` keys) separated by a thin
  divider, so the two independent commands (`submitSetPricing` /
  `submitSetAvailability`) are visually distinguishable as separate actions
  even though they share a parent toggle.
- **Listing lifecycle actions** (`PublicListingForm` + its nested
  `ListingImageManager`): today these render as sibling elements inside the
  same `unit-row` grid cell. Group "Listing details" (title/summary/status)
  and "Listing photos" as two labeled sub-cards inside one outer "Public
  listing" card, so a landlord can see at a glance that editing content and
  managing photos are two related-but-distinct actions on the same listing.
- **Property vs. unit hierarchy**: extend §4.3's property-card design so
  the property card visually "contains" its unit cards with clear nested
  indentation/background-shade distinction (e.g. property card = white,
  unit sub-cards = `softBone`-tinted), reinforcing the one-property-has-
  many-units structure that today's flat `.unit-row` styling does not
  communicate.

None of this changes what data is fetched or which API calls exist — it is
strictly DOM/layout grouping of already-adjacent existing controls.

### 10.5 Summary of new locale keys required (for Frontend Engineer)

Additive only, to `apps/portal-web/src/locales/en.json` (+ `fr.json`):
`create_property_step_1_title`, `create_property_step_2_title`,
`create_property_step_3_title`, `create_property_step_label`,
`create_property_back`, `create_property_next`,
`listing_images_empty_helper`, `create_property_success_next_step`, plus
whatever checklist-card copy (§10.2) and checklist-row labels the Frontend
Engineer needs (exact strings not fixed here — placeholder names only:
`overview_checklist_title`, `overview_checklist_add_property`,
`overview_checklist_set_pricing`, `overview_checklist_add_photos`,
`overview_checklist_publish`, `overview_checklist_status_unknown`).

### 10.6 New open questions from this addendum (flag for PO sign-off)

m. **Checklist "has pricing" / "has photos" computability.** §10.2 items 2
   and 3 depend on whether the data already returned by
   `useRentalProperties`/`useManagerListings` (or data the panels already
   fetch once opened) actually exposes enough to compute those two
   checklist states client-side without a new/changed query. This needs a
   quick confirmation from the Frontend Engineer/API owner — if it's not
   already there, those two rows must render "status unknown," not a new
   endpoint.
n. **Checklist card copy and exact framing** ("Get your first listing
   live" vs. alternatives) is not fixed by this addendum — needs a content
   decision (PO or Frontend Engineer) using the new locale keys in §10.5.
o. **Wizard vs. single-scroll grouped form** (§10.1) — this addendum
   recommends a single scrollable form with collapsible step summaries
   (safer for accessibility, less implementation risk) over a hard
   multi-screen wizard. If the PO specifically wants a true multi-screen
   wizard experience, that is a materially different interaction pattern
   and should be confirmed rather than assumed.
p. **Whether this addendum satisfies the PO's "not just styling" concern
   at all**, given the conservative constraint (no new API calls, no new
   dashboards, no property-edit UI). If the PO's actual intent was a more
   substantial IA change requiring new data or capabilities, that is
   explicitly out of this addendum's authority and must come back as a new
   REQUIREMENTS_GAPS.md row and/or REQ document before any implementation
   proceeds in that direction — this addendum does not attempt to guess
   that larger scope.

**Explicitly excluded from this addendum (unchanged from the original
spec's constraints):** no property-edit UI; no new analytics/stats
dashboard; no new API endpoints or changed request/response shapes; no
occupancy/portfolio-health metrics beyond what's directly derivable from
already-fetched `properties`/`listings` arrays as booleans (done/not done),
never as computed aggregates presented as authoritative statistics.

---

## 11. Addendum — visual quality bar (2026-09-24, second PO review)

**Trigger.** The PO reviewed the implemented Phase 1 Landlord Overview
(`apps/portal-web/e2e/redesign/__screenshots__/flag-on-landlord-overview.png`)
and said plainly "I do not like this design," without further specifics,
and is unavailable for follow-up. This section is a judgment call: a
concrete, opinionated visual-quality revision, made because the PO asked
for one directly rather than another round of open questions. It does
**not** loosen any hard constraint — same Fluent UI v9, same four brand
hexes + two brand fonts, same additive/flag-gated
`apps/portal-web/src/redesign/landlord/` boundary, same "no new API call"
rule as §0 and §10.6. Sections 0–10 are unchanged; this section adds
implementation-grade visual direction on top of them.

### 11.1 Diagnosis — validated, and one correction to the PO's framing

I reviewed the actual screenshot before writing this. The PO's diagnosis is
**correct on every visual point** (flat, generic, dead whitespace, thin
hierarchy, no depth, no distinctive color usage) — but it has **two
different root causes that need different fixes**, and conflating them
would lead to only cosmetic tweaking of the wrong problem:

1. **A genuine layout defect, not a taste problem.** The "Listing
   Publication" card and the "Property Portfolio" card sit as two CSS-grid
   siblings in the same row. Grid's default `align-items: stretch` forces
   both cards to the height of the *tallest* one — and the Property
   Portfolio card is tall only because it contains the entire 16-field
   "Add a property" form. The Listing Publication card has almost no
   content (an empty-state sentence) and is being stretched to match,
   producing the large dead vertical space visible in the screenshot. This
   is a one-line CSS bug (`align-items: start` / `align-self: start` on the
   grid children), not a color or typography problem, and it should be
   fixed **first**, independent of everything else in this section — see
   §11.4, item 1.
2. **A real visual-maturity gap**, which this section addresses: no
   elevation system, thin/uncommitted typographic hierarchy, uniform flat
   white-on-cream color usage, and Fluent's out-of-the-box component
   styling reading as a generic admin form rather than a premium product.
   This is the part that actually requires new design direction, not a bug
   fix.

I'd also push back gently on one implicit assumption: the problem is not
that "not enough brand color was used." Looking at the screenshot, brand
color is already present (aubergine sidebar/headings, copper kickers/
badges/quick-action chips) — the flatness comes from *everything else*
being pure white or pure `softBone` with no tonal layering, not from a lack
of the palette itself. The fix is depth and layering technique, not adding
more hue.

### 11.2 Reference direction (technique, not branding)

Per the task's own framing, these are **cited for technique**, not for
copying Stripe/Linear/Vercel's own colors, wordmarks, or layouts:

- **Stripe dashboard:** two-layer soft shadows (`ambient + key`), generous
  but *purposeful* card padding that scales with actual content, small
  colored left-icon chips on list rows, a subtle top-of-page gradient wash
  behind the header instead of a flat color cutoff.
- **Linear:** high typographic confidence — tight, deliberate line-heights,
  a restrained single-accent-color system (their purple ≈ our
  `mineralTeal`'s role), and sidebar nav where the *inactive* items are
  visually quieter (lower opacity/weight) so the active item actually reads
  as active, rather than every nav item competing at full brightness.
- **Vercel dashboard:** consistent card anatomy (thin colored top accent
  bar + icon + title + one-line meta), hover-elevation-only feedback
  (shadow deepens on hover, not a full recolor), dense but readable data
  rows.

### 11.3 Concrete visual system changes

These are specific, numeric, implementable — not stylistic suggestions to
interpret freely.

**Elevation & surfaces (replaces §3.4's flatter version):**
- Card shadow, two layers (ambient + contact), both derived from
  `aubergine` (no new hue): `0 1px 2px rgba(36,22,46,0.04), 0 12px 32px
  rgba(36,22,46,0.10)`. Hairline border stays but softens to `1px solid
  rgba(36,22,46,0.06)` (border now supports the shadow instead of doing
  all the separation work alone).
- Hover/focus-within elevation step for any card containing an interactive
  primary action (e.g. the checklist card, a unit row about to be
  expanded): shadow deepens to `0 20px 48px rgba(36,22,46,0.14)` with a
  150ms ease transition (respect `prefers-reduced-motion`, §7.2).
- Card radius increases from `radius-lg: 16px` to **20px** — reads as more
  considered/premium at this card size (matches Stripe/Linear's larger
  card radii relative to their smaller button/input radii, creating a
  deliberate radius *hierarchy*: buttons/inputs 8–10px, cards 20px, not the
  same radius everywhere).
- Every card gets a **3px colored top accent bar** (not a border — an
  actual filled strip along the card's top edge, full width, radius-matched
  corners) whose color signals the card's *category*, giving instant visual
  scanability without needing to read the kicker text:
  - `mineralTeal` — action/workflow cards (the next-best-action checklist,
    listing publication).
  - `burnishedCopper` — portfolio/inventory cards (property portfolio,
    quick actions).
  - `aubergine` (10% tint fill behind full-strength 3px bar) — informational/
    activity cards ("Needs your attention").
- Page background gets one subtle addition: a soft radial wash of
  `mineralTeal` at 4–6% opacity anchored top-right behind the topbar/user
  chip, fading to `softBone` within ~320px — not a visible "gradient block,"
  a barely-there tonal shift that keeps the very top of the page from
  reading as a flat color cutoff between sidebar and canvas. No new hex;
  implemented as an alpha-blended `mineralTeal` over `softBone`.

**Typography (tightens §3.2, does not replace it):**
- Hero `<h1>` line-height tightens from 1.1 to **1.05**, and the gap
  between `<h1>` and the subtitle `<p>` shrinks from whatever whitespace
  Fluent/browser defaults currently produce to a fixed `space-2` (8px) —
  the screenshot shows a hero heading followed by a large, uncontrolled gap
  before the subtitle; that gap must be an intentional, small, fixed value,
  not incidental margin collapse.
- Add a **thin 2px `mineralTeal` rule, 32px wide**, directly under the
  eyebrow/kicker label (above the `<h1>`) on the topbar only — a small,
  confident graphic device (seen in the reference products) that breaks up
  the current "text sitting alone in space" feeling without adding a new
  color.
- Kicker labels (`.kicker`) get a **filled pill background** (their brand
  color at 12% opacity, e.g. copper-tinted or teal-tinted depending on
  card category from §11.3's accent-bar mapping) instead of being bare
  colored text floating on white — this is the single highest-leverage
  typography-adjacent change for "premium" perception, because it turns a
  label into a designed component instead of styled text.
- Sidebar nav hierarchy: inactive nav items drop from full-opacity bold
  white text to **70% opacity, regular (not bold) weight**; the active
  item keeps 100% opacity, `600` weight, and its existing teal-tinted
  background pill. Today's screenshot shows every nav item at the same
  visual weight, which is why the sidebar reads as a flat list rather than
  a wayfinding system.

**Density & dead-space elimination (the concrete fix for "huge blank
vertical gaps"):**
1. **Grid alignment fix (do this regardless of anything else — highest
   priority, smallest effort):** set `align-items: start` on
   `.content-grid` and any other multi-card CSS grid row, so a short card
   never stretches to match a tall sibling. This alone removes most of the
   visible dead space in the current screenshot.
2. **Reflow the Property Portfolio / Listing Publication pairing.** Putting
   a 16-field form directly beside a near-empty status card was always
   going to mismatch, independent of the stretch bug. Restructure so:
   - The "Add a property" form (§10.1's 3-step version) renders as its own
     **full-width card** below a **row of compact status cards**, not
     squeezed into a narrow right-hand column next to the form's own
     property/unit list.
   - Listing Publication becomes a **compact status card** (title + one
     short line + a single badge/count, e.g. "0 listings assigned") when
     it has no rows to show, rather than a full-height card with a huge
     blank body reserved for a `rows`/`role='list'` region that isn't
     rendering anything yet. Once listings exist, the card naturally grows
     to fit its row list — height should always be **driven by content**,
     never fixed to match a sibling.
3. **Empty-state dashed placeholder** (the "Portfolio, occupancy, and
   collections summaries..." box, §5.3) shrinks from a tall box to a
   **single compact row** (icon + one line of text, ~56px tall) — it is
   informational filler, not a content region, and should not visually
   compete for the same vertical weight as a real data card.
4. **Reduce card internal padding when content is a single line/sentence**
   (e.g. empty states, compact status cards) to `space-4` (16px) instead of
   the standard `space-5` (24px) card padding used for content-bearing
   cards — matches Stripe's "padding scales with content" pattern rather
   than one fixed padding for every card regardless of what's inside it.

### 11.4 Fluent UI v9 — where its defaults must be explicitly overridden

Fluent v9's un-opinionated defaults (thin 1px neutral-gray borders,
`webLightTheme`'s conservative shadow tokens, moderate corner radius,
default spacing density) are tuned to look correct in *generic* enterprise
tools, not to read as "premium real-estate SaaS." Confirmed
overrides needed (all via the theme object / `makeStyles`, not inline
one-off hacks, so they stay centralized and reusable):

- Override `colorNeutralShadowAmbient`/`colorNeutralShadowKey` (or apply
  custom `boxShadow` via `makeStyles` if the semantic shadow tokens can't
  be cleanly remapped) with the two-layer shadow values from §11.3 — do
  not rely on Fluent's default `shadow4`/`shadow8` tokens, which read as
  the "flat bordered box" look the PO is reacting to.
  - Do not select a Fluent density preset as a substitute for this
    layout work — Fluent v9 does not ship a single "spacing density"
    toggle akin to a table-density switch; the padding/whitespace fixes in
    §11.3's "density" subsection must be applied directly via `makeStyles`
    overrides on each redesigned component, not assumed to come from a
    theme-level density flag.
- `Button` (`primary` appearance): Fluent's default primary button is a
  flat, single-shade fill. Add a subtle **inset top highlight** (`inset 0
  1px 0 rgba(255,255,255,0.16)` over the `mineralTeal` fill) and the §11.3
  card-shadow's smaller/ambient layer only (not the full card shadow) so
  buttons feel tactile/pressable rather than flat-painted.
- `Input`/`Select`/`Textarea`: Fluent's default border is a thin neutral
  gray at rest, which is why the "Add a property" fields in the screenshot
  read as bureaucratic-form-gray rather than on-brand. Confirm the theme
  override actually reaches these components' resting-state border (not
  only focus state) — resting border should be the `aubergine`-tint from
  §5.4, not Fluent's neutral default; verify this in the browser, since a
  common integration mistake is only overriding focus/hover tokens and
  leaving the resting/default token unmapped.
- Do not disable Fluent's built-in focus-visible ring when adding the
  hover-elevation treatments above — hover and focus are different states
  and both must remain visually distinct per §7.2.

### 11.5 What I am *not* recommending, and why

- **Not** a background image, illustration, or photography treatment —
  §8g already deferred illustration style as a brand-asset decision the PO
  hasn't made; nothing here should be read as quietly resolving that in
  the "add more visual richness" direction. The gradient wash in §11.3 is
  a tonal technique, not imagery.
- **Not** a wholesale dark-mode or dark-canvas main content area — the PO's
  reaction was to flatness/emptiness, not to the light canvas itself, and
  a full dark redesign would be a materially bigger scope change than "fix
  the visual quality bar," so it isn't proposed here.
- **Not** a new component library or CSS framework — §2's Fluent v9
  decision stands; §11.4 is about overriding Fluent's defaults more
  deliberately, not replacing them.

### 11.6 Implementation checklist (append to §9)

- [ ] `align-items: start` applied to `.content-grid` and any sibling card
      grid (§11.3 density item 1) — verify no card visually stretches to
      match a taller sibling.
- [ ] Property/unit "Add a property" form reflowed to full-width, decoupled
      from sitting directly beside the Listing Publication card (§11.3
      density item 2).
- [ ] Two-layer card shadow + 20px card radius + 3px category-colored top
      accent bar implemented via the theme/`makeStyles`, not inline styles.
- [ ] Kicker labels rendered as filled tinted pills, not bare colored text.
- [ ] Sidebar inactive-nav-item opacity/weight reduced relative to the
      active item.
- [ ] Empty-state placeholder boxes shrunk to single compact rows; card
      padding reduced for single-line/status-only cards.
- [ ] Confirmed (in-browser, not just in the theme object) that `Input`/
      `Select`/`Textarea` resting-state borders use the brand-tint color,
      not Fluent's default neutral gray.
- [ ] Button tactile inset-highlight + ambient shadow applied to `primary`
      appearance only (not every button variant).
- [ ] Screenshot re-captured and compared side-by-side against
      `flag-on-landlord-overview.png` before requesting the next PO review,
      so the specific defects named here (dead space, flatness, hierarchy)
      are demonstrably addressed rather than re-submitting a variation on
      the same defects.
