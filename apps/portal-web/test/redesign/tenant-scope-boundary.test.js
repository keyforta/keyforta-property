import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Automated coverage for docs/product/TENANT_REDESIGN_SPEC.md §9's
// acceptance checklist — the boundary rules that must hold for every
// future change under this directory, not just the current one. Mirrors
// test/redesign/manager-scope-boundary.test.js exactly, adjusted for
// Tenant's narrower (zero-panel) surface.
const tenantDir = path.resolve(__dirname, '../../src/redesign/tenant');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

describe('Tenant redesign scope boundaries (spec §0/§1/§9)', () => {
  const files = walk(tenantDir).filter((file) => /\.(jsx?|css)$/.test(file));

  it('finds at least one file to check (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never mentions ListingPublicationPanel or PropertyManagementPanel anywhere under redesign/tenant/ (the single most important scope boundary — §0/§1/§9; Tenant is authorized for neither, unlike Manager which is authorized for the first)', () => {
    const offenders = files.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return source.includes('ListingPublicationPanel') || source.includes('PropertyManagementPanel');
    });
    expect(offenders).toEqual([]);
  });

  it('never imports/renders a next-best-action checklist for Tenant (§8c/§4.2 item 3 — omitted, not built speculatively)', () => {
    const offenders = files.filter((file) => /NextBestActionChecklist|checklist\.js/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never imports/renders StatusBadge or a status-tone/legend helper for Tenant (spec §3.2 — no listing/status vocabulary exists for this role)', () => {
    const offenders = files.filter((file) => /StatusBadge|PortfolioStatusLegend|statusTone/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never builds a lease document viewer, payment history table, or maintenance request form (spec §0/§9 — none is designed by this spec)', () => {
    const offenders = files.filter((file) => /LeaseViewer|PaymentHistory|MaintenanceRequestForm/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports BrandHeader and the theme directly from ../landlord/..., never duplicating them (§8.1(a))', () => {
    const shellSource = fs.readFileSync(path.join(tenantDir, 'TenantShell.jsx'), 'utf8');
    const indexSource = fs.readFileSync(path.join(tenantDir, 'index.jsx'), 'utf8');
    expect(shellSource).toMatch(/from ['"]\.\.\/landlord\/components\/BrandHeader\.jsx['"]/);
    expect(indexSource).toMatch(/from ['"]\.\.\/landlord\/theme\.js['"]/);
    // No local, duplicated copy of either file exists.
    expect(fs.existsSync(path.join(tenantDir, 'components/BrandHeader.jsx'))).toBe(false);
    expect(fs.existsSync(path.join(tenantDir, 'theme.js'))).toBe(false);
  });

  it('introduces no component file beyond TenantShell.jsx/index.jsx/redesign.css (spec §3.3 — no Tenant-specific new component is required)', () => {
    const relativeFiles = files.map((file) => path.relative(tenantDir, file));
    const allowed = new Set(['TenantShell.jsx', 'index.jsx', 'redesign.css']);
    const offenders = relativeFiles.filter((file) => !allowed.has(file));
    expect(offenders).toEqual([]);
  });

  it('adds no new i18n key/locale file (spec §1 — every roles.tenant.*/actions.tenant string is reused verbatim, no content rewrite)', () => {
    expect(fs.existsSync(path.join(tenantDir, 'locales'))).toBe(false);
  });
});

describe('Hard-protected files stay byte-for-byte unchanged (content-hash guard against a checked-in manifest)', () => {
  // Same rationale as test/redesign/manager-scope-boundary.test.js's
  // identical describe block: a checked-in JSON manifest, separate from
  // the test file itself, so any legitimate future change to one of these
  // files is an explicit, visible decision in the PR diff, not something
  // that can slip through silently. Covers every file under the
  // already-merged, already-reviewed `redesign/landlord/` and
  // `redesign/manager/` directories, plus the two protected shared panel
  // components and the unscoped legacy stylesheet — everything this
  // Tenant phase must not modify.
  //
  // To intentionally update after an approved change to one of these
  // files, regenerate the manifest with:
  //   node -e "const fs=require('fs'),crypto=require('crypto');
  //     const files=require('./test/redesign/__fixtures__/tenant-protected-file-checksums.json');
  //     for (const f of Object.keys(files)) console.log(f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));"
  const repoRoot = path.resolve(__dirname, '../../../..');
  const protectedFiles = JSON.parse(
    fs.readFileSync(path.join(__dirname, '__fixtures__/tenant-protected-file-checksums.json'), 'utf8'),
  );

  it('lists at least one protected file per already-implemented sibling redesign directory plus the two shared panel components and legacy stylesheet (sanity check)', () => {
    const relativePaths = Object.keys(protectedFiles);
    expect(relativePaths.some((file) => file.includes('redesign/landlord/'))).toBe(true);
    expect(relativePaths.some((file) => file.includes('redesign/manager/'))).toBe(true);
    expect(relativePaths).toContain('apps/portal-web/src/listing-publication-panel.jsx');
    expect(relativePaths).toContain('apps/portal-web/src/property-management-panel.jsx');
    expect(relativePaths).toContain('apps/portal-web/src/styles.css');
  });

  it.each(Object.entries(protectedFiles))('matches its checked-in manifest hash: %s', (relativePath, expectedHash) => {
    const absolutePath = path.join(repoRoot, relativePath);
    expect(fs.existsSync(absolutePath)).toBe(true);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    expect(actualHash).toBe(expectedHash);
  });
});

describe('portal-app.jsx receives only an additive, isolated Tenant mount point (no pre-existing line removed/edited)', () => {
  // portal-app.jsx cannot be included in the byte-for-byte hash manifest
  // above, unlike the fully-protected files, because this Tenant phase
  // must add its own mount point there (spec §9's single-file exception,
  // mirroring the identical exception already exercised by Landlord/
  // Manager). Instead, this checks the weaker-but-still-meaningful
  // invariant that every line already present before this phase started
  // still appears, unmodified, in the same relative order in the current
  // file — i.e. the diff is purely additive (insertions only), never an
  // edit or deletion of an existing line. The baseline snapshot was
  // captured from `git show origin/main:...` before any Tenant edit was
  // made (see the snapshot file's own note).
  const repoRoot = path.resolve(__dirname, '../../../..');
  const baseline = fs.readFileSync(
    path.join(__dirname, '__fixtures__/portal-app-pre-tenant.snapshot.txt'),
    'utf8',
  ).split('\n');
  const current = fs.readFileSync(
    path.join(repoRoot, 'apps/portal-web/src/portal-app.jsx'),
    'utf8',
  ).split('\n');

  it('captured a non-trivial baseline to check against (sanity check)', () => {
    expect(baseline.length).toBeGreaterThan(100);
  });

  it('every baseline line appears, in the same relative order, within the current file (additive-only change)', () => {
    let cursor = 0;
    const missing = [];
    for (const line of baseline) {
      const foundAt = current.indexOf(line, cursor);
      if (foundAt === -1) {
        missing.push(line);
        continue;
      }
      cursor = foundAt + 1;
    }
    expect(missing).toEqual([]);
  });

  it('the current file is strictly longer than the baseline (something was genuinely added, not merely reordered)', () => {
    expect(current.length).toBeGreaterThan(baseline.length);
  });
});
