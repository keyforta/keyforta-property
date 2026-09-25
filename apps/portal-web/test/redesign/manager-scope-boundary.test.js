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

describe('Hard-protected files stay byte-for-byte unchanged (content-hash guard, not just existence)', () => {
  // Copilot review finding (PR #137): the previous version of this suite
  // only asserted these files exist/are readable -- any content edit
  // would still pass. These are the exact SHA-256 digests of the three
  // protected files as of this PR (matching `git diff --stat origin/main
  // -- <these paths>` being empty, verified manually before merge); any
  // future change to their bytes, in this PR or any later one touching
  // this directory, now fails this test instead of only being caught by
  // a manual `git diff` a reviewer might forget to run.
  const protectedFiles = {
    '../../src/listing-publication-panel.jsx':
      'ef1492a01b1c1705fc6f91990e235e57fb6a165a635e7b0fffc1d92365be2222',
    '../../src/property-management-panel.jsx':
      '0edc716a426d4dcc20b4f41a2342173483abb9cb17046d6e38574a8b8893b185',
    '../../src/styles.css':
      '0be6ac73cbd2e3d651612746252db40d55f43c46d7930e1d9f70fad148589cad',
  };

  it.each(Object.entries(protectedFiles))('matches its known-good content hash: %s', (relativePath, expectedHash) => {
    const absolutePath = path.resolve(__dirname, relativePath);
    expect(fs.existsSync(absolutePath)).toBe(true);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    expect(actualHash).toBe(expectedHash);
  });
});
