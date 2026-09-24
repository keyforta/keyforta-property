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
export function NextBestActionChecklist({ listings, onNavigateToProperties, properties }) {
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
          const clickable = row.status !== 'done' && row.key !== 'setPricing';
          return (
            <li className={`kf-checklist-row kf-checklist-row-${row.status}`} key={row.key}>
              <button
                aria-pressed={row.status === 'done'}
                className='kf-checklist-row-button'
                disabled={!clickable}
                onClick={clickable ? onNavigateToProperties : undefined}
                type='button'
              >
                <span aria-hidden='true' className='kf-checklist-icon'>
                  {row.status === 'done' ? '✓' : row.status === 'unknown' ? '?' : '○'}
                </span>
                <span className='kf-checklist-copy'>
                  <span className='kf-checklist-label'>{copy.label}</span>
                  <span className='kf-checklist-detail kf-small'>{detail}</span>
                </span>
                <span className='kf-checklist-status-badge' data-status={row.status}>{statusLabel[row.status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
