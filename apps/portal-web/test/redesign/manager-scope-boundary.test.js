import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Automated coverage for docs/product/MANAGER_REDESIGN_SPEC.md §9's
// acceptance checklist — the boundary rules that must hold for every
// future change under this directory, not just the current one.
const managerDir = path.resolve(__dirname, '../../src/redesign/manager');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

describe('Manager redesign scope boundaries (spec §0/§1/§9)', () => {
  const files = walk(managerDir).filter((file) => /\.(jsx?|css)$/.test(file));

  it('finds at least one file to check (sanity check)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('never mentions PropertyManagementPanel anywhere under redesign/manager/ (the single most important scope boundary — §0/§1/§9)', () => {
    const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes('PropertyManagementPanel'));
    expect(offenders).toEqual([]);
  });

  it('never imports/renders a next-best-action checklist for Manager (§8.1(c) — omitted, not built speculatively)', () => {
    const offenders = files.filter((file) => /NextBestActionChecklist|checklist\.js/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('imports StatusBadge, BrandHeader, and the theme directly from ../landlord/..., never duplicating them (§8.1(a))', () => {
    const shellSource = fs.readFileSync(path.join(managerDir, 'ManagerShell.jsx'), 'utf8');
    const indexSource = fs.readFileSync(path.join(managerDir, 'index.jsx'), 'utf8');
    const legendSource = fs.readFileSync(path.join(managerDir, 'components/PortfolioStatusLegend.jsx'), 'utf8');
    expect(legendSource).toMatch(/from ['"]\.\.\/\.\.\/landlord\/components\/StatusBadge\.jsx['"]/);
    expect(shellSource).toMatch(/from ['"]\.\.\/landlord\/components\/BrandHeader\.jsx['"]/);
    expect(indexSource).toMatch(/from ['"]\.\.\/landlord\/theme\.js['"]/);
    // No local, duplicated copy of any of the three files exists.
    expect(fs.existsSync(path.join(managerDir, 'components/BrandHeader.jsx'))).toBe(false);
    expect(fs.existsSync(path.join(managerDir, 'theme.js'))).toBe(false);
  });

  it('reuses ListingPublicationPanel unmodified (imported, not forked) — no local file of that name exists under redesign/manager/', () => {
    const shellSource = fs.readFileSync(path.join(managerDir, 'ManagerShell.jsx'), 'utf8');
    expect(shellSource).toMatch(/from ['"]\.\.\/\.\.\/listing-publication-panel\.jsx['"]/);
    expect(fs.existsSync(path.join(managerDir, 'listing-publication-panel.jsx'))).toBe(false);
  });
});

describe('Hard-protected files stay byte-for-byte unchanged (content-hash guard against a checked-in manifest)', () => {
  // Copilot review (PR #137, two passes):
  //   1st: the previous version of this suite only asserted these files
  //        exist/are readable -- any content edit would still pass.
  //   2nd: a hash hardcoded directly into a runtime test file is
  //        permanent/brittle -- any later *approved* change to one of
  //        these files (e.g. its own accessibility fix) would fail this
  //        test until someone edits the test file, and that edit could
  //        also mask the very regression the guard exists to catch.
  //
  // This repository already has an established, precedent-setting
  // pattern for exactly this trade-off:
  // `infra/postgres/migration-checksums.json` + the checksum-manifest
  // test in `.github/tests/devsecops-controls.test.mjs` — a checked-in
  // JSON manifest, separate from the test file itself, that CI verifies
  // matches. Updating it is a deliberate, reviewable, single-line diff
  // (not an edit buried inside test assertions), which is the *correct*
  // friction for a genuinely protected file: any legitimate future
  // change to one of these three files must be an explicit, visible
  // decision in the PR diff, not something that can slip through
  // silently. This mirrors that same pattern here.
  //
  // To intentionally update after an approved change to one of these
  // files, regenerate the manifest with:
  //   node -e "const fs=require('fs'),crypto=require('crypto');
  //     const files=require('./test/redesign/__fixtures__/manager-protected-file-checksums.json');
  //     for (const f of Object.keys(files)) console.log(f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));"
  const repoRoot = path.resolve(__dirname, '../../../..');
  const protectedFiles = JSON.parse(
    fs.readFileSync(path.join(__dirname, '__fixtures__/manager-protected-file-checksums.json'), 'utf8'),
  );

  it.each(Object.entries(protectedFiles))('matches its checked-in manifest hash: %s', (relativePath, expectedHash) => {
    const absolutePath = path.join(repoRoot, relativePath);
    expect(fs.existsSync(absolutePath)).toBe(true);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    expect(actualHash).toBe(expectedHash);
  });
});
