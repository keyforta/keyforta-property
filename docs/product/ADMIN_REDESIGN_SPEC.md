# Admin Console Redesign — UX/Visual Design Spec (Phase 4, final phase)

Status: **Design spec only — not yet implemented.** No code exists under
any `apps/admin-web/src/redesign/`-style directory today. This is the
Phase 4 (final phase) design artifact called for by
`docs/engineering/REQUIREMENTS_GAPS.md` →
"Redesigned per-role UI/UX with KEYFORTA branding," whose recorded phasing
is "Landlord first ... then Manager, then Tenant, then Admin." Phase 1
(Landlord) is implemented and merged (PR #134/#135,
`docs/product/LANDLORD_REDESIGN_SPEC.md`), Phase 2 (Manager) is
implemented and merged (PR #137, `docs/product/MANAGER_REDESIGN_SPEC.md`),
and Phase 3 (Tenant) is implemented and merged (PR #138,
`docs/product/TENANT_REDESIGN_SPEC.md`), all three under the same
Solution-Architect-approved bounded/additive/flag-gated exception. This
document proposes the identical exception for Admin, the fourth and final
phase, inside `apps/admin-web` (not `apps/portal-web` — see §0/§1). Full
Product Owner sign-off on the broader "Redesigned per-role UI/UX"
initiative remains pending (`docs/engineering/REQUIREMENTS_GAPS.md`); that
row's status is unchanged by this document. **Implementation is a
separate, later delegated task** — this document is design-only, produced
by the UX Designer, and hands off to a Frontend Engineer exactly as the
three prior phases' specs did.

Scope owner: UX Designer (this document). Implementation ownership for
this spec, when authorized, is the Frontend Engineer, inside a new,
isolated directory under `apps/admin-web/src/` (see §3.2/§8 for why its
exact location and provenance are a genuinely new question for this phase,
unlike Manager/Tenant), following the additive boundary already proven for
Landlord, Manager, and Tenant (§9 below, mirroring
`TENANT_REDESIGN_SPEC.md` §9, which itself mirrors
`MANAGER_REDESIGN_SPEC.md` §9 and `LANDLORD_REDESIGN_SPEC.md` §9).

This spec **reuses** the Landlord spec's design tokens, brand rules, and
accessibility requirements, and the Landlord/Manager/Tenant specs' shared
findings, **by reference** — it does not restate or re-derive them, and it
does not invent a different visual language for Admin. One coherent
KEYFORTA design system spans all four roles, even though Admin lives in a
physically separate deployable app (§0/§1).

File location note: placed under `docs/product/` for the same reason
recorded at the top of `docs/product/LANDLORD_REDESIGN_SPEC.md` (no
`docs/design/` directory exists yet, and directory creation is outside
this session's tooling).

---

## 0. What this redesign is and is not

**Is:** a presentation-layer redesign of the *existing* Admin console
capabilities as implemented today — the same data, same API calls, same
auth/session hooks, same states — with the same professional, on-brand
visual system already designed and implemented for Landlord, Manager, and
Tenant, applied to Admin's surface inside its own app.

**Is not:** a new feature, not a widened Admin surface, and **not** a
change to Admin's deployment topology. Three scope boundaries matter more
here than in any prior phase:

1. **Richer than Tenant, narrower than Landlord/Manager, in a different
   dimension than either.** Tenant (Phase 3) had zero dedicated
   data-bearing panels — every one of its six nav tabs rendered only
   generic empty-state copy. Admin is the opposite of that: it has **two
   real, data-bearing, currently-implemented sections**, each with real
   queues, real records, required-reason decision forms, and
   Approve/Reject actions that mutate real application/media-review state
   (`onboarding` via `ReviewQueue`/`ReviewCard`; `media-review` via
   `MediaReviewQueue`/`MediaReviewCard` — §1). In that sense Admin's
   restyling scope is **richer** than Tenant's — there are genuine
   interactive components, states, and decisions to redesign, not just an
   empty-state shell. But Admin is simultaneously **narrower in nav
   breadth** than Landlord (8 nav keys) or Manager (8 nav keys): Admin has
   exactly **2** sections total (`SectionNav` renders exactly two
   buttons — "Onboarding" and "Media review"), not a multi-tab sidebar
   with several non-implemented placeholder tabs. There is no sidebar at
   all in the current implementation (§1) and no "non-implemented tab"
   concept for Admin to design around, unlike every prior phase's §4.4 (or
   §4.3–4.8 for Tenant).
2. **`apps/admin-web` remains a separate deployable app from
   `apps/portal-web`.** Per `apps/admin-web/README.md` (quoted in full in
   §1), this app is "separate from the operational portal" precisely
   because "every privileged action requires server-side authorization
   and an audit event," and the API independently checks the verified
   Entra object ID against `PLATFORM_ADMIN_OBJECT_IDS` for every list and
   decision request. **This redesign does not change that separation, does
   not merge or blur the two apps, and does not add a new deployable app
   or service.** `docs/engineering/REQUIREMENTS_GAPS.md`'s "Redesigned
   per-role UI/UX with KEYFORTA branding" entry explicitly rejected new
   deployable apps per role and explicitly named `apps/admin-web`'s
   separation rationale as the reason a further split is out of scope —
   the same rationale means this redesign must stay *inside*
   `apps/admin-web`, not migrate Admin screens into `apps/portal-web` or
   vice versa.
3. **No new privileged action, no authorization change, no new data
   visibility.** This spec designs **only** what `OnboardingAdmin()`
   already renders today for a `signed-in` platform administrator: the
   onboarding review queue and the media review queue, exactly as
   implemented, with the exact same Approve/Reject decision semantics,
   the exact same required-reason/required-notes validation, and the
   exact same server-side 404-based denial behavior. Section 6 maps every
   existing interactive element so none is silently dropped or expanded
   in scope. Section 8 flags everything that looks like a gap but is
   **not** approved to add — most importantly, this document does **not**
   propose giving Admin any new review category, any bulk-decision action,
   any audit/reporting/reconciliation screen (all explicitly named in
   `apps/admin-web/README.md` as "planned" and "not current UI behavior"),
   or any relaxation of the required-reason/required-notes validation. If
   any of those is ever wanted, that is a product/API decision for
   `REQUIREMENTS_GAPS.md`, not a design decision made here.

---

## 1. Reviewed source of truth

Read in full before writing this spec:

- `docs/product/MANAGER_REDESIGN_SPEC.md` and
  `docs/product/TENANT_REDESIGN_SPEC.md` (all sections) — the
  immediately-preceding, already-implemented sibling specs. This document
  follows their exact section structure, numbering, rigor, and tone, and
  reuses their findings about what is genuinely role-neutral in the
  Landlord-authored shared components, without re-deriving them.
- `docs/product/LANDLORD_REDESIGN_SPEC.md` (all sections, including its
  addenda) — the original Phase 1 spec that Manager, Tenant, and this
  document all treat as authoritative for anything not explicitly
  restated or varied here (§2 tokens, §5 component states, §7
  responsive/accessibility).
- `apps/admin-web/src/OnboardingAdmin.jsx` — read in full (272 lines).
  Confirmed, precisely:
  - Two sections only, switched by local `section` state
    (`useState('onboarding')`) inside the top-level exported
    `OnboardingAdmin()` component, rendered via `SectionNav` (two
    `Button`s, `appearance='primary'` when active / `'subtle'` otherwise,
    `aria-label` from `nav.sections_label`): `onboarding` →
    `ReviewQueue`, `media-review` → `MediaReviewQueue`.
  - `onboarding` section (`ReviewQueue` + `ReviewCard`): a queue of
    organization onboarding applications. States: `loading` (initial and
    on every `load()`/refresh call), `empty` (zero applications),
    `denied` (a 404 response from `onboardingApi.list()` — the API's own
    `PLATFORM_ADMIN_OBJECT_IDS` check failing, not a client-side role
    gate), `error` (any other `list()` failure, with a distinct
    `error?.code === 'API_UNAVAILABLE'` branch producing
    `review.api_unavailable` instead of the generic
    `review.queue_load_failed`), `ready` (renders every application as a
    `ReviewCard`). Each `ReviewCard` shows a status `Badge`
    (`pending`→warning/tint, `approved`→success, `rejected`→danger, via
    `review.status.*`), applicant/organization name, submitted/decided
    dates, and — only while `application.status === 'pending'` — a
    required decision-reason `Textarea` (`minLength={3}`,
    `maxLength={1000}`, `required`) plus Approve/Reject `Button`s, each
    `disabled={busy || reason.trim().length < 3}`. A decided (non-pending)
    application instead shows its recorded reason as plain text
    (`decision-evidence`), not the form. A per-decision 404 also produces
    a `denied` state (`review.not_authorized_decide`), discarding the
    already-loaded queue entirely (`setQueue({ status: 'denied',
    applications: [], ... })`) — a real, existing behavior this spec
    describes but does not change.
  - `media-review` section (`MediaReviewQueue` + `MediaReviewCard`): a
    queue of pending public-listing media reviews. Same four queue-level
    states as onboarding (`loading`/`empty`/`denied`/`error`, with the
    same `API_UNAVAILABLE` distinct-message branch, reusing the shared
    `review.api_unavailable` string). Each `MediaReviewCard` shows a
    status `Badge` that is **always** `media_review.status.pending`
    (tint/warning) — confirmed in `en.json`, `media_review.status` only
    defines a `pending` key, no `approved`/`rejected` key exists, because
    (see below) a decided item is never rendered again, so no other
    status string is ever needed. Each card shows organization name,
    listing title (or `media_review.untitled_listing`), property name,
    unit label, submitted date, an optional `summary`, a gallery of
    `uploadedImages` (each rendered via `ReviewImage`, which asynchronously
    fetches a blob URL via `mediaReviewApi.getReviewImageContent` and has
    its own three-state render: `loading` spinner, `error`
    (`media_review.image_load_failed`), or the `<img>` itself, with the
    blob URL revoked on unmount/id-change) plus any legacy `imageUrls`
    (rendered as a link when `isSafeImageUrl(url)` — http/https-only,
    resolved against `window.location.origin`, per the file's own
    XSS-hardening comment about pre-REQ-037 stored values — or as inert
    plain text otherwise; **this safety logic is not touched or
    reinterpreted by this spec, only described**), an optional reviewer
    `notes` `Textarea` (`maxLength={2000}`, no `minLength`), and
    Approve/Reject buttons: Approve `disabled={busy || decision !== ''}`,
    Reject additionally requires `canReject = notes.trim().length > 0`
    (`disabled={busy || decision !== '' || !canReject}`). Crucially,
    `decide()`'s success path **filters the decided item out of the
    queue's `reviews` array entirely, regardless of whether the decision
    was `approved` or `rejected`** (`reviews.filter((item) =>
    item.listingId !== listingId)`), re-deriving `status` to `'empty'` if
    that was the last item — the media-review queue **never** shows a
    non-pending item once decided; this differs from the onboarding
    queue, which keeps a decided application visible in its
    decision-evidence state (§0(1)/§5 describe this difference; it is not
    proposed to be changed).
  - Both sections share one `admin-shell`/`admin-header` chrome:
    `AppBrand surface="ADMIN"`, the two-button `SectionNav`, an identity
    display (`auth.account.name || auth.account.username`), a language
    toggle (`common.switch_language`, swaps `i18n.resolvedLanguage`
    between `en`/`fr`), a refresh button (`ArrowClockwise20Regular` icon,
    calls the section's own `load()`), and a sign-out button
    (`SignOut20Regular` icon, `adminAuth.signOut()`).
  - `LoginGate({ auth })` is the pre-auth screen: `AppBrand
    surface="ADMIN"`, a `auth.restricted_console` eyebrow, `auth.sign_in_
    title`/`auth.sign_in_subtitle`, a primary sign-in button
    (`adminAuth.signIn()`) shown only when `auth.status === 'signed-out'`,
    else a `role="status"` message block showing a `Spinner` for
    `loading`/`authenticating` and the matching
    `auth.status.{loading|authenticating|unavailable|error}` string for
    any other non-signed-out status.
  - **Mount point:** `OnboardingAdmin()` (the top-level exported
    component) is the single mount point equivalent to `Portal()` in
    `apps/portal-web/src/portal-app.jsx`: `if (auth.status ===
    'signed-in') return section === 'media-review' ?
    <MediaReviewQueue .../> : <ReviewQueue .../>; return <LoginGate
    auth={auth} />;`. **This is the exact analogous branch point** where a
    flag-gated redesign mount (e.g. `isAdminRedesignEnabled() ?
    <AdminRedesign auth={auth} section={section}
    onSectionChange={setSection} /> : (existing branch above)`) would be
    added — inside this function, not inside `main.jsx`. Note also that
    `apps/admin-web/src/main.jsx` (not `portal-app.jsx` — this file is not
    named or shaped like it) is the actual root render call
    (`createRoot(...).render(<FluentProvider
    theme={webLightTheme}><OnboardingAdmin /></FluentProvider>)`); it is
    **not** the right place for a redesign branch, since it has no access
    to `auth`/`section` state — the branch belongs inside
    `OnboardingAdmin()` itself, mirroring exactly how Landlord/Manager/
    Tenant's redesign branch lives inside `Portal()`, not inside whatever
    file calls `createRoot(...).render(<Portal />)`.
- `apps/admin-web/src/locales/en.json` — read in full. Confirmed exact
  existing i18n namespaces reused verbatim by this spec, no content
  rewrite: `common.{switch_language,sign_out,refresh}`,
  `nav.{sections_label,onboarding,media_review}`,
  `auth.{restricted_console,sign_in_title,sign_in_subtitle,
  sign_in_button,status.{loading,authenticating,unavailable,error},
  redirect_failed}`, `review.{submitted,decided,status.{pending,approved,
  rejected},decision_reason_label,decision_reason_hint,approve,reject,
  not_authorized_review,api_unavailable,queue_load_failed,
  not_authorized_decide,decision_failed,platform_administration,
  page_title,page_subtitle,loading_applications,empty_state,
  access_denied,applications_list_label}`, `media_review.{untitled_listing,
  status.pending,property,unit,submitted,no_images,image_load_failed,
  room.{exterior,living,kitchen,bathroom,bedroom,dining,other},
  notes_label,notes_hint,approve,reject,not_authorized_review,
  queue_load_failed,not_authorized_decide,decision_failed,page_title,
  page_subtitle,loading_reviews,empty_state,list_label}`. All of the
  above exist today and are reused as-is; this spec neither adds nor
  edits any i18n key.
- `apps/admin-web/README.md` — read in full. Confirms: "The current
  privileged platform console reviews landlord-onboarding applications
  and records allowlisted human decisions. Broader organization,
  verification, support, reporting, reconciliation, and audit
  capabilities remain planned and are not current UI behavior." and
  "This app is separate from the operational portal. It must consume
  `@keyforta/contracts`, `@keyforta/api-client`, and
  `@keyforta/authorization`; every privileged action requires server-side
  authorization and an audit event," plus: "The API independently checks
  the verified Entra object ID against `PLATFORM_ADMIN_OBJECT_IDS` for
  every list and decision request," and the runtime-configuration
  section's explicit rule: "Never place a client secret, token,
  administrator object ID, or allowlist in a `VITE_` value;
  `PLATFORM_ADMIN_OBJECT_IDS` is injected only into the API from the
  protected GitHub environment." This justification is confirmed still
  accurate against the current code (§1 above) and this spec's §0
  reaffirms it — nothing here proposes merging or blurring that
  separation, and every constraint that paragraph implies for `VITE_`
  values applies with full force to any redesign flag (§8e).
- `packages/brand/src/index.js` — confirmed the same four approved brand
  hexes (`aubergine` #24162E, `mineralTeal` #267C78, `burnishedCopper`
  #C47A4A, `softBone` #F3EEE7) and two brand fonts (Instrument Sans
  display, Source Sans 3 body) as Landlord, Manager, and Tenant; no
  Admin-specific brand variant exists or is proposed.
- `apps/portal-web/src/redesign/manager/` (implemented code):
  `ManagerShell.jsx`, `index.jsx`, `components/PortfolioStatusLegend.jsx`,
  `redesign.css`, `statusTone.js`. Confirmed as the closest sibling
  precedent for a role with real data-bearing panels and status badges to
  restyle (unlike Tenant's empty shell) — `ManagerShell.jsx`'s role
  (wiring nav, topbar, content grid, and panel props together into one
  assembly component) is the correct structural precedent for an
  `AdminShell.jsx` (§3.2). **Confirmed NOT directly reusable as code
  imports**, for a reason none of the prior three phases encountered:
  `ManagerShell.jsx` and its siblings live under
  `apps/portal-web/src/redesign/manager/`, inside the `apps/portal-web`
  Vite app/workspace package (`@keyforta/portal-web`), which
  `apps/admin-web` (`@keyforta/admin-web`, confirmed via its
  `package.json`) does not depend on and cannot import from — these are
  two separate deployable apps with two separate build roots (§0(2)).
  Unlike Manager importing from `../landlord/...` or Tenant importing
  from `../landlord/...` (all inside one app), Admin has **no relative
  path** to any Landlord/Manager/Tenant redesign file. `statusTone.js`'s
  own status vocabulary (`draft`/`published`/`withdrawn` listing status)
  is in any case a completely different vocabulary from either of
  Admin's two (§5), so even if a cross-app import were possible, this
  file's *logic* would not transfer — only the *pattern* (a small,
  section-local tone-annotation helper rather than extending another
  phase's file) is precedent-worthy, flagged as a genuine new consideration
  in §3.2/§8a.
- `docs/engineering/REQUIREMENTS_GAPS.md` → "Redesigned per-role UI/UX
  with KEYFORTA branding" — confirms the approved bounded scope (additive,
  flag-gated, inside the existing app, reusing existing hooks, no API/
  authorization changes, Admin phase last, per the recorded phasing
  "Landlord first ... then Manager, then Tenant, then Admin," explicitly
  "(in `apps/admin-web`)") that this spec must stay inside. Two
  constraints in that entry are **specific to Admin's higher privilege
  level** and are treated as non-negotiable, not open, in this document
  (§8e): "any dev-only `?role=` or similar bypass must not be reachable...
  when the app is built/deployed for a non-development environment," and
  "no secret, credential, or allowlisted identity value (mirroring the
  existing `PLATFORM_ADMIN_OBJECT_IDS` rule in `apps/admin-web/README.md`)
  may ever be placed in a `VITE_` build value, including any new
  redesign-related flag."

---

## 2. Technology & design-token decision: full reuse, no new decisions

**No new technology decision is made here.** Admin continues on Fluent
UI v9 (confirmed via `apps/admin-web/package.json`,
`@fluentui/react-components` `9.72.5`, matching Landlord/Manager/Tenant),
themed with the same brand tokens, per `LANDLORD_REDESIGN_SPEC.md` §2.
Specifically reused **as-is in value, but not as a literal cross-app
import** (§1's confirmed workspace-boundary finding — see §3/§8a for the
consequence):

- The generated 16-step `mineralTeal` brand ramp and the
  `landlordRedesignTheme` object's Fluent-default overrides
  (`apps/portal-web/src/redesign/landlord/theme.js`, Landlord §11.4) — the
  *values* are role-neutral KEYFORTA-brand values, not Landlord-specific,
  exactly as Manager §2/§8a and Tenant §2/§8a already found. What is new
  for Admin is that these values cannot be imported from that file's path
  at all (§1) — they must be reproduced from the same source values,
  either via a newly extracted shared package or a locally duplicated
  file (§3.2, §8a).
- `LANDLORD_REDESIGN_SPEC.md` §3 (design tokens: color usage rules and
  WCAG table, typography scale, spacing/sizing scale, elevation/surfaces)
  — reused verbatim, no Admin-specific variant. Every contrast pairing,
  font, spacing step, and radius value in Landlord §3 applies unchanged to
  every Admin screen designed below.
- `LANDLORD_REDESIGN_SPEC.md` §11 (visual-quality-bar addendum: two-layer
  shadows, 20px card radius, 3px category-colored top accent bar, kicker
  pills, sidebar/nav-item weighting, grid `align-items: start`,
  content-driven card height) — reused verbatim in *rule*. Admin's two
  section queues use the same accent-bar category mapping Landlord,
  Manager, and Tenant already apply to their own "Needs attention"/
  activity-style cards — this spec designates Admin's onboarding queue and
  media-review queue cards as `aubergine`-tint informational/decision
  cards (not `mineralTeal` action/workflow, since these are review-and-
  decide records, not a landlord/manager's own workflow actions — a small,
  presentation-only category choice, not a new token).

**Nothing in this document introduces a new hex, a new font, a new
spacing/radius value, or a new shadow recipe.** Where this spec differs
from Landlord/Manager/Tenant, it differs only in (a) information
architecture (which screens/components exist for this role, and how
narrow Admin's nav is compared to the others) and (b) the mechanical fact
that shared code must be reproduced rather than imported across the
app boundary (§1, §3.2) — never in the underlying design-system tokens.

---

## 3. Component reuse vs. new components

### 3.1 Reused directly, unmodified — by pointer, not by import

Because `apps/admin-web` cannot import from `apps/portal-web/src/
redesign/...` (§1, §2), "reuse" for Admin means: the Frontend Engineer
must obtain the *same token values and state-treatment rules* — either
via a newly extracted shared package (§8a option ii) or a locally
reproduced/duplicated file (§8a option iii) — never a different set of
values, never a redesigned rule. The following rules/values are reused,
by reference to their canonical source, exactly as Manager/Tenant reused
them from Landlord:

| Rule/value | Canonical source | Admin application |
|---|---|---|
| Brand ramp + Fluent theme overrides | `LANDLORD_REDESIGN_SPEC.md` §2/§11.4 (values only — see above re: import path) | `FluentProvider` theme for the Admin redesign subtree, replacing `main.jsx`'s current plain `webLightTheme` when the flag is on |
| Color usage rules + WCAG contrast table, typography scale, spacing/sizing scale, elevation/surfaces | `LANDLORD_REDESIGN_SPEC.md` §3 | Applied verbatim to every Admin screen below |
| Two-layer shadows, 20px card radius, accent-bar categories, kicker pills, nav-item weighting, `align-items: start`, content-driven card height | `LANDLORD_REDESIGN_SPEC.md` §11 | Applied to Admin's queue/decision cards (§2 above) |
| Empty/loading/error/offline/denied canonical state treatment | `LANDLORD_REDESIGN_SPEC.md` §5.3 | Applied to both of Admin's queues — see §5 for the exact mapping, including where Admin's `denied` state (a real, reachable, 404-driven state, unlike Landlord/Manager/Tenant's `PendingWorkspaceAccess`-only denial) fits this canonical treatment |
| Form field styling rules | `LANDLORD_REDESIGN_SPEC.md` §5.4 | Applied to the decision-reason and reviewer-notes `Textarea`s (§4.2/§4.3/§6) — the first phase since Landlord itself to actually have a `Field`/`Textarea` form to apply this to (Manager and Tenant both had nothing to apply it to) |
| Banner / inline-feedback treatment | `LANDLORD_REDESIGN_SPEC.md` §5.2 | Applied to Admin's `state-message`/`denied-state` blocks (§5) |
| Auth screens (`auth-card`) restyled treatment | `LANDLORD_REDESIGN_SPEC.md` §5.6 | Applied to `LoginGate` — Admin's only pre-auth screen; there is no `PendingWorkspaceAccess`-equivalent screen in `apps/admin-web` (§4.4) |
| `AppBrand` component | `packages/ui/src/AppBrand.jsx` (already a genuinely shared workspace package, `@keyforta/ui`, depended on by **both** `apps/admin-web` and `apps/portal-web`) | **This one component is a literal, unmodified import already**, not a reproduced value — `OnboardingAdmin.jsx` already renders `<AppBrand surface="ADMIN" />` today. Landlord §8's open finding that `AppBrand` renders plain text, not the cataloged logo/wordmark SVG assets, applies identically here and is not re-decided (§8d). |

### 3.2 New component(s) specific to Admin

Unlike Tenant (§3.3 of that spec: "None are required beyond a single
assembly/layout component," because Tenant has no dedicated panel at
all), Admin's scope is closer to Manager's (§3.2: "None are required for
the narrow scope," but a `ManagerShell.jsx` was still needed as assembly).
Assessed honestly, Admin likely needs:

- **An `AdminShell.jsx`-equivalent assembly/layout component**, mirroring
  `ManagerShell.jsx`'s role: wiring the `SectionNav`, header chrome
  (`AppBrand`, identity display, language toggle, refresh, sign-out), and
  each section's content together. This is the same category of
  "assembly, not new visual pattern" component every prior phase needed.
- **Possibly a small, Admin-local status-tone/badge helper**, because
  Admin uniquely has **two different status vocabularies in the same app**
  (§0(1), §5): the onboarding queue's `pending`/`approved`/`rejected`
  *application* status (all three states reachable and rendered, since
  decided applications remain visible) and the media-review queue's
  `pending`-only *review* status (the only reachable state, since decided
  reviews are removed from view — §1). Whether these two badges need
  visually distinct treatment beyond their existing Fluent `Badge`
  `color` props (`warning`/`success`/`danger` for onboarding; `warning`
  only for media-review) to avoid a reviewer confusing "application
  approved" with "media approved" when switching sections is a genuine,
  non-obvious design question this spec does **not** resolve — flagged
  explicitly in §8d, not silently decided here. If the answer turns out
  to be "yes, add a distinguishing treatment," a small Admin-local helper
  (in the spirit of `apps/portal-web/src/redesign/manager/statusTone.js`'s
  precedent of *not* extending another phase's file, §1) would be the
  right shape — never a fork or extension of Manager's `statusTone.js`,
  whose vocabulary (`draft`/`published`/`withdrawn`) is unrelated and
  which Admin cannot import from in any case (§1/§2).
- **No next-best-action checklist.** Unlike Manager's genuinely
  ambiguous §8c or Tenant's more clear-cut §8c, Admin's case is the
  clearest "no" of any phase: every actionable item in both of Admin's
  queues is **already** a queue row with its own dedicated decision UI
  (reason/notes field + Approve/Reject buttons) — there is no "next
  step" for an administrator to be nudged toward that isn't already the
  entire content of the screen. This spec does not flag this as an open
  question requiring PO sign-off (§8b) — it is decided here as clearly
  not applicable, the way Manager/Tenant's §8d(k)-style design-system
  questions were decided as "not re-opened," not the way genuinely
  ambiguous product questions are left open.

---

## 4. Information architecture & layout

### 4.1 App shell (applies to both Admin sections)

Structurally different from Landlord/Manager/Tenant's left-sidebar +
main-content shell — Admin's current implementation (`OnboardingAdmin.jsx`)
has **no sidebar at all**: it is a single `admin-shell` div containing an
`admin-header` (brand + `SectionNav` + actions) and a `main` content area.
This spec's app-shell redesign preserves that structure rather than
retrofitting Landlord's sidebar pattern onto it — there is no product
reason to add a sidebar for exactly two sections, and doing so would be
exactly the kind of unrequested IA change §0 prohibits:

- **`admin-header`**: `AppBrand surface="ADMIN"` (left), `SectionNav`'s
  two buttons (center — "Onboarding," "Media review," exact labels from
  `nav.onboarding`/`nav.media_review`, restyled per Landlord §5.1's
  subtle/active-pill nav-item treatment, applied horizontally here rather
  than in a vertical sidebar list), and the `admin-actions` cluster
  (right): identity display (`auth.account.name || auth.account.username`,
  restyled as a user chip per Landlord §4.1's topbar user-chip pattern),
  language toggle, refresh button, sign-out button — all three restyled
  per Landlord §5.1 subtle-button treatment, unchanged copy/icons
  (`ArrowClockwise20Regular`, `SignOut20Regular`).
- **`main`**: a `page-heading` block (eyebrow `review.platform_
  administration` — shared verbatim across both sections, confirmed in
  `en.json` — plus each section's own `page_title`/`page_subtitle`) above
  the section's queue content. No stats strip, no quick-actions aside, no
  "Needs attention" panel exists for Admin today (those are
  Landlord/Manager/Tenant `portal-app.jsx` constructs that do not exist in
  `OnboardingAdmin.jsx`) — this spec does not invent any of them for
  Admin.

### 4.2 Onboarding review screen (`section === 'onboarding'`)

- **Queue-level state block** (above the list, §5 for the full state
  table): loading spinner + `review.loading_applications`; empty-state
  card with `review.empty_state`; denied-state card (`review.access_
  denied` heading + the specific not-authorized message) with **no**
  list rendered; a `role="alert"` error banner (`review.queue_load_
  failed` or, for `API_UNAVAILABLE`, `review.api_unavailable`) shown
  *above* a still-rendered ready list when a **decision** attempt fails
  without invalidating the whole queue (§1's confirmed distinction
  between a *load* failure, which replaces the queue, and a *decision*
  failure, which layers a banner over the still-rendered queue — unless
  the decision failure was itself a 404, which does replace the queue
  with the denied state, per §1).
- **Ready state**: a vertical list (`application-list`,
  `aria-label={review.applications_list_label}`) of `ReviewCard`s, each
  restyled as a bordered decision card (§2's `aubergine`-tint category)
  containing:
  - Eyebrow (`proposedOrganizationName`) + heading (`applicantName`) +
    status `Badge` (§5's badge mapping) — unchanged fields/values.
  - A definition list of `submitted`/`decided` dates (`decided` only
    shown when present) — unchanged.
  - **While `pending`**: the required decision-reason `Field`/`Textarea`
    (§3.1 form-field rules) plus Approve/Reject buttons (§5/§6 for exact
    disabled-state conditions) — restyled per Landlord §5.1 primary/
    secondary button treatment.
  - **Once decided**: the recorded reason shown as static
    `decision-evidence` text instead of the form — restyled as a quiet,
    read-only field block (no input affordance, since the record is
    immutable once decided — a genuinely new state-treatment category no
    prior phase's spec needed to design, since none of Landlord/Manager/
    Tenant's forms have a "this was already submitted and is now
    read-only" state).

### 4.3 Media review screen (`section === 'media-review'`)

- **Queue-level state block**: identical state shapes to §4.2 above
  (loading/empty/denied/error), with `media_review.*` copy substituted —
  `media_review.loading_reviews`, `media_review.empty_state`,
  `media_review.not_authorized_review`/`not_authorized_decide` for the
  denied variants, `media_review.queue_load_failed` (or the shared
  `review.api_unavailable` for `API_UNAVAILABLE` — §1 confirmed this
  cross-namespace string reuse already exists in code, not invented
  here).
- **Ready state**: a vertical list (`aria-label={media_review.list_
  label}`) of `MediaReviewCard`s, each restyled as the same bordered
  decision-card treatment as §4.2 (same `aubergine`-tint category — see
  §3.2/§8d for the open question on whether these two card types should
  be visually distinguished further), containing:
  - Eyebrow (`organizationName`) + heading (`title` or `media_review.
    untitled_listing`) + status `Badge`, **always** `media_review.status.
    pending` (§1 — no other value is ever reachable).
  - A definition list: `property` (`propertyName`), `unit` (`unitLabel`),
    `submitted` (`submittedAt`).
  - Optional `summary` paragraph (muted style) when present.
  - **Image gallery** (§4.3.1 below) — the single most visually complex
    element in either queue and the one genuinely new gallery-layout
    pattern this spec introduces relative to Landlord/Manager/Tenant
    (none of which render an image gallery in their redesigned surfaces
    today).
  - Optional reviewer-notes `Field`/`Textarea` (§3.1 form-field rules,
    `maxLength={2000}`, no `minLength` — §6) plus Approve/Reject buttons
    (§5/§6 for exact disabled-state conditions).

#### 4.3.1 Image gallery treatment

Two visually distinct image sources render in the same list, and this
spec's restyling must keep both legible and keep their trust distinction
visible to the reviewer, not merely stylistically unify them:

- **`uploadedImages`** (`ReviewImage`, §1): each item shows its own
  three-state treatment — a loading `Spinner` in a placeholder tile
  (§5.3 canonical loading treatment, sized to the eventual image's
  aspect ratio to avoid layout shift), an error tile
  (`media_review.image_load_failed`, §5.3 canonical error-tile
  treatment) if the blob-URL fetch fails, or the rendered `<img>` with a
  small caption below it naming the room (`media_review.room.*`,
  falling back to the raw room value via `defaultValue`). Restyled as a
  responsive image grid (not a single-column list), 3–4 columns on
  desktop, per Landlord §7's responsive breakpoints.
- **`imageUrls`** (legacy, §1): rendered in a separate list beneath the
  uploaded-image grid, each item either an `<a>` (safe http/https URL,
  `isSafeImageUrl`) styled as a plain text link — **not** rendered as an
  inline `<img>` thumbnail, since this spec does not propose fetching or
  embedding an unproven legacy URL as an image element, only linking to
  it exactly as the current implementation already does — or inert plain
  text (unsafe URL, rendered, not linked, exactly as today). **This
  safety branch (`isSafeImageUrl`) is not touched, re-implemented, or
  reinterpreted by this spec** — it is described here only so the
  Frontend Engineer restyles the two already-distinct render branches
  (link vs. plain text) without collapsing them into one visual
  treatment that would hide the distinction from a reviewer.
- **No-images state**: `media_review.no_images`, shown only when both
  `uploadedImages` and `imageUrls` are empty (§1's confirmed exact
  condition) — restyled per §5.3's canonical inline empty-state text
  treatment (not a full empty-state card, since it is one line within an
  otherwise-populated decision card, not a whole-screen state).

### 4.4 Pre-auth `LoginGate` screen

Mirrors Landlord §5.6's restyled `auth-card` treatment exactly (also cited
identically by Manager §3.1 and Tenant §3.1): brand lockup, eyebrow,
title/subtitle, primary sign-in button when `signed-out`, else a
`role="status"` message block with a `Spinner` for `loading`/
`authenticating`. **There is no `PendingWorkspaceAccess`-equivalent
screen in `apps/admin-web`** — Landlord/Manager/Tenant's
`PendingWorkspaceAccess` (a distinct denied/pending-access screen
rendered before the main shell) does not exist in `OnboardingAdmin.jsx`;
Admin's only pre-shell screen is `LoginGate`, and its post-sign-in denial
path (§4.2/§4.3's `denied` state) is rendered **inside** each section's
own shell, not as a separate pre-shell screen. This is a real, existing
structural difference, not an omission by this spec.

---

## 5. Component treatment — state-by-state mapping

All rules below are the same rules as `LANDLORD_REDESIGN_SPEC.md` §5,
applied to Admin's actual two queues. No new visual rule is introduced;
this section exists only to make the state-by-state mapping explicit and
auditable for a Frontend Engineer who has not read every line of the
Landlord spec.

| State / element | Landlord spec rule reused | Onboarding queue | Media-review queue |
|---|---|---|---|
| Queue `loading` | §5.3 canonical loading | `Spinner` + `review.loading_applications`, `role='status'` | `Spinner` + `media_review.loading_reviews`, `role='status'` |
| Queue `empty` | §5.3 canonical empty state | `review.empty_state`, `role='status'` | `media_review.empty_state`, `role='status'` |
| Queue `denied` | §5.3 canonical denied state (**flag**: no explicit `role` on the current `denied-state` div — §7/§8c) | `review.access_denied` heading + `not_authorized_review`/`not_authorized_decide` message | Identical shape, `media_review.*` copy |
| Queue `error` (load failure, incl. `API_UNAVAILABLE`) | §5.2 error banner, `role='alert'` | `review.queue_load_failed` / `review.api_unavailable` | `media_review.queue_load_failed` / shared `review.api_unavailable` |
| Decision failure (non-404) | §5.2 error banner, `role='alert'`, layered over a still-`ready` list | `review.decision_failed` | `media_review.decision_failed` |
| Decision failure (404) | §5.3 canonical denied state | Replaces queue with `denied`/`not_authorized_decide` | Replaces queue with `denied`/`not_authorized_decide` |
| Success (decision applied) | **No dedicated success banner exists in either queue today** — not invented here | Row updates in place, stays visible in decided/read-only form (§4.2) | Row is removed from the list entirely (§1/§4.3) |
| Status badge vocabulary | §5.5's badge-table *pattern* (mapping known values to Fluent semantic colors), **not** its specific values | `pending`→warning, `approved`→success, `rejected`→danger — a genuinely different, three-value, *application*-status vocabulary | `pending`→warning only — a genuinely different, one-value-reachable, *review*-status vocabulary (§1, §3.2) |
| Decision-reason / reviewer-notes form fields | §5.4 form-field styling | Required `Textarea`, `minLength=3`/`maxLength=1000` | Optional `Textarea`, `maxLength=2000`, required-in-effect for reject only (`canReject`) |
| Approve/Reject buttons | §5.1 primary/secondary | `disabled={busy \|\| reason.trim().length < 3}` (both buttons) | Approve: `disabled={busy \|\| decision !== ''}`; Reject: additionally `\|\| !canReject` |
| `ReviewImage` per-image state | §5.3 canonical loading/error, applied per grid cell rather than per screen | N/A | Loading spinner tile / error tile / rendered `<img>` |
| `LoginGate` | §5.6 `auth-card` | Identical, shared pre-auth screen for both sections | Identical |
| Offline state | §5.3 | **No offline state exists**, same explicit non-decision as Landlord §5.3/§8i, Manager §5/§8d, Tenant §5 — not revisited here | Same |

The two status vocabularies above are **not interchangeable** and this
spec does not treat them as one shared "status" concept even though both
happen to use the string `pending` — the onboarding queue's `pending` is
an *organization application awaiting the platform administrator's
approve/reject decision*; the media-review queue's `pending` is a *public
listing's media awaiting the platform administrator's approve/reject
decision before publication*. Whether the redesigned UI should visually
distinguish these further than their existing (already-different) badge
color sets do today is not resolved by this spec — see §8d.

---

## 6. Existing interactive element → redesigned treatment map

Every element below exists in code today; none is new, none is dropped.
This mirrors `LANDLORD_REDESIGN_SPEC.md` §6, `MANAGER_REDESIGN_SPEC.md`
§6, and `TENANT_REDESIGN_SPEC.md` §6, scoped to Admin's actual surface.

| Existing element (file:approx.) | Component today | Redesigned treatment |
|---|---|---|
| `SectionNav`'s two buttons (`OnboardingAdmin.jsx`) | `Button appearance={active ? 'primary' : 'subtle'}` | §5.1 subtle/active-pill treatment, horizontal not vertical |
| Language toggle (`OnboardingAdmin.jsx`, both headers) | `Button appearance='subtle'` | §5.1 subtle |
| Refresh button (`OnboardingAdmin.jsx`, both headers, `ArrowClockwise20Regular`) | `Button appearance='subtle'` icon button | §5.1 subtle icon button, unchanged icon |
| Sign-out button (`OnboardingAdmin.jsx`, both headers, `SignOut20Regular`) | `Button appearance='subtle'` icon button | §5.1 subtle icon button, unchanged icon |
| Identity display (`auth.account.name \|\| auth.account.username`) | Plain `<span className='identity'>` | Restyled user chip, Landlord §4.1 pattern |
| `LoginGate` sign-in button | `Button appearance='primary'` | §5.1 primary |
| `LoginGate` auth-status message | `role='status'` div + conditional `Spinner` | §5.6 `auth-card` status treatment |
| Onboarding status `Badge` | `Badge appearance='tint' color={pending?'warning':approved?'success':'danger'}` | §5.5-pattern mapping, unchanged colors/values |
| Decision-reason `Textarea` (`ReviewCard`) | `Textarea minLength={3} maxLength={1000} required` | §5.4 form-field styling, unchanged constraints |
| Onboarding Approve/Reject buttons | `Button appearance='primary'/'secondary' disabled={busy \|\| reason.trim().length<3}` | §5.1 primary/secondary, unchanged disabled logic |
| Decided-application evidence text (`decision-evidence`) | Plain `<div>`/`<p>` | Restyled quiet read-only field block (§4.2) |
| Media-review status `Badge` | `Badge appearance='tint' color='warning'` (always) | §5.5-pattern mapping, unchanged (always-pending) value |
| `ReviewImage` (`uploadedImages` gallery item) | `<div>` (loading/error) or `<img>` | §4.3.1 responsive grid tile, three-state treatment unchanged |
| `imageUrls` safe link | `<a href rel='noreferrer' target='_blank'>{url}</a>` when `isSafeImageUrl(url)` | Restyled as a plain-text-styled link, **safety branch untouched** |
| `imageUrls` unsafe entry | `<span>{url}</span>` when not `isSafeImageUrl(url)` | Restyled as inert text, **safety branch untouched** |
| Reviewer-notes `Textarea` (`MediaReviewCard`) | `Textarea maxLength={2000}` | §5.4 form-field styling, unchanged constraints |
| Media-review Approve button | `Button appearance='primary' disabled={busy \|\| decision !== ''}` | §5.1 primary, unchanged disabled logic |
| Media-review Reject button | `Button appearance='secondary' disabled={busy \|\| decision !== '' \|\| !canReject}` | §5.1 secondary, unchanged disabled logic |
| Queue error banner (`state-message error`, `role='alert'`) | Plain `<div>` | §5.2 error banner treatment |
| Queue loading/empty message (`state-message`, `role='status'`) | Plain `<div>` | §5.3 canonical loading/empty treatment |
| Denied state (`denied-state`) | Plain `<div>`, **no explicit `role`** | §5.3 canonical denied treatment — **role attribute question flagged, not fixed, §7/§8c** |

This table is complete against `OnboardingAdmin.jsx` as read in full
(§1) — there is no additional rendered interactive element in the file
beyond what is listed above.

---

## 7. Responsive & accessibility

Fully reused from `LANDLORD_REDESIGN_SPEC.md` §7 (breakpoints at >900px /
≤900px / ≤620px, all binding accessibility requirements: contrast table,
visible focus rings, preserved `aria-label`/`role` semantics, 40px touch
targets, `prefers-reduced-motion` respect, semantic HTML structure). No
Admin-specific variance in the *rules* — Admin's screens contain a subset
of the interactive element *types* Landlord's screens already satisfy
these requirements for (buttons, textareas, badges, banners, images), so
no new category of accessibility requirement is introduced.

One Admin-specific accessibility **fact** is worth preserving faithfully,
and one **inconsistency** is worth flagging rather than silently fixing,
both already present in `OnboardingAdmin.jsx` today:

- **Fact, preserve as-is:** the queue's non-denied error message uses
  `role='alert'` (`{queue.message && queue.status !== 'denied' &&
  <div className='state-message error' role='alert'>...`), while the
  queue's loading/empty messages use `role='status'`
  (`<div className='state-message' role='status'>`) — this is the
  correct, intentional distinction (assertive interruption for errors,
  polite announcement for routine state changes) and this spec's
  restyling must preserve both roles exactly, on both queues.
- **Inconsistency, flag rather than fix:** the `denied-state` block
  (`<div className='denied-state'><h2>{t('review.access_denied')}</h2>
  <p>{queue.message}</p></div>`) carries **no explicit `role`** at all —
  neither `alert` nor `status` — even though it is arguably the single
  most important state-change message in either queue (a platform
  administrator losing access mid-session). Whether this is an
  intentional omission (relying on the `<h2>` being discovered via
  normal heading navigation) or an oversight is not something this
  design spec resolves — it is recorded in §8c as an open question for
  engineering/accessibility sign-off, not silently corrected here, per
  this task's own instructions not to resolve open questions unilaterally.

---

## 8. Open questions / assumptions requiring PO or engineering sign-off

These are explicitly **not** decided by this document:

a. **Shared-component location — now genuinely forced, not merely
   "more pressing."** Manager §8a and Tenant §8a already flagged that a
   third phase importing Landlord's `theme.js`/`BrandHeader`/`StatusBadge`
   from `../landlord/...` made the "extract to a shared location" question
   more pressing without resolving it. For Admin, the situation is
   qualitatively different, not just quantitatively: **there is no
   relative-import path at all** from `apps/admin-web` to
   `apps/portal-web/src/redesign/...` (§1/§2 — separate workspace
   packages, separate Vite build roots). Admin's Frontend Engineer
   therefore has only two options, not three: (i) extract the
   role-neutral values (brand theme/ramp, canonical state-treatment CSS,
   any genuinely shared component) into a proper shared workspace package
   (most plausibly `packages/ui`, which already exports `AppBrand` and is
   already a dependency of **both** `apps/admin-web` and
   `apps/portal-web` — a real, working precedent for exactly this kind of
   extraction, unlike the deferred hypothetical in Manager/Tenant §8a), or
   (ii) independently reproduce/duplicate the same token values in a new,
   Admin-local file under `apps/admin-web/src/redesign/admin/` (drift risk
   over time, since there would now be **two** independently-maintained
   copies of the brand ramp/theme instead of one canonical file imported
   three ways). This spec does not pick one — flagged for the Frontend
   Engineer with the Solution Architect, but flagged with unusual urgency:
   by Phase 4, continuing to defer this (as Manager §8.1 and, implicitly,
   Tenant did) means the initiative will ship four independent
   implementations of the "same" brand theme object across two apps, which
   is exactly the kind of design-system drift a shared package exists to
   prevent.
b. **Whether Admin needs a next-best-action checklist.** Decided in §3.2
   above as a clear "no," **not** left open — every actionable item is
   already a queue row with its own decision UI, unlike a "next step"
   checklist pattern. Recorded here only so a future reader confirms this
   was actively considered per this phase's instructions, not overlooked.
c. **`role='alert'`/`role='status'`/denied-state accessibility
   consistency (§7).** Should the `denied-state` block also carry an
   explicit `role` (and if so, `alert` — an access-loss event — or
   `status`)? This is a genuine accessibility-engineering question, not a
   visual-design one, and this spec does not resolve it — flagged for
   engineering/accessibility sign-off before the redesigned `denied-state`
   treatment is implemented, so the same (in)consistency is not simply
   carried forward without a decision either way.
d. **Whether the redesign should visually distinguish the two different
   status vocabularies (onboarding application status vs. media-review
   status), beyond their already-different badge color sets (§3.2, §5).**
   A platform administrator switching between the "Onboarding" and "Media
   review" sections sees a `pending`/`approved`/`rejected` badge in one and
   a `pending`-only badge in the other; whether an additional visual cue
   (e.g. a distinct icon, section-colored accent bar, or badge label
   qualifier like "Application: Pending" vs. "Media: Pending") is needed
   to prevent a reviewer from confusing "the organization's application
   was approved" with "this listing's media was approved" is a genuine,
   non-obvious open UX question. This spec does not resolve it — flagged
   for PO/UX sign-off, since resolving it either way (adding a
   qualifier vs. leaving the existing distinct-badge-set as sufficient) is
   a product decision about how much visual redundancy a platform
   administrator's workflow needs, not something the existing code
   already answers.
e. **The security-sensitive constraints from `REQUIREMENTS_GAPS.md`
   (§1) are restated here as non-negotiable, not open:** (i) no dev-only
   `?role=`-style or similar bypass may be reachable when
   `apps/admin-web` is built/deployed for a non-development environment;
   (ii) no secret, credential, or allowlisted identity value — mirroring
   `apps/admin-web/README.md`'s explicit `PLATFORM_ADMIN_OBJECT_IDS` rule
   — may ever be placed in a `VITE_` build value, including any new
   redesign flag (e.g. `VITE_REDESIGN_ENABLED` or its Admin-specific
   successor, if one is even needed — see §8f). These are the most
   security-sensitive constraints of any of the four phases, since Admin
   is the most privileged of the four roles and the only one whose API
   independently enforces an allowlisted-identity check (§1) — this spec
   does not soften, reinterpret, or leave ambiguous either constraint.
f. **Exact flag name/mechanism for Admin.** Whether Admin reuses the
   exact string `VITE_REDESIGN_ENABLED` (as all three prior phases did,
   per each phase's own §8/§9) or needs its own Admin-scoped flag name
   (since it lives in a different app's `.env`/build config entirely,
   `apps/admin-web/.env.local` vs. `apps/portal-web`'s) is not decided
   here — flagged for the Frontend Engineer with the Solution Architect,
   consistent with Landlord §8k/Manager §8d/Tenant §8e's identical,
   still-unresolved question, now applied to a genuinely separate app's
   build configuration rather than a same-app second consumer.
g. **Non-brand semantic status colors, font sourcing/licensing, Fluent
   `BrandVariants` ramp review, icon set choice, illustration style, and
   the `AppBrand` plain-text-vs-logo-asset finding** — all identical open
   questions already recorded in `LANDLORD_REDESIGN_SPEC.md` §8(a, b, c,
   d, f, g) and reiterated unresolved by Manager §8d and Tenant §8e, not
   re-opened or re-decided here; whatever the PO/engineering resolves for
   Landlord applies identically to Admin since these are design-system-
   level, not role-level, questions.
h. **File location** (this note) — same as Landlord §8l, Manager §8g, and
   Tenant §8h: this file lives at `docs/product/ADMIN_REDESIGN_SPEC.md`
   pending a `docs/design/` convention with directory-creation tooling.

No "implementation defaults chosen" section is included in this document,
for the same reason Tenant's spec gave (§8, that document): this is a
design spec produced before implementation begins, and resolving §8's
open questions here, by the UX Designer, would be exactly the kind of
silent invention this task's instructions prohibit. If the Product Owner
is unavailable when Admin implementation starts, the Frontend Engineer may
record their own "implementation defaults chosen" note at that time,
following the same reasoning and reversibility discipline Manager's §8.1
already demonstrated (and Tenant's spec explicitly declined to pre-empt) —
that is a decision for whoever writes the code, not for this document.
Given this is the **final** phase of the initiative, whoever resolves
§8(a) in particular should treat that resolution as applying retroactively
to Manager/Tenant's own still-open §8(a) as well, not as an Admin-only
answer, since a shared-package extraction (if chosen) would sensibly
migrate all three prior phases' imports too — but that migration decision
is itself out of this document's authority to make.

---

## 9. Acceptance checklist for Frontend Engineer implementation review

- [ ] All new code lives under a new, isolated directory inside
      `apps/admin-web/src/` (e.g. `apps/admin-web/src/redesign/admin/`,
      mirroring the `redesign/<role>/` convention already proven for
      Landlord/Manager/Tenant inside `apps/portal-web`); the only change
      to any existing file is the single, minimal mount-point branch
      inside `OnboardingAdmin()` (§1 — **not** `main.jsx`, and **not**
      `portal-app.jsx`, which does not exist in this app) plus
      additive-only new i18n keys in `apps/admin-web/src/locales/
      en.json`/`fr.json` **if and only if** any are actually needed (this
      spec adds no new copy — §1 confirms every referenced string already
      exists) — every other existing file, including
      `OnboardingAdmin.jsx`'s existing exports, `onboarding-api.js`,
      `media-review-api.js`, and `styles.css`, remains byte-for-byte
      unchanged.
- [ ] No new deployable app or service is created; `apps/admin-web`
      remains a separate app from `apps/portal-web`, and this redesign
      does not move, merge, or duplicate either app's onboarding/media-
      review capability into the other (§0(2)) — independently verifiable
      by confirming no new `apps/*` directory and no cross-app import
      exists.
- [ ] No new privileged action, no new review category, no bulk-decision
      action, and no relaxation of the existing required-reason
      (`minLength={3}`) or required-notes-for-reject (`canReject`)
      validation is introduced anywhere under the new redesign directory
      (§0(3)) — independently verifiable by diffing the redesigned forms'
      validation logic against §6's map.
- [ ] Flag-gated using the same mechanism as Landlord/Manager/Tenant
      (reuse `VITE_REDESIGN_ENABLED` or Admin's own confirmed successor
      per §8f — do not invent a flag without a stated reason); flag-off
      path renders byte-for-byte identical to today for every Admin
      session. The flag value itself contains no secret, credential, or
      allowlisted identity value (§8e(ii)), and the redesigned Admin
      surface is not reachable via any dev-only bypass in a non-
      development build (§8e(i)) — both independently verifiable, not
      merely asserted.
- [ ] Code-split via `lazy()`/`Suspense` with an error boundary falling
      back to the existing legacy Admin console (both sections) on a
      failed chunk load, mirroring `LandlordRedesignErrorBoundary`'s/
      `ManagerRedesignErrorBoundary`'s already-reviewed pattern — not
      reinvented from scratch, even though it must be newly wired inside
      `OnboardingAdmin()` rather than `portal-app.jsx`.
- [ ] Fluent UI v9 continues to be used; theme sourced from the same
      brand-token *values* as Landlord/Manager/Tenant (§2/§3.1/§8a
      resolves exactly *how* those values are obtained across the app
      boundary before this box is checked) — no ad hoc hex outside the
      documented brand palette + Fluent semantic status tokens.
- [ ] Every element in §6's map is present, calling the same existing
      hooks/API client functions (`onboardingApi`, `mediaReviewApi`,
      `adminAuth`) — no reimplemented auth/session/decision logic, and
      critically, **no new hook, API call, or data fetch introduced**
      beyond what `OnboardingAdmin.jsx` already performs.
- [ ] `isSafeImageUrl`'s safety branch (§1, §4.3.1, §6) is preserved
      exactly — both the safe-link and unsafe-plain-text render paths
      remain visually distinguishable after restyling, and the function's
      logic itself is neither modified nor reimplemented anywhere under
      the new redesign directory.
- [ ] All contrast pairings match Landlord §3.1.1's verified table
      (reused, not re-derived).
- [ ] All states in §5's table (loading/empty/denied/error/ready, per
      queue) are implemented exactly as `ReviewQueue`/`MediaReviewQueue`
      already produce them; no offline state added; the media-review
      queue's decided-item-removal behavior and the onboarding queue's
      decided-item-retained-read-only behavior are each preserved exactly
      as-is, not unified into one shared behavior (§1/§5).
- [ ] Every open question in §8 has either been answered by the named
      owner, or the implementation defers that specific piece rather than
      guessing — in particular §8a (shared-component location, now with
      only two real options, not three) and §8d (status-vocabulary visual
      distinction) must not be built speculatively without a Solution
      Architect/PO answer.
- [ ] This is the final phase of the initiative: once this checklist is
      satisfied, `docs/engineering/REQUIREMENTS_GAPS.md`'s "Redesigned
      per-role UI/UX with KEYFORTA branding" row should be reviewed for
      whether all four phases' completion now warrants moving that row's
      status beyond "Pending Product Owner confirmation" — that
      determination belongs to the Product Owner, not to this checklist,
      but the Frontend Engineer should surface it rather than leave the
      row stale.
