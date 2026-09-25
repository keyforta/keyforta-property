# Manager Portal Redesign — UX/Visual Design Spec (Phase 2)

Status: **Implemented (PR #137), flag-gated behind `VITE_REDESIGN_ENABLED`.**
Full Product Owner sign-off on the broader "Redesigned per-role UI/UX"
initiative remains pending (`docs/engineering/REQUIREMENTS_GAPS.md`); this
phase proceeded under the same Solution-Architect-approved bounded/
additive/flag-gated exception Phase 1 (Landlord) already shipped under.
This is the Phase 2 design artifact called for by
`docs/engineering/REQUIREMENTS_GAPS.md` →
"Redesigned per-role UI/UX with KEYFORTA branding," whose recorded phasing
is "Landlord first ... then Manager, then Tenant, then Admin." Phase 1
(Landlord) is implemented and merged (PR #134/#135) under
`apps/portal-web/src/redesign/landlord/`, gated by the same
Solution-Architect-approved bounded/additive/flag-gated exception recorded
there. That exception — and this document's authority — covers **design
only**; Product Owner sign-off on the redesign initiative as a whole is
still pending (see that row). Implementation ownership for this spec is
the Frontend Engineer, inside a new, isolated
`apps/portal-web/src/redesign/manager/` directory, following the exact
additive boundary already proven for Landlord (§9 below, mirroring
`LANDLORD_REDESIGN_SPEC.md` §9).

Scope owner: UX Designer (this document). This spec **reuses** the
Landlord spec's design tokens, brand rules, accessibility requirements, and
several shared components **by reference** — it does not restate or
re-derive them, and it does not invent a different visual language for
Manager. One coherent KEYFORTA design system spans both roles.

File location note: placed under `docs/product/` for the same reason
recorded at the top of `docs/product/LANDLORD_REDESIGN_SPEC.md` (no
`docs/design/` directory exists yet, and directory creation is outside this
session's tooling).

---

## 0. What this redesign is and is not

**Is:** a presentation-layer redesign of the *existing* Manager
capabilities as implemented today — the same data, same API calls, same
auth/session hooks, same states — with the same professional, on-brand
visual system already designed and implemented for Landlord, applied to
Manager's (narrower) surface.

**Is not:** a new feature, and **not** a widened Manager surface. A
Manager today gets strictly less than a Landlord: no property/unit
creation, no pricing/availability control (`PropertyManagementPanel` is
landlord-only — see §1). This spec designs **only** what
`apps/portal-web/src/portal-app.jsx` already grants a Manager: the
`ListingPublicationPanel` (publish/withdraw actions on listings a landlord
has assigned them to manage) and the generic Overview/other-nav-tab
scaffolding every role shares. Section 6 maps every existing Manager
interactive element so none is silently dropped or expanded in scope.
Section 8 flags everything that looks like a gap but is **not** approved
to add — most importantly, this document does **not** propose giving
Manager any property-creation, pricing, or availability capability; if
that is ever wanted, it is a product/authorization decision for
`REQUIREMENTS_GAPS.md`, not a design decision made here.

---

## 1. Reviewed source of truth

Read in full (or by targeted section) before writing this spec:

- `docs/product/LANDLORD_REDESIGN_SPEC.md` (all sections, including its
  two addenda) — the sibling, already-implemented spec whose tokens, brand
  rules, component treatments, and accessibility requirements this
  document reuses verbatim. Treat that document as authoritative for
  anything not explicitly restated or varied here.
- `apps/portal-web/src/redesign/landlord/` (implemented code) —
  `LandlordShell.jsx`, `theme.js`, `checklist.js`, `redesign.css`,
  `components/StatusBadge.jsx`, `components/NextBestActionChecklist.jsx`,
  `components/BrandHeader.jsx`. Confirmed these are the real, shipped
  artifacts (not just spec prose) that this document proposes reusing.
- `apps/portal-web/src/portal-app.jsx` (`roleNavKeys.manager`, `Portal()`'s
  `showListingPublication`/`showPropertyManagement` gating,
  `legacyWorkspace` JSX) — confirmed:
  - `roleNavKeys.manager = ['overview', 'portfolio', 'applications',
    'occupancy', 'payments', 'workOrders', 'documents', 'messages']` — 8
    nav items, only the first two (`overview`, `portfolio`) have a
    dedicated panel today; the other six render only the shared generic
    empty-state copy (identical mechanism to Landlord's non-implemented
    tabs, `LANDLORD_REDESIGN_SPEC.md` §4.1).
  - `showListingPublication = (roleKey === 'manager' && (active ===
    'portfolio' || active === 'overview')) || (roleKey === 'landlord' &&
    ...)` — Manager sees `ListingPublicationPanel` on `overview` and
    `portfolio` only.
  - `showPropertyManagement = roleKey === 'landlord' && ...` — **Manager
    never** sees `PropertyManagementPanel`, confirming Manager cannot
    create properties/units or set pricing/availability. This is a hard,
    already-implemented authorization/product boundary this spec must not
    blur.
  - `listingPublicationEmptyState` resolves to
    `t('listing_publication.empty_state_portfolio')` when `active ===
    'portfolio'` (or `'properties'` for landlord) — same string Manager
    and Landlord's portfolio view share today.
- `apps/portal-web/src/listing-publication-panel.jsx` — the single
  component Manager's redesigned surface wraps. Confirmed states: feed
  loading/error/empty, per-listing publish/withdraw command with
  `tokenStatus` gates (`demo`, `organization-unavailable`,
  `sign-in-required`, `unavailable`, `loading`, `ready`), busy/spinner state
  per row, success/error message banners, `rejected_base_url` config error.
  No pricing, no unit, no property field anywhere in this file — Manager's
  entire mutable surface is exactly these publish/withdraw commands.
- `packages/brand/src/index.js` — same four approved brand hexes and two
  brand fonts as Landlord; no Manager-specific brand variant exists or is
  proposed.
- `apps/portal-web/src/locales/en.json` — exact copy for every Manager-
  visible state string referenced below (kept as-is; this is a visual/IA
  spec, not a content rewrite, mirroring Landlord's rule).
- `docs/engineering/REQUIREMENTS_GAPS.md` → "Redesigned per-role UI/UX
  with KEYFORTA branding" — confirms the approved bounded scope (additive,
  flag-gated, inside `apps/portal-web`, reusing existing hooks, no API/
  authorization changes, Manager phase after Landlord) that this spec must
  stay inside.

---

## 2. Technology & design-token decision: full reuse, no new decisions

**No new technology decision is made here.** Manager continues on Fluent
UI v9, themed with the same brand tokens, per
`LANDLORD_REDESIGN_SPEC.md` §2. Specifically reused **as-is, unmodified**:

- `apps/portal-web/src/redesign/landlord/theme.js` — the generated
  16-step `mineralTeal` brand ramp (anchored at step 80 to the exact
  approved hex, per that file's documented mix table) and the
  `landlordRedesignTheme` object's Fluent-default overrides (resting
  border tokens, etc., §11.4 of the Landlord spec). There is nothing
  Landlord-specific in this theme object's *values* — it is the KEYFORTA
  brand theme, not a Landlord-only theme. See §8(a) for the one open
  question this raises (where the shared theme should physically live).
- §3 (design tokens: color usage rules and WCAG table, typography scale,
  spacing/sizing scale, elevation/surfaces) — reused verbatim, no
  Manager-specific variant. Every contrast pairing, font, spacing step,
  and radius value in Landlord §3 applies unchanged to every Manager
  screen designed below.
- §11 (visual-quality-bar addendum: two-layer shadows, 20px card radius,
  3px category-colored top accent bar, kicker pills, sidebar
  inactive/active nav weighting, grid `align-items: start`, content-driven
  card height) — reused verbatim. Manager's cards use the same accent-bar
  category mapping (`mineralTeal` = action/workflow cards,
  `burnishedCopper` = portfolio/inventory cards, `aubergine` tint =
  informational/activity cards) — see §4 below for which Manager card gets
  which category.

**Nothing in this document introduces a new hex, a new font, a new
spacing/radius value, or a new shadow recipe.** Where this spec differs
from Landlord, it differs only in **information architecture** (which
screens/components exist at all for this narrower role), never in the
underlying design-system tokens.

---

## 3. Component reuse vs. new components

### 3.1 Reused directly, unmodified (import, don't fork)

| Component | Source | Manager usage |
|---|---|---|
| `StatusBadge` | `apps/portal-web/src/redesign/landlord/components/StatusBadge.jsx` | Listing status pills (`draft`/`published`/`withdrawn`) in the redesigned Portfolio/Overview listing rows — identical badge semantics to Landlord's listing rows (Landlord §5.5), since both roles render the exact same `ListingPublicationPanel` status vocabulary. |
| `BrandHeader` (`LandlordBrandHeader`) | `apps/portal-web/src/redesign/landlord/components/BrandHeader.jsx` | Sidebar/auth-card logo lockup. **Rename note (§8b):** this component is currently named/exported as landlord-specific (`LandlordBrandHeader`, file path `redesign/landlord/`). It renders no landlord-specific content — it is the KEYFORTA wordmark, full stop — so it is a candidate for extraction to a shared, role-neutral location before Manager imports it. Flagged as an open question for the Frontend Engineer/Solution Architect, not decided here (see §8a). |
| Fluent theme (`landlordRedesignTheme` / `mineralTealRamp`) | `apps/portal-web/src/redesign/landlord/theme.js` | `FluentProvider` theme for the Manager redesign subtree — same reasoning as `BrandHeader` above; not Landlord-specific content, just currently Landlord-located. See §8a. |
| Banner / inline-feedback treatment (§5.2 of Landlord spec) | Landlord spec §5.2 (design rules, not a single exported component — implemented inline in `LandlordShell.jsx` per state) | Every `tokenStatus`/`messageTone` state `ListingPublicationPanel` already renders (loading, demo, organization-unavailable, sign-in-required, unavailable, feed-error, success, error) gets the identical redesigned banner treatment Landlord already ships for the same states in its own portfolio view. |
| Empty/loading/error/offline/denied canonical treatment (§5.3 of Landlord spec) | Landlord spec §5.3 | Applied to every Manager-visible state — see §5 below for the exact mapping. |
| Form field styling rules (§5.4) | Landlord spec §5.4 | N/A directly (Manager's only "form-like" controls are the publish/withdraw `Button` per row — there is no `Field`/`Input` form anywhere in `ListingPublicationPanel`), listed here only so the Frontend Engineer knows there is nothing to apply it to; not a gap. |
| Auth screens (`LoginGate`, `PendingWorkspaceAccess`) restyled `auth-card` (§5.6) | Landlord spec §5.6 | Identical reuse — these screens render before role is even known to matter, so Manager and Landlord share the exact same restyled auth-card, unmodified. |

### 3.2 New component(s) specific to Manager

**None are required for the narrow scope this spec covers.** Manager's
entire dedicated-panel surface (`ListingPublicationPanel`) is a strict
subset of what Landlord's `LandlordShell` already renders and styles
(Landlord already renders `ListingPublicationPanel` restyled per its own
§4.2/§4.3/§5.2). A `ManagerShell.jsx` is needed as an **assembly/layout**
component (mirroring `LandlordShell.jsx`'s role of wiring nav, topbar,
content grid, and panel props together) but it introduces no new visual
component, badge, banner, or interaction pattern beyond what §3.1 lists.

One **content-level** open question, not a new *component*, is deferred to
§8c: whether Manager gets a next-best-action checklist card at all (see
§4.2), and if so, whether it reuses `NextBestActionChecklist.jsx` with
different computed steps or is simply omitted. No new checklist UI
component is proposed here independent of that decision.

---

## 4. Information architecture & layout

### 4.1 App shell (applies to every Manager screen)

Unchanged structural IA from today (left sidebar + main content, same as
Landlord §4.1), restyled per the same rules, with these Manager-specific
differences:

- **Sidebar nav** uses `roleNavKeys.manager`'s 8 items, in order:
  `Overview, Portfolio, Applications, Occupancy, Payments, Work orders,
  Documents, Messages` (exact labels come from `roles.manager.nav` i18n,
  unchanged) — **no new nav items**, same as Landlord's rule. Only
  `Overview` and `Portfolio` have a dedicated panel; the remaining six
  render the shared generic stats/rows empty-state copy, styled exactly
  per Landlord §4.1's rule for its own non-implemented tabs ("keeps that
  same generic empty-state treatment ... rather than inventing new panels
  for them") — the same non-decision applies here, unchanged, not
  reconsidered.
- **Sidebar eyebrow**: Manager's own `roles.manager.eyebrow` i18n string
  (unchanged copy), rendered in the identical restyled sidebar treatment
  (§3.4 surfaces, §11.3 inactive/active nav-item weighting) as Landlord.
- **Topbar**: same structure — eyebrow + `<h1>` title (Manager's
  `roles.manager.title`/`roles.manager.summary` on Overview, or the active
  section's translated label elsewhere) + user chip. Unchanged.
- **Content grid**: same unchanged 2-column desktop layout / 1-column
  ≤900px collapse as Landlord §4.1/§7.1 — no new breakpoint behavior.

### 4.2 Overview screen

Narrower than Landlord's Overview because only one dedicated panel exists
for Manager, not two:

1. **Stats strip** — identical treatment to Landlord §4.2 item 1: a single
   full-width quiet placeholder card using `roles.manager.stats_empty_state`
   i18n copy (same mechanism, different string, no invented stat tiles).
2. **Content grid**:
   - Left: **only** `ListingPublicationPanel` renders here (per
     `showListingPublication`'s manager branch) — restyled as a bordered
     card per Landlord §4.4/§5.2's listing-row treatment, **plus** the
     "Needs attention" activity panel (currently always empty-state,
     identical shared treatment to Landlord). There is no
     `PropertyManagementPanel` sibling card to reflow around (Landlord
     §11.3 item 2's "Property Portfolio vs. Listing Publication pairing"
     problem does not arise for Manager, since there is only ever the one
     panel in this slot) — so the specific grid-stretch bug Landlord's
     §11.1 diagnosed does not apply here by construction. The
     `align-items: start` grid rule (Landlord §11.3 item 1) should still be
     applied defensively (e.g. so the "Needs attention" empty-state card
     never stretches to match a taller populated `ListingPublicationPanel`
     card), but there is no known live defect to fix — a preventive
     carry-over, not a bug-fix requirement.
   - Right (aside): "Quick actions" panel — same `actions.manager` i18n
     action list, restyled per Landlord §5.1 outline-button + icon-chip
     treatment; API boundary footnote, unchanged copy/placement.
3. **Next-best-action checklist card** — **not designed here; open
   question, §8c.** Landlord's Overview (per its addendum §10.2) has a
   checklist card computed from `properties`/`listings` data
   (`addProperty`/`setPricing`/`addPhotos`/`publishListing` steps). None of
   the first three steps are Manager actions — Manager doesn't create
   properties, set pricing, or (per confirmed scope) manage photos through
   a capability of their own; those are Landlord/`PropertyManagementPanel`
   actions. Reusing the same four-step checklist verbatim for Manager
   would misrepresent what Manager can actually do. This spec does **not**
   invent a Manager-specific replacement checklist (e.g. "publish your
   first assigned listing" as a single-item checklist) without PO
   confirmation that a checklist card is even wanted for a role whose
   entire actionable surface is one command (publish/withdraw) — see §8c.

### 4.3 Portfolio screen (`active === 'portfolio'`)

The Manager-equivalent of Landlord's "Properties" screen, but strictly
narrower — this is Manager's **primary, focused** view:

- **Only** `ListingPublicationPanel` renders (the "Needs attention"/
  quick-actions aside continues to render exactly as it does on Overview,
  since `active === 'portfolio'` also satisfies the `showListingPublication`
  gate — same structural rule as Landlord's `active === 'properties'`
  case).
- **Listing rows**, restyled as compact cards (Landlord §4.3's
  property-card visual language does **not** apply here — there is no
  property/unit hierarchy in this panel, only a flat list of assigned
  listings), each row containing:
  - Listing title (body-strong) + listing ID (small/meta) — unchanged
    fields, from `listing-publication-panel.jsx`'s existing `listing.title`/
    `listing.id`/`listing.note` rendering.
  - **Status badge** (`StatusBadge`, §3.1 above) mapped per Landlord §5.5's
    existing badge-color table: `draft` → neutral, `published` → positive
    (Fluent semantic-success tint), `withdrawn` → negative (Fluent
    semantic-error tint). No new status values are introduced.
  - The existing single publish/withdraw `Button` per row, styled per
    Landlord §5.1 primary-button treatment (Landlord §6 explicitly calls
    this out as "the key state-changing CTA per row" for the shared
    component — same CTA, same styling, for Manager).
- **Empty portfolio state**
  (`listing_publication.empty_state_portfolio`): the Landlord §5.3 neutral
  dashed-border placeholder-card treatment, unchanged copy, unchanged
  condition.
- No "Add a property"/unit-management/pricing content anywhere on this
  screen — confirmed not in scope (§0, §1).

### 4.4 Non-implemented nav tabs (Applications, Occupancy, Payments, Work orders, Documents, Messages)

Identical non-decision to Landlord §4.1's equivalent six tabs: styled per
the shared generic stats/rows empty-state treatment (§5.3), **no dedicated
panel is designed for any of these** in this spec. If/when a dedicated
panel is built for any of these tabs, it needs its own IA/component design
pass (and, per §0, may itself require new product-authorization decisions
this spec does not make).

---

## 5. Component treatment — Manager-specific application of Landlord §5

All rules below are the same rules as `LANDLORD_REDESIGN_SPEC.md` §5,
applied to Manager's narrower element set. No new visual rule is
introduced; this section exists only to make the state-by-state mapping
explicit and auditable for a Frontend Engineer who has not read every line
of the Landlord spec.

| State / element | Landlord spec rule reused | Manager application |
|---|---|---|
| Sidebar nav buttons, language toggle, sign-out | §5.1 subtle / active-pill | Identical, `roleNavKeys.manager` items |
| Quick action buttons | §5.1 outline + icon chip | Identical, `actions.manager` i18n list |
| Listing publish/withdraw button | §5.1 primary | Identical — same component, same handler, same styling |
| "Sign in to continue" (`ListingPublicationPanel`) | §5.1 secondary | Identical |
| Feed retry button | §5.1 secondary | Identical |
| `tokenStatus === 'loading'` / feed loading | §5.2 informational banner | Identical (`role='status'`) |
| `tokenStatus === 'demo'` | §5.2 quiet informational banner, `role='status'` (Landlord's proposed semantics change, still open per Landlord §8e) | Identical — this spec does **not** independently re-decide the `role='alert'`→`role='status'` question; it inherits whatever the Landlord spec's open question §8e ultimately resolves to, applied consistently to Manager's identical `tokenStatus === 'demo'` state in the same file |
| `organization-unavailable` / `unavailable` / `sign-in-required` / rejected base URL / feed error | §5.2 error banner, `role='alert'` preserved | Identical |
| Success message (`published_success`/`withdrawn_success`) | §5.2 semantic-success banner, `role='status'` | Identical |
| Error message (`update_failed`, `not_found`) | §5.2 semantic-error banner, `role='alert'` | Identical |
| Listing status badges | §5.5 badge table | Identical mapping (draft/published/withdrawn only — Manager never sees the property-type/unit-type/availability badge variants, since those only exist in `PropertyManagementPanel`, which Manager never renders) |
| Empty/loading/error/denied canonical states | §5.3 | Identical; **no offline state** (same explicit non-decision as Landlord §5.3/§8i — not revisited here) |
| `PendingWorkspaceAccess` / `LoginGate` | §5.6 `auth-card` | Identical, shared screens |

---

## 6. Existing interactive element → redesigned treatment map

Every element below exists in code today; none is new, none is dropped.
This mirrors `LANDLORD_REDESIGN_SPEC.md` §6, scoped to Manager's actual
surface.

| Existing element (file:approx.) | Component today | Redesigned treatment |
|---|---|---|
| Sidebar nav buttons (`portal-app.jsx`, `roleNavKeys.manager`) | `Button appearance='subtle'` | §5.1 subtle + active-pill state |
| Language toggle / Sign out (`portal-app.jsx`) | `Button appearance='subtle'` | §5.1 subtle, bottom-pinned |
| Quick action buttons (`portal-app.jsx`, `actions.manager`) | `Button appearance='outline'` | §5.1 outline + icon chip |
| Listing publish/withdraw button per row (`listing-publication-panel.jsx`) | `Button` (default appearance) | §5.1 primary — the key state-changing CTA |
| "Sign in to continue" (`ListingPublicationPanel`) | `Button appearance='secondary'` | §5.1 secondary |
| Feed retry button (`ListingPublicationPanel`, `onRetryFeed`) | `Button appearance='secondary'` | §5.1 secondary |
| All `Spinner` busy indicators (token resolving, feed loading, per-row saving) | `Spinner size='tiny'` | Unchanged component, recolored via shared theme (`mineralTeal` spinner stroke) |
| Listing rows (`listing-row` div) | Plain `<div>` rows, `role='listitem'` | Compact listing card, §4.3 |
| Status text (`.status` span) | Plain colored `<span>` | `StatusBadge`, §5.5 mapping |
| All `.publication-feedback` banners (loading/demo/org-unavailable/sign-in-required/unavailable/feed-error/success/error) | `.publication-feedback` class | §5.2 banner treatment, per §5's state table above |
| "Needs attention" activity panel (`portal-app.jsx`, shared/generic) | Plain empty-state `<p>` | §5.3 neutral empty-state card |
| Non-implemented nav tabs' generic stats/rows empty state | Plain empty-state `<p>` | §5.3 neutral empty-state, §4.4 |

---

## 7. Responsive & accessibility

Fully reused, unchanged, from `LANDLORD_REDESIGN_SPEC.md` §7 (breakpoints
at >900px / ≤900px / ≤620px, all binding accessibility requirements:
contrast table, visible focus rings, preserved `aria-label`/`role`
semantics, 40px touch targets, `prefers-reduced-motion` respect, semantic
HTML structure). No Manager-specific variance — Manager's screens contain
a strict subset of the interactive elements Landlord's screens already
satisfy these requirements for, so no new accessibility case is
introduced. The one exception already flagged as open (Landlord §8e,
demo-mode banner `role`) applies identically here and is not re-litigated.

---

## 8. Open questions / assumptions requiring PO or engineering sign-off

These are explicitly **not** decided by this document:

a. **Shared-component location.** `StatusBadge`, `BrandHeader`
   (`LandlordBrandHeader`), and `theme.js`'s brand ramp/theme object
   currently live under `apps/portal-web/src/redesign/landlord/` and
   contain no Landlord-specific content — they are the general KEYFORTA
   redesign design system. Before Manager implementation begins, the
   Frontend Engineer/Solution Architect must decide: (i) import them
   directly from `../landlord/...` (creates a dependency from
   `redesign/manager/` into `redesign/landlord/`, which is additive but
   couples two supposedly-isolated phase directories), (ii) extract them
   first to a new shared location (e.g. `apps/portal-web/src/redesign/
   shared/`), which is itself a small refactor of already-merged,
   already-reviewed Phase 1 code and needs its own scoped approval since
   Phase 1's PR is already merged, or (iii) duplicate the files under
   `redesign/manager/` (drift risk over time, but zero cross-phase
   coupling and no refactor of merged code). This spec does not pick one —
   flagged for the Frontend Engineer with the Solution Architect.
b. **`BrandHeader` naming.** If option (ii) or (iii) above is chosen, the
   exported name `LandlordBrandHeader` should likely be renamed to
   something role-neutral (e.g. `PortalBrandHeader`) — a small naming
   decision, not fixed here, since it touches already-merged Phase 1 code
   either way.
c. **Whether Manager gets a next-best-action checklist card at all, and if
   so, what it contains.** §4.2 explains why Landlord's exact four-step
   checklist (`addProperty`/`setPricing`/`addPhotos`/`publishListing`)
   does not transfer to Manager's capability set. Two materially different
   options exist and neither is decided here: (i) omit the checklist card
   entirely for Manager (simplest, most honest given Manager's single
   actionable command), or (ii) design a Manager-specific, much shorter
   checklist (e.g. a single "Publish your first assigned listing" item,
   done when any assigned listing has `status === 'published'`) — which
   would itself need new locale keys and a product decision on whether a
   one-item "checklist" is worth the UI pattern at all versus just a plain
   status line. **This is exactly the kind of new product decision this
   spec must not silently invent** — needs explicit PO input before a
   Frontend Engineer builds either option.
d. **Non-brand semantic status colors, font sourcing/licensing, Fluent
   `BrandVariants` ramp review, icon set choice, illustration style,
   offline state, and flag name/mechanism** — all identical open questions
   already recorded in `LANDLORD_REDESIGN_SPEC.md` §8(b, c, d, f, g, i, k)
   and not re-opened or re-decided here; whatever the PO/engineering
   resolves for Landlord applies identically to Manager since these are
   design-system-level, not role-level, questions.
e. **Demo-mode banner `role` semantics** (`role='alert'` vs `role='status'`
   for `tokenStatus === 'demo'`) — identical open question already
   recorded as Landlord §8(e); `ListingPublicationPanel` is the same file
   for both roles, so whatever is decided there applies here automatically,
   not a separate decision.
f. **Whether the six non-implemented Manager nav tabs (Applications,
   Occupancy, Payments, Work orders, Documents, Messages) should get
   dedicated panels as part of this redesign phase, or remain generic
   empty states as designed in §4.4.** This spec assumes the latter
   (matching Landlord's identical assumption for its own six
   non-implemented tabs), since no dedicated panel/API exists for any of
   them today and building one is a separate capability decision, not a
   restyling task. Flagged in case the PO's original "very professional
   portals" request was intended to include populating these tabs, which
   would require new backend/API work far beyond this spec's authority.
g. **File location** (this note) — same as Landlord §8(l): this file lives
   at `docs/product/MANAGER_REDESIGN_SPEC.md` pending a `docs/design/`
   convention with directory-creation tooling.

### 8.1 Implementation defaults chosen (2026-09-24, Frontend Engineer, no PO available)

The Product Owner was unavailable to confirm the above. Per this
repository's engineering loop, changing scope, architecture, or product
behavior requires explicit human approval — none of that is what happened
here. The bounded, additive, flag-gated exception under which this entire
initiative proceeds (Solution Architect-approved; already exercised for
Phase 1/Landlord, PR #134/#135) already authorizes exactly this kind of
work: new code confined to an isolated `redesign/<role>/` directory,
reusing existing auth/session hooks, no new deployable, no API/
authorization change, reachable only behind `VITE_REDESIGN_ENABLED`. What
follows is **not** a substitute for that architecture approval and does
**not** itself authorize any scope, architecture, or product-behavior
change — it only records which of the open, purely-cosmetic §8 questions
had to be resolved *somehow* to write any code at all under that already-
approved exception, and why the choice made is the smallest, most easily
reversed one available, so that resolving it does not by itself commit the
initiative to anything the PO has not seen:

- **(a) Shared-component location: option (i)** — `redesign/manager/`
  imports `StatusBadge`, `BrandHeader`, and the theme directly from
  `../landlord/...`, unmodified. Lowest risk: no refactor of already-merged
  Phase 1 code, no new shared directory to design. If the PO later wants
  extraction to a shared location or a rename, that is a follow-up
  refactor with no behavior change.
- **(b) `BrandHeader` naming: deferred**, exactly because (a) chose "import
  as-is" — no rename needed until/unless a future extraction happens.
- **(c) Manager checklist: option (i), omitted.** Manager's Overview
  renders the Landlord-style checklist *section* only if there is
  meaningful checklist content to show; since no PO-approved
  Manager-specific checklist item set exists, the checklist region is not
  rendered for Manager in this phase (Overview shows only the
  restyled/banner-treated content it already has). This is the "simplest,
  most honest" option the spec itself identified — it does not invent a
  new one-item checklist pattern that would need its own locale keys and
  product sign-off.
- **(f) Non-implemented nav tabs: generic empty states**, matching
  Landlord's identical, already-approved treatment for its own
  unimplemented tabs.

These are cosmetic implementation choices, not requirements or scope
changes, and this note does not claim Product Owner sign-off on them. The
underlying open questions in §8(a–c, f) remain formally unresolved and
must still be brought to the Product Owner for confirmation or revision
before, for example, the Tenant/Admin phases assume the same answers are
final.

---

## 9. Acceptance checklist for Frontend Engineer implementation review

- [ ] All new code lives under `apps/portal-web/src/redesign/manager/`;
      the only change to any existing file is the single, minimal
      mount-point line/branch in `apps/portal-web/src/portal-app.jsx`
      (mirroring the exact pattern already proven for the landlord
      redesign's `LandlordRedesign`/`isLandlordRedesignEnabled`/
      `LandlordRedesignErrorBoundary` wiring) plus additive-only new i18n
      keys in `en.json`/`fr.json` — every other existing file, including
      `listing-publication-panel.jsx` and `styles.css`, remains
      byte-for-byte unchanged.
- [ ] Flag-gated using the same mechanism as Landlord (reuse
      `VITE_REDESIGN_ENABLED` or its confirmed successor per Landlord §8k
      — do not invent a second, Manager-only flag without a stated reason);
      flag-off path renders byte-for-byte identical to today for every
      Manager session.
- [ ] Code-split via `lazy()`/`Suspense` with an error boundary falling
      back to the existing legacy Manager workspace on a failed chunk
      load, mirroring `LandlordRedesignErrorBoundary`'s already-reviewed
      pattern (`portal-app.jsx`, cycle-6 finding) — not reinvented from
      scratch.
- [ ] Fluent UI v9 continues to be used; theme sourced from the same brand
      tokens as Landlord (§2/§8a resolves exactly *how* it's shared before
      this box is checked) — no ad hoc hex outside the documented brand
      palette + Fluent semantic status tokens.
- [ ] Every element in §6's map is present, calling the same existing
      hooks/API client functions (`useManagerListings`, the same
      `ListingPublicationPanel` component/props) — no reimplemented
      auth/session/command logic.
- [ ] `PropertyManagementPanel` is never imported, rendered, or its
      capability reimplemented anywhere under `redesign/manager/` — this
      is the single most important scope boundary in this document (§0,
      §1) and must be independently verifiable by grep.
- [ ] All contrast pairings match Landlord §3.1.1's verified table
      (reused, not re-derived).
- [ ] All states in §5's table (loading/demo/organization-unavailable/
      sign-in-required/unavailable/feed-error/success/error/empty) are
      implemented exactly as `ListingPublicationPanel` already produces
      them; no offline state added; no new denied state added beyond the
      existing `PendingWorkspaceAccess`/`tokenStatus` gates.
- [ ] Every open question in §8 has either been answered by the named
      owner, or the implementation defers that specific piece rather than
      guessing — in particular §8c (checklist card) must not be built
      speculatively without a PO answer.
- [ ] The six non-implemented Manager nav tabs (§4.4) render the shared
      generic empty state only; no dedicated panel invented for any of
      them without a separate, explicit approval (§8f).
