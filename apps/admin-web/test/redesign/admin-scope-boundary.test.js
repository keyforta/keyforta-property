import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Automated coverage for docs/product/ADMIN_REDESIGN_SPEC.md §9's
// acceptance checklist — the boundary rules that must hold for every
// future change under this directory, not just the current one. Mirrors
// apps/portal-web/test/redesign/manager-scope-boundary.test.js /
// tenant-scope-boundary.test.js, adjusted for Admin's own app boundary
// (spec §0(2)/§1/§2): unlike Manager/Tenant, Admin cannot import from
// `apps/portal-web/src/redesign/...` at all (separate Vite app/workspace,
// separate build root) — so the single most important boundary here is
// that NONE of `apps/portal-web/**` is ever touched by this phase.
const adminDir = path.resolve(__dirname, '../../src/redesign/admin');
const repoRoot = path.resolve(__dirname, '../../../..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

describe('Admin redesign scope boundaries (spec §0/§1/§9)', () => {
  const files = walk(adminDir).filter((file) => /\.(jsx?|css)$/.test(file));

  it('finds at least one file to check (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never imports anything from apps/portal-web (no relative-import path exists across this app boundary — spec §1/§2)', () => {
    const offenders = files.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return /portal-web/.test(source) || /redesign\/(landlord|manager|tenant)/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it('never imports/extends apps/portal-web/src/redesign/manager/statusTone.js (Admin\u2019s two status vocabularies are unrelated to Manager\u2019s draft/published/withdrawn vocabulary and this app cannot import that file in any case — spec §3.2/§5)', () => {
    const offenders = files.filter((file) => /manager\/statusTone/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never mentions ListingPublicationPanel or PropertyManagementPanel anywhere under redesign/admin/ (neither capability exists in apps/admin-web at all — spec §0/§1/§9)', () => {
    const offenders = files.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return source.includes('ListingPublicationPanel') || source.includes('PropertyManagementPanel');
    });
    expect(offenders).toEqual([]);
  });

  it('never imports/renders a next-best-action checklist for Admin (spec §3.2/§8b — decided as a clear "no", not built speculatively)', () => {
    const offenders = files.filter((file) => /NextBestActionChecklist|checklist\.js/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('never reimplements isSafeImageUrl under redesign/admin/ (spec §4.3.1/§6/§9 — the safety branch\u2019s logic must never be reimplemented; it is imported, unmodified, from OnboardingAdmin.jsx)', () => {
    const shellSource = fs.readFileSync(path.join(adminDir, 'AdminShell.jsx'), 'utf8');
    expect(shellSource).toMatch(/isSafeImageUrl/);
    expect(shellSource).toMatch(/from ['"]\.\.\/\.\.\/OnboardingAdmin\.jsx['"]/);
    const offenders = files.filter((file) => {
      if (path.basename(file) === 'AdminShell.jsx') return false;
      return /function isSafeImageUrl/.test(fs.readFileSync(file, 'utf8'));
    });
    expect(offenders).toEqual([]);
  });

  it('introduces no unexpected component file beyond the documented set (spec §3.2 — AdminShell.jsx/index.jsx/redesign.css/theme.js/statusTone.js — plus the dev-only __fixtures__ preview harness, never part of the production entry point)', () => {
    const relativeFiles = files.map((file) => path.relative(adminDir, file));
    const allowed = new Set([
      'AdminShell.jsx',
      'index.jsx',
      'redesign.css',
      'theme.js',
      'statusTone.js',
      '__fixtures__/AdminPreview.jsx',
      '__fixtures__/preview-entry.jsx',
      '__fixtures__/previewFixtures.js',
    ]);
    const offenders = relativeFiles.filter((file) => !allowed.has(file));
    expect(offenders).toEqual([]);
  });

  it('adds no new i18n key/locale file under redesign/admin/ (spec §1 — every review.*/media_review.* string is reused verbatim, no content rewrite)', () => {
    expect(fs.existsSync(path.join(adminDir, 'locales'))).toBe(false);
  });
});

describe('Hard-protected files stay byte-for-byte unchanged (content-hash guard against a checked-in manifest)', () => {
  // Same rationale as apps/portal-web/test/redesign/manager-scope-boundary.
  // test.js's/tenant-scope-boundary.test.js's identical describe block: a
  // checked-in JSON manifest, separate from the test file itself, so any
  // legitimate future change to one of these files is an explicit,
  // visible decision in the PR diff, not something that can slip through
  // silently. Unlike the Portal-web phases (which protect specific
  // sibling redesign directories plus two shared panel components), this
  // Admin phase's most important boundary is a whole separate app: EVERY
  // tracked file under `apps/portal-web/` must remain byte-for-byte
  // unchanged (spec §0(2) — Admin never moves, merges, or duplicates
  // capability into/from that app).
  //
  // To intentionally update after an approved change to one of these
  // files, regenerate the manifest with:
  //   node -e "const fs=require('fs'),crypto=require('crypto');
  //     const files=require('./test/redesign/__fixtures__/admin-protected-file-checksums.json');
  //     for (const f of Object.keys(files)) console.log(f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));"
  const protectedFiles = JSON.parse(
    fs.readFileSync(path.join(__dirname, '__fixtures__/admin-protected-file-checksums.json'), 'utf8'),
  );

  it('lists a substantial number of protected files under apps/portal-web/ (sanity check — this phase must never touch that app at all)', () => {
    const relativePaths = Object.keys(protectedFiles);
    expect(relativePaths.length).toBeGreaterThan(50);
    expect(relativePaths.every((file) => file.startsWith('apps/portal-web/'))).toBe(true);
  });

  it.each(Object.entries(protectedFiles))('matches its checked-in manifest hash: %s', (relativePath, expectedHash) => {
    const absolutePath = path.join(repoRoot, relativePath);
    expect(fs.existsSync(absolutePath)).toBe(true);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    expect(actualHash).toBe(expectedHash);
  });

  it('no new file has been added under apps/portal-web/ beyond the manifest (git-tracked file count matches)', () => {
    // Uses `git ls-files` (the same source used to generate the manifest)
    // rather than a raw filesystem walk, so untracked local artifacts
    // (e.g. `.env.local`, Playwright's `test-results/`, screenshot output)
    // never produce a false positive here — this check is about tracked,
    // reviewable source, not local working-tree noise.
    const trackedFiles = execFileSync('git', ['ls-files', 'apps/portal-web'], { cwd: repoRoot, encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    expect(trackedFiles.sort()).toEqual(Object.keys(protectedFiles).sort());
  });
});


describe('OnboardingAdmin.jsx receives only an additive, isolated Admin mount point (no pre-existing line removed/edited)', () => {
  // OnboardingAdmin.jsx cannot be included in the byte-for-byte hash
  // manifest above, unlike the fully-protected files, because this Admin
  // phase must add its own mount point there (spec §9's single-file
  // exception, mirroring the identical exception already exercised by
  // Landlord/Manager/Tenant in portal-app.jsx). Instead, this checks the
  // weaker-but-still-meaningful invariant that every line already present
  // before this phase started still appears, unmodified, in the same
  // relative order in the current file — i.e. the diff is purely additive
  // (insertions only), never an edit or deletion of an existing line. The
  // baseline snapshot was captured from `git show origin/main:...` before
  // any Admin edit was made (see the snapshot file's own note).
  const baseline = fs.readFileSync(
    path.join(__dirname, '__fixtures__/OnboardingAdmin-pre-admin.snapshot.txt'),
    'utf8',
  ).split('\n');
  const current = fs.readFileSync(
    path.join(repoRoot, 'apps/admin-web/src/OnboardingAdmin.jsx'),
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
