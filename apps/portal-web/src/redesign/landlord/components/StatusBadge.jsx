// §5.5 status/badge pill treatment. A single shared component per the
// spec's "Single pill component" instruction — used for property type,
// unit type, and (via the `tone` prop) listing/availability status where
// the existing panels render `<span className='status'>` (unchanged
// markup — this component is only used by the *new* redesigned shell
// chrome, e.g. property/unit cards it renders around the reused panels;
// it does not replace anything inside PropertyManagementPanel/
// ListingPublicationPanel, which are reused unmodified).
const TONE_CLASS = {
  neutral: 'kf-badge-neutral',
  positive: 'kf-badge-positive',
  attention: 'kf-badge-attention',
  negative: 'kf-badge-negative',
  locked: 'kf-badge-locked',
};

export function StatusBadge({ children, tone = 'neutral' }) {
  return <span className={`kf-badge ${TONE_CLASS[tone] || TONE_CLASS.neutral}`}>{children}</span>;
}
