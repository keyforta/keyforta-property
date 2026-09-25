# Tenant Portal Redesign — UX/Visual Design Spec (Phase 3)

Status: **Implemented (flag-gated).** Code now exists under
`apps/portal-web/src/redesign/tenant/` (`TenantShell.jsx`, `index.jsx`,
`redesign.css`), mounted behind `VITE_REDESIGN_ENABLED` in
`apps/portal-web/src/portal-app.jsx`, per PR #138. This document remains
the authoritative design record for that implementation — it originated
as a pre-implementation design artifact and is retained unmodified in
substance, with only this status line updated to reflect the completed
build. This is the Phase 3 design artifact called for by
`docs/engineering/REQUIREMENTS_GAPS.md` →
"Redesigned per-role UI/UX with KEYFORTA branding," whose recorded phasing
is "Landlord first ... then Manager, then Tenant, then Admin." Phase 1
(Landlord) is implemented and merged (PR #134/#135,
`docs/product/LANDLORD_REDESIGN_SPEC.md`) and Phase 2 (Manager) is
implemented and merged (PR #137, `docs/product/MANAGER_REDESIGN_SPEC.md`),
both under the same Solution-Architect-approved bounded/additive/
flag-gated exception. Phase 3 (Tenant) is now implemented under that
identical exception (PR #138), mirroring the sequencing already followed
for Landlord and Manager. Full Product Owner sign-off on the broader
"Redesigned per-role UI/UX" initiative remains pending
(`docs/engineering/REQUIREMENTS_GAPS.md`); that row's status is unchanged
by this document.

Scope owner: UX Designer (this document). Implementation ownership for
this spec is the Frontend Engineer, inside a new, isolated
`apps/portal-web/src/redesign/tenant/` directory, following the exact
additive boundary already proven for Landlord and Manager (§9 below,
mirroring `MANAGER_REDESIGN_SPEC.md` §9, which itself mirrors
`LANDLORD_REDESIGN_SPEC.md` §9).

This spec **reuses** the Landlord spec's design tokens, brand rules,
accessibility requirements, and the Landlord/Manager shared components
**by reference** — it does not restate or re-derive them, and it does not
invent a different visual language for Tenant. One coherent KEYFORTA
design system spans all three implemented-or-designed roles.

File location note: placed under `docs/product/` for the same reason
recorded at the top of `docs/product/LANDLORD_REDESIGN_SPEC.md` (no
`docs/design/` directory exists yet, and directory creation is outside
this session's tooling).

---

## 0. What this redesign is and is not

**Is:** a presentation-layer redesign of the *existing* Tenant experience
as implemented today — the same data (none, yet — see below), same API
calls, same auth/session hooks, same states — with the same professional,
on-brand visual system already designed and implemented for Landlord and
Manager, applied to Tenant's surface.

**Is not:** a new feature, and **not** a widened Tenant surface. This is
the **narrowest** of the three redesign phases completed or designed so
far. Manager, at least, has one dedicated data-bearing panel
(`ListingPublicationPanel`) to restyle. **Tenant has zero.** Per §1 below,
`apps/portal-web/src/portal-app.jsx`'s `showListingPublication` and
`showPropertyManagement` boolean expressions never evaluate true for
`roleKey === 'tenant'` under any value of `active` — a Tenant session
renders neither `ListingPublicationPanel` nor `PropertyManagementPanel`,
on any of its six nav tabs, including Overview. Every one of Tenant's six
nav tabs — Overview, My lease, Payments, Maintenance, Documents, Messages
— today renders only the shared generic `stats-empty-state` /
`rows-empty-state` copy (`roles.tenant.stats_empty_state`,
`roles.tenant.rows_empty_state`) plus the generic "Quick actions" aside
(`actions.tenant`). There is no Tenant-specific interactive panel
component anywhere in the codebase today — not a lease document viewer,
not a payment history table, not a maintenance request form. **This spec
does not propose adding any of those.** It designs only the visual
treatment of the empty-state scaffolding and chrome every role shares,
applied to Tenant's six-tab shell. Section 6 maps every existing Tenant
interactive element so none is silently dropped or expanded in scope.
Section 8 flags everything that looks like a gap but is **not** approved
to add — most importantly, this document does **not** propose giving
Tenant a lease viewer, payment history, or maintenance-request capability;
if any of those is ever wanted, that is a product/API decision for
`REQUIREMENTS_GAPS.md`, not a design decision made here.

---

## 1. Reviewed source of truth

Read in full (or by targeted section) before writing this spec:

- `docs/product/MANAGER_REDESIGN_SPEC.md` (all sections) — the
  immediately-preceding, already-implemented sibling spec. This document
  follows its exact section structure, numbering, rigor, and tone, and
  reuses its findings about what is genuinely role-neutral in the
  Landlord-authored shared components.
- `docs/product/LANDLORD_REDESIGN_SPEC.md` (all sections, including its
  addenda) — the original Phase 1 spec both Manager and this document
  treat as authoritative for anything not explicitly restated or varied
  here (§2 tokens, §5 component states, §7 responsive/accessibility).
- `apps/portal-web/src/portal-app.jsx` — read in full. Confirmed:
  - `roleNavKeys.tenant = ['overview', 'lease', 'payments', 'maintenance',
    'documents', 'messages']` — **6** nav items (Landlord has 8, Manager
    has 8; Tenant has the shortest nav of any role).
  - `showListingPublication = (roleKey === 'manager' && (active ===
    'portfolio' || active === 'overview')) || (roleKey === 'landlord' &&
    (active === 'properties' || active === 'overview'))` — this expression
    has no `roleKey === 'tenant'` clause at all. It is structurally
    impossible for a Tenant session to satisfy this gate.
  - `showPropertyManagement = roleKey === 'landlord' && (active ===
    'properties' || active === 'overview')` — likewise, no `tenant`
    clause. A Tenant session never renders `PropertyManagementPanel`.
  - Therefore, for every value of `active` in
    `roleNavKeys.tenant`, the `content-grid` section's only rendered
    children for a Tenant session are the generic "Needs attention"
    activity panel (`<article className='panel table-panel'>`, always
    empty-state today) and the "Quick actions" aside
    (`<aside className='panel quick-panel'>`) — confirmed by reading the
    `legacyWorkspace` JSX (`portal-app.jsx`, the `content-grid` block)
    line by line: the two panel-gated blocks
    (`{showListingPublication ? ... : null}` /
    `{showPropertyManagement ? ... : null}`) both resolve to `null` for
    every Tenant screen, leaving only the two always-rendered
    generic elements.
- `apps/portal-web/src/locales/en.json` — confirmed exact existing copy
  reused verbatim by this spec, no content rewrite:
  - `roles.tenant.eyebrow` = "My rental"
  - `roles.tenant.title` = "Everything about your home, in one place."
  - `roles.tenant.summary` = "Track your application, lease, payments,
    maintenance, documents, and messages."
  - `roles.tenant.nav` = `["Overview", "My lease", "Payments",
    "Maintenance", "Documents", "Messages"]`
  - `roles.tenant.stats_empty_state` = "Lease, payment, and maintenance
    summaries will appear here once the tenant read APIs are available."
  - `roles.tenant.rows_empty_state` = "Recent maintenance, payment, and
    message activity will appear here once the tenant read APIs are
    available."
  - `actions.tenant` = `["Report a maintenance issue", "Upload a
    document", "Message manager"]`
  All of the above exist today and are reused as-is; this spec neither
  adds nor edits any i18n key.
- `apps/portal-web/src/redesign/landlord/` (implemented code):
  `LandlordShell.jsx`, `theme.js`, `checklist.js`, `redesign.css`,
  `components/StatusBadge.jsx`, `components/NextBestActionChecklist.jsx`,
  `components/BrandHeader.jsx`. Confirmed genuinely reusable for Tenant:
  `theme.js` (brand ramp/theme object — role-neutral, per Manager spec
  §8a's finding) and the generic empty/loading/error canonical-state
  design rules (Landlord §5.3), and `BrandHeader` (role-neutral wordmark
  lockup, same open naming/location question already recorded in Manager
  §8a/§8b, not re-resolved here). Confirmed **not** relevant to Tenant:
  `StatusBadge`'s listing-status (`draft`/`published`/`withdrawn`) badge
  mapping — Tenant has no listing data of any kind and this spec does not
  invent a Tenant-specific badge vocabulary to use it for; `checklist.js`
  / `NextBestActionChecklist.jsx` — computed from
  `properties`/`listings` data that does not exist for a Tenant session at
  all (Tenant is not a manager of any property; see §8c below, an even
  clearer case than Manager's own §8c).
- `apps/portal-web/src/redesign/manager/` (implemented code):
  `ManagerShell.jsx`, `index.jsx`, `components/PortfolioStatusLegend.jsx`,
  `redesign.css`, `statusTone.js`. Confirmed **not** relevant to Tenant:
  `PortfolioStatusLegend.jsx` and `statusTone.js` both exist solely to
  narrate `ListingPublicationPanel`'s listing-status vocabulary, which
  Tenant never renders. `ManagerShell.jsx` is useful only as a **structural
  precedent** — it demonstrates the shape of an assembly/layout component
  for a role with a narrower nav-tab-to-panel mapping than Landlord's —
  not as a component to import.
- `packages/brand/src/index.js` — confirmed the same four approved brand
  hexes (`aubergine` #24162E, `mineralTeal` #267C78, `burnishedCopper`
  #C47A4A, `softBone` #F3EEE7) and two brand fonts (Instrument Sans
  display, Source Sans 3 body) as Landlord and Manager; no Tenant-specific
  brand variant exists or is proposed.
- `docs/engineering/REQUIREMENTS_GAPS.md` → "Redesigned per-role UI/UX
  with KEYFORTA branding" — confirms the approved bounded scope (additive,
  flag-gated, inside `apps/portal-web`, reusing existing hooks, no API/
  authorization changes, Tenant phase after Manager, per the recorded
  phasing "Landlord first ... then Manager, then Tenant, then Admin") that
  this spec must stay inside.

---

## 2. Technology & design-token decision: full reuse, no new decisions

**No new technology decision is made here.** Tenant continues on Fluent
UI v9, themed with the same brand tokens, per
`LANDLORD_REDESIGN_SPEC.md` §2. Specifically reused **as-is, unmodified**:

- `apps/portal-web/src/redesign/landlord/theme.js` — the generated
  16-step `mineralTeal` brand ramp and the `landlordRedesignTheme`
  object's Fluent-default overrides. As already noted in Manager §2/§8a,
  there is nothing Landlord-specific in this theme object's *values* — it
  is the KEYFORTA brand theme, not a Landlord-only theme. See §8(a) for
  the still-unresolved question of where it should physically live, now
  that a *third* phase (Tenant) is a candidate importer.
- `LANDLORD_REDESIGN_SPEC.md` §3 (design tokens: color usage rules and
  WCAG table, typography scale, spacing/sizing scale, elevation/surfaces)
  — reused verbatim, no Tenant-specific variant. Every contrast pairing,
  font, spacing step, and radius value in Landlord §3 applies unchanged to
  every Tenant screen designed below.
- `LANDLORD_REDESIGN_SPEC.md` §11 (visual-quality-bar addendum: two-layer
  shadows, 20px card radius, 3px category-colored top accent bar, kicker
  pills, sidebar inactive/active nav weighting, grid `align-items: start`,
  content-driven card height) — reused verbatim. Tenant's only two
  standing cards (the "Needs attention" activity panel and the "Quick
  actions" aside) use the same `aubergine`-tint informational/activity
  category mapping Landlord and Manager already apply to their own
  identical "Needs attention" card.

**Nothing in this document introduces a new hex, a new font, a new
spacing/radius value, or a new shadow recipe.** Tenant's redesign differs
from Landlord/Manager only in **information architecture** — and here,
almost entirely by *subtraction*, since there is no dedicated panel at
all — never in the underlying design-system tokens.

---

## 3. Component reuse vs. new components

### 3.1 Reused directly, unmodified (import, don't fork)

| Component | Source | Tenant usage |
|---|---|---|
| `BrandHeader` (`LandlordBrandHeader`) | `apps/portal-web/src/redesign/landlord/components/BrandHeader.jsx` | Sidebar/auth-card logo lockup. Same still-open naming/location question as Manager §8a/§8b — not re-decided here; if the shared-location question (§8a) is ever resolved, Tenant should adopt whatever the resolved location/name is rather than choosing its own third answer. |
| Fluent theme (`landlordRedesignTheme` / `mineralTealRamp`) | `apps/portal-web/src/redesign/landlord/theme.js` | `FluentProvider` theme for the Tenant redesign subtree — same reasoning as `BrandHeader` above. |
| Empty/loading/error/offline/denied canonical treatment (Landlord §5.3) | `LANDLORD_REDESIGN_SPEC.md` §5.3 | Applied to Tenant's only two content-area elements (the "Needs attention" activity panel and the stats-strip placeholder) — see §5 below. This is, functionally, almost the *entire* Tenant redesign surface. |
| Auth screens (`LoginGate`, `PendingWorkspaceAccess`) restyled `auth-card` (Landlord §5.6) | `LANDLORD_REDESIGN_SPEC.md` §5.6 | Identical reuse — these screens render before role is even known to matter, so Tenant shares the exact same restyled auth-card as every other role, unmodified. |
| Sidebar nav / language toggle / sign-out button treatment (Landlord §5.1) | `LANDLORD_REDESIGN_SPEC.md` §5.1 | Identical, applied to `roleNavKeys.tenant`'s 6 items. |
| Quick action button treatment (Landlord §5.1 outline + icon chip) | `LANDLORD_REDESIGN_SPEC.md` §5.1 | Identical, applied to `actions.tenant`'s 3-item list. |

### 3.2 Reused for reference only, explicitly NOT imported

| Component | Source | Why not for Tenant |
|---|---|---|
| `StatusBadge` | `redesign/landlord/components/StatusBadge.jsx` | Maps `draft`/`published`/`withdrawn` listing-status vocabulary. Tenant has no listing, no property, no status field of any kind rendered anywhere today — there is nothing for this component to badge. Importing it with no data to feed it would be dead code; not proposed. |
| `NextBestActionChecklist` / `checklist.js` | `redesign/landlord/` | Computed from `properties`/`listings` data a Tenant session never has (Tenant is not a manager/landlord of any property). See §8c — even more clear-cut than Manager's already-declined case, since Tenant additionally has zero actionable commands (no publish/withdraw-equivalent) to build a one-item checklist around either. |
| `PortfolioStatusLegend` / `statusTone.js` | `redesign/manager/` | Exists solely to narrate `ListingPublicationPanel`'s status vocabulary, which Tenant never renders (§1). |

### 3.3 New component(s) specific to Tenant

**None are required beyond a single assembly/layout component.** Tenant's
entire content-area surface (the "Needs attention" panel and "Quick
actions" aside) is a strict subset of what Landlord's `LandlordShell`
already renders and styles for its own identical always-empty "Needs
attention" panel and identically-shaped "Quick actions" aside. A
`TenantShell.jsx` is needed as an **assembly/layout** component (mirroring
`LandlordShell.jsx`'s and `ManagerShell.jsx`'s role of wiring nav, topbar,
and content grid together) but it introduces no new visual component,
badge, banner, or interaction pattern beyond what §3.1 lists. This spec
identifies **no** Tenant-specific new component — an even more definitive
conclusion than Manager's own §3.2 ("none are required for the narrow
scope"), because Tenant has no dedicated panel at all, not even a narrower
one.

---

## 4. Information architecture & layout

### 4.1 App shell (applies to every Tenant screen)

Unchanged structural IA from today (left sidebar + main content, same as
Landlord §4.1 and Manager §4.1), restyled per the same rules, with these
Tenant-specific differences:

- **Sidebar nav** uses `roleNavKeys.tenant`'s 6 items, in order:
  `Overview, My lease, Payments, Maintenance, Documents, Messages` (exact
  labels come from `roles.tenant.nav` i18n, unchanged) — **no new nav
  items**, same non-decision as Landlord's and Manager's rule. **None** of
  the six tabs has a dedicated panel (unlike Landlord's 2-of-8 and
  Manager's 2-of-8); all six render the shared generic stats/rows
  empty-state copy, styled exactly per Landlord §4.1's rule for its own
  non-implemented tabs ("keeps that same generic empty-state treatment ...
  rather than inventing new panels for them") — the same non-decision
  applies here, unchanged, not reconsidered, now applied uniformly to
  every one of Tenant's tabs rather than just a subset.
- **Sidebar eyebrow**: Tenant's own `roles.tenant.eyebrow` i18n string
  ("My rental", unchanged copy), rendered in the identical restyled
  sidebar treatment (Landlord §3.4 surfaces, §11.3 inactive/active
  nav-item weighting) as Landlord and Manager.
- **Topbar**: same structure — eyebrow + `<h1>` title
  (`roles.tenant.title` on Overview, or the active section's translated
  label elsewhere) + `roles.tenant.summary` subtitle (Overview) + user
  chip. Unchanged.
- **Content grid**: same unchanged 2-column desktop layout / 1-column
  ≤900px collapse as Landlord §4.1/§7.1 — no new breakpoint behavior. See
  §4.2 for the open question this raises given Tenant's degenerate content
  (only one of the two grid columns has any real content on every tab).

### 4.2 Overview screen

The narrowest Overview of any role designed so far — **zero** dedicated
panels exist for Tenant (Landlord has two, Manager has one):

1. **Stats strip** — identical treatment to Landlord §4.2 item 1 and
   Manager §4.2 item 1: a single full-width quiet placeholder card using
   `roles.tenant.stats_empty_state` i18n copy (same mechanism, different
   string, no invented stat tiles).
2. **Content grid** — this is where Tenant's narrowness becomes a genuine
   layout question, not merely a content one. Landlord and Manager's
   two-column desktop grid puts a real, data-driven panel
   (`PropertyManagementPanel`/`ListingPublicationPanel`) in the left
   column and the "Quick actions" aside in the right column. **Tenant has
   no panel to put in the left column at all** — its left column today
   holds only the "Needs attention" activity panel (`t('workspace
   .needs_attention')`, always empty-state), the same panel every role
   shares, with nothing else stacked above or beside it. Two materially
   different layout treatments are both defensible and neither is fixed
   by anything already in code:
   - **Option A — keep the existing two-column grid as-is**, with the
     "Needs attention" empty-state card simply occupying the entire left
     column at whatever height its content naturally takes (per Landlord
     §11.3's `align-items: start` rule, so it never stretches to match
     the aside's height or vice versa). This is the literal, minimal
     restyling of today's DOM — no structural change, only presentation.
   - **Option B — collapse to a single-column, full-width "Needs
     attention" card on top, with "Quick actions" below it** (or vice
     versa), reasoning that a two-column grid visually implies two
     comparably-weighted panels, and showing an empty-state card
     artificially stretched into a "primary column" role it doesn't
     structurally justify may read as a layout bug rather than an
     intentional design, especially once Tenant's tab is the *only* one of
     three roles where the left column is never anything but empty-state.
   - **This spec does not choose between A and B — flagged as an open
     design decision in §8, not resolved here.** Nothing in
     `portal-app.jsx` dictates either outcome (the `content-grid` CSS
     class is shared and role-agnostic); this is a genuine visual-design
     call, not something the existing code already answers, and it is
     exactly the kind of decision this spec's instructions require
     surfacing rather than silently picking.
   - Right (aside): "Quick actions" panel — same `actions.tenant` i18n
     action list (`Report a maintenance issue`, `Upload a document`,
     `Message manager`), restyled per Landlord §5.1 outline-button + icon
     chip treatment; API boundary footnote, unchanged copy/placement. This
     column's treatment is not in question regardless of how §4.2's
     Option A/B question above is resolved.
3. **Next-best-action checklist card** — **not designed here; not
   recommended; see §8c.** Unlike Manager (where the question was at
   least "which shorter checklist, if any"), Tenant has literally zero
   actionable state-changing commands anywhere in its rendered surface
   today (no publish/withdraw-equivalent, no create/edit-equivalent) —
   there is no candidate checklist step to propose even hypothetically.
   This spec's default assumption, stated plainly so it is not silently
   invented later, is that Tenant gets **no** checklist card at all;
   §8c still records this as open pending explicit PO confirmation,
   consistent with the instruction not to resolve open product questions
   unilaterally in this document.

### 4.3–4.8 Non-implemented nav tabs (all six: Overview, My lease, Payments,
Maintenance, Documents, Messages)

Unlike Landlord (2 of 8 tabs have a dedicated panel) and Manager (2 of 8
tabs have a dedicated panel), **all six** of Tenant's tabs — including
Overview — share the identical non-decision already recorded in Landlord
§4.1/§4.4 and Manager §4.4 for their own non-implemented tabs: styled per
the shared generic stats/rows empty-state treatment (§5 below), **no
dedicated panel is designed for any of them** in this spec. This is not a
per-tab decision requiring six separate subsections, because there is
exactly one applicable treatment and it is uniform across all six —
unlike Landlord/Manager, where Overview warranted its own subsection
because it (uniquely) hosted a real panel. If/when a dedicated panel is
built for "My lease," "Payments," "Maintenance," "Documents," or
"Messages" (e.g. a lease document viewer, a payment history table, a
maintenance request form — all explicitly out of scope per §0), that
needs its own IA/component design pass and, per §0, may itself require new
product-authorization and API decisions this spec does not make.

---

## 5. Component treatment — Tenant-specific application of Landlord §5

All rules below are the same rules as `LANDLORD_REDESIGN_SPEC.md` §5,
applied to Tenant's narrower element set — narrower even than Manager's
(Manager §5 still had a listing-status badge row and a full
`ListingPublicationPanel` state table; Tenant has neither). No new visual
rule is introduced; this section exists only to make the state-by-state
mapping explicit and auditable for a Frontend Engineer who has not read
every line of the Landlord spec.

| State / element | Landlord spec rule reused | Tenant application |
|---|---|---|
| Sidebar nav buttons, language toggle, sign-out | §5.1 subtle / active-pill | Identical, `roleNavKeys.tenant` items |
| Quick action buttons | §5.1 outline + icon chip | Identical, `actions.tenant` i18n list |
| Stats-strip empty state | §5.3 neutral empty-state card | Identical, `roles.tenant.stats_empty_state` copy |
| "Needs attention" activity panel empty state | §5.3 neutral empty-state card | Identical, `roles.tenant.rows_empty_state` copy — this is Tenant's **only** content-area element besides the stats strip and quick actions; there is no other state to map |
| `PendingWorkspaceAccess` / `LoginGate` | §5.6 `auth-card` | Identical, shared screens |
| Listing status badges | §5.5 badge table | **Does not apply — no listing-status badge row exists for Tenant.** No listing, property, or unit data of any kind is rendered anywhere in Tenant's surface today. This spec does not invent one to give the badge component a use. |
| Banners / inline feedback (`.publication-feedback`) | §5.2 | **Does not apply.** `ListingPublicationPanel` and `PropertyManagementPanel` — the only two components in the codebase that render this banner family — are never mounted for a Tenant session (§1). Tenant has no loading/demo/error/success banner states of its own beyond the generic empty-state card above. |
| Offline state | §5.3 | **No offline state exists**, same explicit non-decision as Landlord §5.3/§8i and Manager §5/§8d — not revisited here. |

---

## 6. Existing interactive element → redesigned treatment map

Every element below exists in code today; none is new, none is dropped.
This mirrors `LANDLORD_REDESIGN_SPEC.md` §6 and `MANAGER_REDESIGN_SPEC.md`
§6, scoped to Tenant's actual (narrow) surface.

| Existing element (file:approx.) | Component today | Redesigned treatment |
|---|---|---|
| Sidebar nav buttons (`portal-app.jsx`, `roleNavKeys.tenant`) | `Button appearance='subtle'` | §5.1 subtle + active-pill state |
| Language toggle / Sign out (`portal-app.jsx`) | `Button appearance='subtle'` | §5.1 subtle, bottom-pinned |
| Quick action buttons (`portal-app.jsx`, `actions.tenant`) | `Button appearance='outline'` | §5.1 outline + icon chip |
| Stats-strip placeholder (`portal-app.jsx`, `.stats-empty-state`) | Plain `<p>` | §5.3 neutral empty-state card |
| "Needs attention" activity panel (`portal-app.jsx`, `.rows-empty-state`, shared/generic) | Plain empty-state `<p>` | §5.3 neutral empty-state card |
| `PendingWorkspaceAccess` / `LoginGate` (`portal-app.jsx`) | `.auth-card` | §5.6 restyled `auth-card`, identical shared screens |

This table is complete — there is no additional row to add for Tenant
beyond what is already listed in §5's table above, because there is no
additional rendered element in the codebase for a Tenant session. This is
the shortest such table of the three roles designed so far, by
construction, not by omission.

---

## 7. Responsive & accessibility

Fully reused, unchanged, from `LANDLORD_REDESIGN_SPEC.md` §7 (breakpoints
at >900px / ≤900px / ≤620px, all binding accessibility requirements:
contrast table, visible focus rings, preserved `aria-label`/`role`
semantics, 40px touch targets, `prefers-reduced-motion` respect, semantic
HTML structure). No Tenant-specific variance — Tenant's screens contain a
strict subset of the interactive elements Landlord's and Manager's
screens already satisfy these requirements for, so no new accessibility
case is introduced. The one exception already flagged as open (Landlord
§8e, demo-mode banner `role`) does not even arise for Tenant, since
Tenant never renders the `ListingPublicationPanel`/`PropertyManagementPanel`
banner family that question concerns (§5) — it is inherited as a
non-issue, not re-litigated.

---

## 8. Open questions / assumptions requiring PO or engineering sign-off

These are explicitly **not** decided by this document:

a. **Shared-component location.** `BrandHeader` (`LandlordBrandHeader`)
   and `theme.js`'s brand ramp/theme object currently live under
   `apps/portal-web/src/redesign/landlord/` and contain no Landlord-
   specific content. Manager's spec (§8a) already raised, and explicitly
   did not resolve, the choice between (i) importing directly from
   `../landlord/...`, (ii) extracting to a shared location (e.g.
   `apps/portal-web/src/redesign/shared/`), or (iii) duplicating the
   files under `redesign/tenant/`. Manager's Frontend Engineer recorded
   (Manager §8.1, an implementation note, not a PO decision) that option
   (i) was chosen as the lowest-risk default when the PO was unavailable.
   **With Tenant now a third phase importing the same files from
   `../landlord/...`, this question is more pressing than when Manager's
   spec was written, not less** — a third consumer of code still located
   inside a supposedly role-scoped `redesign/landlord/` directory is a
   stronger signal that extraction (option ii) may now be the right call,
   but that is a judgment for the Frontend Engineer/Solution Architect to
   make with the PO, not a decision this spec makes on its own. This spec
   explicitly does **not** pick a different answer than Manager's
   Frontend Engineer chose merely because a third phase now exists;
   flagged for the Frontend Engineer with the Solution Architect before
   Tenant implementation begins.
b. **`BrandHeader` naming.** Still deferred, exactly as recorded in
   Manager §8b — if option (i) above continues to be chosen for Tenant as
   well, no rename is needed yet; if (a) is finally resolved toward
   extraction, the rename should happen once, for all three roles
   together, not piecemeal per phase.
c. **Whether Tenant gets a next-best-action checklist card at all.** §4.2
   item 3 explains why this is an even more clear-cut "no" than Manager's
   already-declined case (Manager §8c): Manager at least had one
   candidate checklist step ("publish your first assigned listing").
   Tenant has zero actionable, state-changing commands anywhere in its
   rendered surface today to build even a single checklist item around.
   This spec's stated default assumption is that no checklist card is
   shown for Tenant — but per this task's instructions, that default is
   recorded as an assumption requiring explicit PO confirmation, not
   silently finalized, since "should Tenant have a checklist at all, and
   if so around what" is a product question about what a checklist would
   even represent for a role with no current write capability, not a pure
   design question.
d. **Content-grid layout for Tenant's Overview screen (Option A vs. Option
   B, §4.2 item 2).** This is a genuine new design decision this spec
   surfaces rather than invents an answer for: whether the existing
   two-column desktop grid should be kept as-is (with the "Needs
   attention" empty-state card occupying the full left column) or
   collapsed to a single-column stack for Tenant specifically, given that
   Tenant is the only role among the three designed so far whose left
   column is never anything but an empty-state card, on every single nav
   tab. Needs a UX/PO decision before implementation; flagged, not
   resolved, here.
e. **Non-brand semantic status colors, font sourcing/licensing, Fluent
   `BrandVariants` ramp review, icon set choice, illustration style,
   offline state, and flag name/mechanism** — all identical open
   questions already recorded in `LANDLORD_REDESIGN_SPEC.md` §8(b, c, d,
   f, g, i, k) and `MANAGER_REDESIGN_SPEC.md` §8d, not re-opened or
   re-decided here; whatever the PO/engineering resolves for Landlord
   applies identically to Tenant since these are design-system-level, not
   role-level, questions.
f. **Demo-mode banner `role` semantics** (`role='alert'` vs `role='status'`
   for `tokenStatus === 'demo'`) — identical open question already
   recorded as Landlord §8e and Manager §8e. **Does not currently apply to
   Tenant at all** (§5), since Tenant never renders
   `ListingPublicationPanel`/`PropertyManagementPanel`. Recorded here only
   so a future reader knows this question was considered and found
   inapplicable, not overlooked.
g. **Whether Tenant's six nav tabs should get dedicated panels as part of
   this redesign phase, or remain generic empty states as designed in
   §4.3–4.8.** This spec assumes the latter (matching Landlord's and
   Manager's identical assumption for their own non-implemented tabs),
   since no dedicated panel/API exists for any of them today and building
   one is a separate capability decision, not a restyling task. Flagged
   in case the PO's original "very professional portals" request was
   intended to include populating these tabs — for Tenant, this would mean
   building, at minimum, a lease document viewer, a payment history view,
   and a maintenance request form, each of which requires new backend/API
   work and its own product-authorization decision, far beyond this
   spec's authority (§0).
h. **File location** (this note) — same as Landlord §8l and Manager §8g:
   this file lives at `docs/product/TENANT_REDESIGN_SPEC.md` pending a
   `docs/design/` convention with directory-creation tooling.

No "implementation defaults chosen" section is included in this document.
Manager's §8.1 was added by that phase's Frontend Engineer *during
implementation*, when the PO was unavailable and code needed to be
written under the already-approved bounded exception — it recorded
implementation-time defaults, not a UX Designer's decisions. This document
is a design spec produced before implementation begins; resolving §8's
open questions here, by the UX Designer, would be exactly the kind of
silent invention this task's instructions prohibit. If the Product Owner
remains unavailable when Tenant implementation starts, the Frontend
Engineer may record their own equivalent "implementation defaults chosen"
note at that time, following the same reasoning and reversibility
discipline Manager's §8.1 already demonstrated — that is a decision for
whoever writes the code, not for this document.

---

## 9. Acceptance checklist for Frontend Engineer implementation review

- [ ] All new code lives under `apps/portal-web/src/redesign/tenant/`;
      the only change to any existing file is the single, minimal
      mount-point line/branch in `apps/portal-web/src/portal-app.jsx`
      (mirroring the exact pattern already proven for the landlord and
      manager redesign's `LandlordRedesign`/`ManagerRedesign` and
      `isLandlordRedesignEnabled`/error-boundary wiring) plus
      additive-only new i18n keys in `en.json`/`fr.json` **if and only
      if** any are actually needed (this spec adds no new copy — see §1's
      confirmed reuse of every existing `roles.tenant.*`/`actions.tenant`
      string) — every other existing file, including `styles.css`,
      remains byte-for-byte unchanged.
- [ ] Flag-gated using the same mechanism as Landlord and Manager (reuse
      `VITE_REDESIGN_ENABLED` or its confirmed successor per Landlord
      §8k — do not invent a third, Tenant-only flag without a stated
      reason); flag-off path renders byte-for-byte identical to today for
      every Tenant session.
- [ ] Code-split via `lazy()`/`Suspense` with an error boundary falling
      back to the existing legacy Tenant workspace on a failed chunk
      load, mirroring `LandlordRedesignErrorBoundary`'s and
      `ManagerRedesignErrorBoundary`'s already-reviewed pattern
      (`portal-app.jsx`) — not reinvented from scratch.
- [ ] Fluent UI v9 continues to be used; theme sourced from the same brand
      tokens as Landlord and Manager (§2/§8a resolves exactly *how* it's
      shared before this box is checked) — no ad hoc hex outside the
      documented brand palette + Fluent semantic status tokens.
- [ ] Every element in §6's map is present, calling the same existing
      hooks/session logic already used by the legacy Tenant workspace — no
      reimplemented auth/session/command logic, and critically, **no new
      hook, API call, or data fetch introduced** (Tenant's redesigned
      surface has nothing new to fetch; if the Frontend Engineer finds
      themselves adding a data hook to satisfy this spec, that is a sign
      the spec's boundary is being exceeded — stop and check §0).
- [ ] `ListingPublicationPanel` and `PropertyManagementPanel` are never
      imported, rendered, or their capability reimplemented anywhere
      under `redesign/tenant/` — this is the single most important scope
      boundary in this document (§0, §1) and must be independently
      verifiable by grep, exactly as Manager §9 required for
      `PropertyManagementPanel` alone; Tenant's equivalent check covers
      *both* panels, since Tenant is authorized for neither.
- [ ] No lease document viewer, payment history table, or maintenance
      request form is built anywhere under `redesign/tenant/` — none is
      designed by this spec (§0), and none should appear as a
      "helpful addition" during implementation without a separate,
      explicit product-authorization decision recorded in
      `REQUIREMENTS_GAPS.md` first.
- [ ] All contrast pairings match Landlord §3.1.1's verified table
      (reused, not re-derived).
- [ ] The only states rendered anywhere in Tenant's redesigned surface are
      the stats-strip empty state, the "Needs attention" empty state, and
      the shared auth-card screens (§5/§6) — no loading, demo,
      organization-unavailable, sign-in-required, unavailable, feed-error,
      success, or error banner state is implemented for Tenant, since none
      of those states is reachable by any component Tenant renders today;
      implementing any of them would itself be evidence of an
      out-of-scope panel having been added.
- [ ] Every open question in §8 has either been answered by the named
      owner, or the implementation defers that specific piece rather than
      guessing — in particular §8c (checklist card) and §8d (Overview
      content-grid layout, Option A vs. B) must not be built
      speculatively without a PO/UX answer.
- [ ] All six of Tenant's nav tabs (§4.3–4.8) render the shared generic
      empty state only; no dedicated panel invented for any of them
      without a separate, explicit approval (§8g).
