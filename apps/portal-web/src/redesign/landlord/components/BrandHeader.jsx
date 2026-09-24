import { keyfortaBrand } from '@keyforta/brand';
import wordmarkPrimary from '../assets/brand/keyforta-wordmark.png';
import wordmarkReversed from '../assets/brand/keyforta-wordmark-reversed.png';

// §8a of the spec: `packages/ui/src/AppBrand.jsx` renders text only, not
// the actual wordmark/symbol SVG assets cataloged in
// `packages/brand/src/assets.json`. Since AppBrand.jsx is an existing
// shared file this redesign must not modify, the redesigned landlord shell
// gets its own brand-header component here, reusing the same *asset
// files* already used elsewhere in the codebase (unmodified bytes, copied
// from apps/public-web/public/assets/brand) — but NOT
// `keyfortaBrand.assetPath()`'s root-relative (`/assets/brand/...`)
// resolution convention, which assumes the file lives in a `publicDir`
// that Vite copies into `dist/` unconditionally on every build,
// regardless of whether the flag-gated redesign chunk is ever requested
// (a PR review finding — see docs/engineering/REQUIREMENTS_GAPS.md).
// Importing the two PNGs this component actually uses as ordinary ES
// module specifiers instead makes Vite fingerprint/bundle them into the
// same lazily-loaded chunk as the rest of `./redesign/landlord/`, so they
// are only ever fetched when `VITE_REDESIGN_ENABLED` is on and a landlord
// session reaches this component — never unconditionally.
export function LandlordBrandHeader({ tone = 'reversed' }) {
  // The catalog's `.svg` wordmark files are thin wrappers around a raster
  // `<image xlink:href="…png">` (see packages/brand/src/assets.json's
  // sibling PNG files); per-spec HTML behavior strips *external* resource
  // fetches (like that nested PNG) when an SVG is loaded via a plain
  // `<img src>` element, rendering it blank. Every existing consumer of
  // these assets (`apps/public-web/src/components/Header.jsx`,
  // `Footer.jsx`, `*.styles.css`) already works around this by referencing
  // the `.png` file directly — matched here rather than reinventing a new
  // asset-loading approach.
  const asset = tone === 'reversed' ? wordmarkReversed : wordmarkPrimary;
  return (
    <div className='kf-brand-header'>
      <img alt={`${keyfortaBrand.name} logo`} className='kf-brand-header-mark' src={asset} />
    </div>
  );
}
