import { Button, Tooltip } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import { computeNextBestActionChecklist } from '../checklist.js';

// "Get your first listing live" checklist card
// (docs/product/LANDLORD_REDESIGN_SPEC.md §10.2). Renders four rows
// derived only from the `properties`/`listings` data already passed into
// this shell by `portal-app.jsx` (same `useRentalProperties`/
// `useManagerListings` hook results the reused panels already use) — no
// new fetch, no invented aggregate/percentage. Clicking an unchecked row
// scrolls to the relevant already-rendered panel (pure client-side
// orchestration of existing controls, per §10.2's explicit constraint).
export function NextBestActionChecklist({ listings, onRowAction, properties }) {
  const { t } = useTranslation();
  const rows = computeNextBestActionChecklist({ listings, properties });
  const anyPublished = rows.some((row) => row.key === 'publishListing' && row.status === 'done');

  const copyByKey = {
    addProperty: {
      done: t('landlord_redesign.checklist.add_property.done_detail'),
      label: t('landlord_redesign.checklist.add_property.label'),
      todo: t('landlord_redesign.checklist.add_property.todo_detail'),
    },
    addPhotos: {
      done: t('landlord_redesign.checklist.add_photos.done_detail'),
      label: t('landlord_redesign.checklist.add_photos.label'),
      todo: t('landlord_redesign.checklist.add_photos.todo_detail'),
      unknown: t('landlord_redesign.checklist.add_photos.unknown_detail'),
    },
    publishListing: {
      done: t('landlord_redesign.checklist.publish_listing.done_detail'),
      label: t('landlord_redesign.checklist.publish_listing.label'),
      todo: t('landlord_redesign.checklist.publish_listing.todo_detail'),
    },
    setPricing: {
      label: t('landlord_redesign.checklist.set_pricing.label'),
      unknown: t('landlord_redesign.checklist.set_pricing.unknown_detail'),
    },
  };

  const statusLabel = {
    done: t('landlord_redesign.checklist.status_done'),
    todo: t('landlord_redesign.checklist.status_todo'),
    unknown: t('landlord_redesign.checklist.status_unknown'),
  };

  return (
    <article className='panel kf-panel kf-checklist-card' data-testid='next-best-action-checklist'>
      <div className='panel-head'>
        <div>
          <h2 className='kf-section-heading'>
            {anyPublished
              ? t('landlord_redesign.checklist.title_after_published')
              : t('landlord_redesign.checklist.title_before_published')}
          </h2>
        </div>
      </div>
      <ul className='kf-checklist-list' role='list'>
        {rows.map((row) => {
          const copy = copyByKey[row.key];
          const detail = row.status === 'done' ? copy.done : row.status === 'unknown' ? copy.unknown : copy.todo;
          // Copilot PR #134 review finding #5: clickability must depend
          // only on whether the row is already done, not on which key it
          // is — every unchecked row (including 'unknown' ones, e.g.
          // "Set pricing & availability") has a real, reachable control
          // below it, so every unchecked row must stay actionable.
          const clickable = row.status !== 'done';
          return (
            <li className={`kf-checklist-row kf-checklist-row-${row.status}`} key={row.key}>
              {/* PO feedback ("Keep your listings up to date is taking so
                  much space, can you find a better design for it?"): each
                  row used to render its full explanatory sentence
                  (`detail`) as permanently-visible second-line text,
                  which — stacked one-per-line across four rows — made
                  this card the tallest thing on the page. The detail
                  text is still available (via a Fluent `Tooltip`,
                  `relationship='description'` so it supplements rather
                  than replaces the row's accessible name/label), just no
                  longer forces its own line; combined with
                  redesign.css's switch from a single stacked column to a
                  responsive multi-column grid, the whole card now
                  collapses to roughly its icon+label+badge height. */}
              <Tooltip content={detail} relationship='description'>
                <Button
                  appearance='transparent'
                  className='kf-checklist-row-button'
                  disabled={!clickable}
                  onClick={clickable ? () => onRowAction(row.key) : undefined}
                  type='button'
                >
                  <span aria-hidden='true' className='kf-checklist-icon'>
                    {row.status === 'done' ? '✓' : row.status === 'unknown' ? '?' : '○'}
                  </span>
                  <span className='kf-checklist-label'>{copy.label}</span>
                  {/* PO feedback ("no need to have done and the icon, the
                      icon is enough"): the visible status pill duplicated
                      what the icon already conveys. It's now visually
                      hidden (kept for assistive tech, since the icon
                      itself is aria-hidden) rather than removed outright. */}
                  <span className='kf-visually-hidden' data-status={row.status}>{statusLabel[row.status]}</span>
                </Button>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
