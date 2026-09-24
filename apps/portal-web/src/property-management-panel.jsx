import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Field, Input, Select, Spinner, Textarea } from '@fluentui/react-components';
import { useTranslation } from 'react-i18next';
import i18n from './i18n.js';
import { createApiClient } from '@keyforta/api-client';
import {
  availabilityVersionCreationEnvelopeSchema,
  createPublicListingEnvelopeSchema,
  deletePublicListingImageEnvelopeSchema,
  furnishingStatuses,
  pricingVersionCreationEnvelopeSchema,
  propertyTypes,
  publicListingImageListEnvelopeSchema,
  publicListingImageRooms,
  rentalPropertyCreationEnvelopeSchema,
  rentableUnitCreationEnvelopeSchema,
  supportedCurrencies,
  unitTypes,
  updatePublicListingDraftEnvelopeSchema,
  uploadPublicListingImageEnvelopeSchema,
} from '@keyforta/contracts';
import { resolveApiBaseUrl } from './listing-publication-panel.jsx';

const emptyPropertyForm = {
  name: '',
  propertyType: propertyTypes[0],
  avenueOrStreet: '',
  number: '',
  quartier: '',
  commune: '',
  city: '',
  province: '',
  countryCode: '',
  postalCode: '',
  timeZone: '',
  jurisdictionCode: '',
  unitLabel: '',
  unitType: unitTypes[0],
  bedrooms: '0',
  bathrooms: '1',
  furnishingStatus: furnishingStatuses[0],
};

const emptyUnitForm = {
  label: '',
  unitType: unitTypes[0],
  bedrooms: '0',
  bathrooms: '1',
  furnishingStatus: furnishingStatuses[0],
};

const emptyPricingForm = {
  amount: '',
  currency: supportedCurrencies[0],
};

const emptyListingForm = {
  title: '',
  summary: '',
  attestationAccepted: false,
};

// REQ-038 decision 1: image upload replaces the free-text imageUrls
// textarea for new/edited listings, so the form no longer collects or
// round-trips imageUrls; uploaded images are managed separately by
// ListingImageManager once the listing exists (see PublicListingForm).
function listingFormFromSummary(listing) {
  return {
    title: listing.title,
    summary: listing.summary || '',
    attestationAccepted: true,
  };
}

// REQ-038 decision 5: JPEG/PNG only, 10 MB max per file, client-side
// enforcement mirrors the API's own limits (source of truth remains the
// API's 400/409/422 responses).
const MAX_LISTING_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_LISTING_IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png'];
// REQ-037's existing 1-10 image cap is unchanged by REQ-038 (decision 5).
const MAX_LISTING_IMAGES = 10;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read the selected file.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

// Maps an API error (400/404/409/422/503) to a clear, non-technical
// user-facing message, following the same pattern as the existing
// validationError/attestationError fields on this form.
function mapListingImageErrorMessage(error, t) {
  switch (error?.code) {
    case 'CONFLICT':
      return t('property_management.listing_image_cap_reached');
    case 'MEDIA_SCAN_REJECTED':
      return t('property_management.listing_image_scan_rejected');
    case 'VALIDATION_ERROR':
      return t('property_management.listing_image_invalid');
    case 'NOT_FOUND':
      return t('property_management.listing_image_not_found');
    case 'DEPENDENCY_UNAVAILABLE':
      return t('property_management.listing_image_unavailable');
    default:
      return error instanceof Error ? error.message : t('property_management.listing_image_generic_error');
  }
}

// Converts a decimal-string user input (e.g. "400", "400.50", or the
// French-locale "400,50") into an integer minor-unit amount without
// floating-point arithmetic, per the Money(amountMinor, currency) invariant
// (REQ-034 / domain DDD 301).
function parseAmountMinor(amount) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(amount.trim());
  if (!match) return null;
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const minor = Number(`${match[1]}${fraction}`);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idempotency-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function resolveCommandAccessToken(session) {
  if (!session?.getAccessToken) throw new Error(i18n.t('property_management.sign_in_first'));
  return session.getAccessToken();
}

async function createPropertyManagementClient(session, accessToken) {
  return createApiClient({
    baseUrl: resolveApiBaseUrl().baseUrl,
    getOrganizationId: () => session?.organizationId ?? null,
    getToken: () => accessToken,
  });
}

function CreatePropertyForm({ disabled, onSubmit, t }) {
  const [form, setForm] = useState(emptyPropertyForm);
  const [busy, setBusy] = useState(false);
  const set = (field) => (_event, data) => setForm((current) => ({ ...current, [field]: data.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const submitted = await onSubmit(form);
      if (submitted) setForm(emptyPropertyForm);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form aria-labelledby='create-property-title' className='property-form' onSubmit={handleSubmit}>
      <h3 id='create-property-title'>{t('property_management.create_property_title')}</h3>
      <Field label={t('property_management.field.name')} required>
        <Input required value={form.name} onChange={set('name')} />
      </Field>
      <Field label={t('property_management.field.property_type')}>
        <Select value={form.propertyType} onChange={set('propertyType')}>
          {propertyTypes.map((option) => (
            <option key={option} value={option}>{t(`property_management.property_type.${option}`)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('property_management.field.avenue_or_street')} required>
        <Input required value={form.avenueOrStreet} onChange={set('avenueOrStreet')} />
      </Field>
      <Field label={t('property_management.field.number')} required>
        <Input required value={form.number} onChange={set('number')} />
      </Field>
      <Field label={t('property_management.field.quartier')} required>
        <Input required value={form.quartier} onChange={set('quartier')} />
      </Field>
      <Field label={t('property_management.field.commune')} required>
        <Input required value={form.commune} onChange={set('commune')} />
      </Field>
      <Field label={t('property_management.field.city')} required>
        <Input required value={form.city} onChange={set('city')} />
      </Field>
      <Field label={t('property_management.field.province')} required>
        <Input required value={form.province} onChange={set('province')} />
      </Field>
      <Field label={t('property_management.field.country_code')} required>
        <Input maxLength={2} required value={form.countryCode} onChange={set('countryCode')} />
      </Field>
      <Field label={t('property_management.field.postal_code_optional')}>
        <Input value={form.postalCode} onChange={set('postalCode')} />
      </Field>
      <Field label={t('property_management.field.time_zone')} required>
        <Input placeholder='Africa/Kinshasa' required value={form.timeZone} onChange={set('timeZone')} />
      </Field>
      <Field label={t('property_management.field.jurisdiction_code_optional')}>
        <Input value={form.jurisdictionCode} onChange={set('jurisdictionCode')} />
      </Field>
      <Field label={t('property_management.field.first_unit_label')} required>
        <Input required value={form.unitLabel} onChange={set('unitLabel')} />
      </Field>
      <Field label={t('property_management.field.unit_type')}>
        <Select value={form.unitType} onChange={set('unitType')}>
          {unitTypes.map((option) => (
            <option key={option} value={option}>{t(`property_management.unit_type.${option}`)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('property_management.field.bedrooms')} required>
        <Input min={0} required type='number' value={form.bedrooms} onChange={set('bedrooms')} />
      </Field>
      <Field label={t('property_management.field.bathrooms')} required>
        <Input min={1} required type='number' value={form.bathrooms} onChange={set('bathrooms')} />
      </Field>
      <Field label={t('property_management.field.furnishing_status')}>
        <Select value={form.furnishingStatus} onChange={set('furnishingStatus')}>
          {furnishingStatuses.map((option) => (
            <option key={option} value={option}>{t(`property_management.furnishing_status.${option}`)}</option>
          ))}
        </Select>
      </Field>
      <Button appearance='primary' disabled={disabled || busy} type='submit'>
        {busy ? <><Spinner size='tiny' /> {t('property_management.saving')}</> : t('property_management.create_property_submit')}
      </Button>
    </form>
  );
}

function AddUnitForm({ disabled, onSubmit, propertyId, t }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyUnitForm);
  const [busy, setBusy] = useState(false);
  const set = (field) => (_event, data) => setForm((current) => ({ ...current, [field]: data.value }));

  if (!open) {
    return (
      <Button appearance='secondary' disabled={disabled} onClick={() => setOpen(true)}>
        {t('property_management.add_unit_toggle')}
      </Button>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const submitted = await onSubmit(propertyId, form);
      if (submitted) {
        setForm(emptyUnitForm);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form aria-label={t('property_management.add_unit_title')} className='unit-form' onSubmit={handleSubmit}>
      <Field label={t('property_management.field.unit_label')} required>
        <Input required value={form.label} onChange={set('label')} />
      </Field>
      <Field label={t('property_management.field.unit_type')}>
        <Select value={form.unitType} onChange={set('unitType')}>
          {unitTypes.map((option) => (
            <option key={option} value={option}>{t(`property_management.unit_type.${option}`)}</option>
          ))}
        </Select>
      </Field>
      <Field label={t('property_management.field.bedrooms')} required>
        <Input min={0} required type='number' value={form.bedrooms} onChange={set('bedrooms')} />
      </Field>
      <Field label={t('property_management.field.bathrooms')} required>
        <Input min={1} required type='number' value={form.bathrooms} onChange={set('bathrooms')} />
      </Field>
      <Field label={t('property_management.field.furnishing_status')}>
        <Select value={form.furnishingStatus} onChange={set('furnishingStatus')}>
          {furnishingStatuses.map((option) => (
            <option key={option} value={option}>{t(`property_management.furnishing_status.${option}`)}</option>
          ))}
        </Select>
      </Field>
      <div className='unit-form-actions'>
        <Button appearance='primary' disabled={busy} type='submit'>
          {busy ? <><Spinner size='tiny' /> {t('property_management.saving')}</> : t('property_management.add_unit_submit')}
        </Button>
        <Button appearance='subtle' disabled={busy} onClick={() => setOpen(false)} type='button'>
          {t('property_management.cancel')}
        </Button>
      </div>
    </form>
  );
}

function initialAvailabilityForm(unit) {
  return {
    status: unit.availabilityStatus === 'unavailable' ? 'unavailable' : 'available',
    reasonCode: '',
  };
}

function UnitPricingAvailabilityForm({ disabled, onSetAvailability, onSetPricing, t, unit }) {
  const [open, setOpen] = useState(false);
  const [pricingForm, setPricingForm] = useState(emptyPricingForm);
  const [availabilityForm, setAvailabilityForm] = useState(() => initialAvailabilityForm(unit));
  const [pricingBusy, setPricingBusy] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [pricingValidationError, setPricingValidationError] = useState('');
  const [availabilityValidationError, setAvailabilityValidationError] = useState('');
  // Tracks the unit's version locally so a second command (pricing then
  // availability, or vice versa) within the same panel session uses the
  // version returned by the first mutation, instead of the stale prop value
  // that only updates once the parent's feed refetch completes.
  const [currentVersion, setCurrentVersion] = useState(unit.version);
  useEffect(() => {
    setCurrentVersion(unit.version);
    setAvailabilityForm(initialAvailabilityForm(unit));
  }, [unit.availabilityStatus, unit.version]);
  const setPricingField = (field) => (_event, data) => setPricingForm((current) => ({ ...current, [field]: data.value }));
  const setAvailabilityField = (field) => (_event, data) => setAvailabilityForm((current) => ({ ...current, [field]: data.value }));
  // Occupancy is lease-derived and manual availability commands only accept
  // 'available'/'unavailable' (never 'occupied'); submitting the default
  // form for an occupied unit would incorrectly override its status, so the
  // availability command is disabled entirely while a unit is occupied.
  const isOccupied = unit.availabilityStatus === 'occupied';
  // The two commands share the same optimistic-concurrency version, so only
  // one may be in flight at a time or the second would race the first with
  // a now-stale expectedVersion.
  const anyBusy = pricingBusy || availabilityBusy;

  if (!open) {
    return (
      <Button appearance='secondary' disabled={disabled} onClick={() => setOpen(true)}>
        {t('property_management.manage_unit_toggle')}
      </Button>
    );
  }

  const handlePricingSubmit = async (event) => {
    event.preventDefault();
    setPricingValidationError('');
    const amountMinor = parseAmountMinor(pricingForm.amount);
    if (amountMinor === null) {
      setPricingValidationError(t('property_management.amount_invalid'));
      return;
    }
    setPricingBusy(true);
    try {
      const newVersion = await onSetPricing(unit.id, currentVersion, { amountMinor, currency: pricingForm.currency });
      if (typeof newVersion === 'number') {
        setCurrentVersion(newVersion);
        setPricingForm(emptyPricingForm);
      }
    } finally {
      setPricingBusy(false);
    }
  };

  const handleAvailabilitySubmit = async (event) => {
    event.preventDefault();
    if (isOccupied) return;
    setAvailabilityValidationError('');
    if (availabilityForm.status === 'unavailable' && !availabilityForm.reasonCode.trim()) {
      setAvailabilityValidationError(t('property_management.reason_code_required'));
      return;
    }
    setAvailabilityBusy(true);
    try {
      const newVersion = await onSetAvailability(unit.id, currentVersion, {
        status: availabilityForm.status,
        reasonCode: availabilityForm.status === 'unavailable' ? availabilityForm.reasonCode.trim() : null,
      });
      if (typeof newVersion === 'number') {
        setCurrentVersion(newVersion);
        // Preserve the submitted status; only the reason input is cleared,
        // so a second click on "Update availability" does not silently flip
        // the unit back to a different state than what was just saved.
        setAvailabilityForm((current) => ({ ...current, reasonCode: '' }));
      }
    } finally {
      setAvailabilityBusy(false);
    }
  };

  return (
    <div className='unit-pricing-availability'>
      <h3>{t('property_management.manage_unit_title')}</h3>
      <form aria-label={t('property_management.pricing_form_label')} className='unit-form' noValidate onSubmit={handlePricingSubmit}>
        <Field label={t('property_management.field.monthly_rent_amount')} required validationMessage={pricingValidationError || undefined}>
          <Input disabled={anyBusy} inputMode='decimal' required value={pricingForm.amount} onChange={setPricingField('amount')} />
        </Field>
        <Field label={t('property_management.field.currency')}>
          <Select disabled={anyBusy} value={pricingForm.currency} onChange={setPricingField('currency')}>
            {supportedCurrencies.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        </Field>
        <Button appearance='primary' disabled={anyBusy} type='submit'>
          {pricingBusy ? <><Spinner size='tiny' /> {t('property_management.saving')}</> : t('property_management.set_pricing_submit')}
        </Button>
      </form>
      {isOccupied ? (
        <p className='unit-availability-occupied-note'>{t('property_management.availability_locked_occupied')}</p>
      ) : (
        <form aria-label={t('property_management.availability_form_label')} className='unit-form' noValidate onSubmit={handleAvailabilitySubmit}>
          <Field label={t('property_management.field.availability_status')}>
            <Select disabled={anyBusy} value={availabilityForm.status} onChange={setAvailabilityField('status')}>
              <option value='available'>{t('property_management.unit_availability_status.available')}</option>
              <option value='unavailable'>{t('property_management.unit_availability_status.unavailable')}</option>
            </Select>
          </Field>
          {availabilityForm.status === 'unavailable' ? (
            <Field label={t('property_management.field.reason_code')} required validationMessage={availabilityValidationError || undefined}>
              <Input disabled={anyBusy} required value={availabilityForm.reasonCode} onChange={setAvailabilityField('reasonCode')} />
            </Field>
          ) : null}
          <Button appearance='primary' disabled={anyBusy} type='submit'>
            {availabilityBusy ? <><Spinner size='tiny' /> {t('property_management.saving')}</> : t('property_management.set_availability_submit')}
          </Button>
        </form>
      )}
      <Button appearance='subtle' onClick={() => setOpen(false)} type='button'>
        {t('property_management.cancel')}
      </Button>
    </div>
  );
}

// REQ-038: uploads/lists/deletes a draft PublicListing's images. Rendered
// only for a `draft` listing (migration 0032's app.upload_public_listing_image
// and app.delete_public_listing_image both reject a non-draft listing), so
// this component is only ever mounted alongside PublicListingForm's
// draft-status views, never for a published/withdrawn listing.
function ListingImageManager({ disabled, legacyImageCount = 0, listingId, session, t }) {
  const [images, setImages] = useState([]);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [imagesError, setImagesError] = useState('');
  const [room, setRoom] = useState('');
  const [attestationAccepted, setAttestationAccepted] = useState(false);
  const [formError, setFormError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState('');
  const fileInputRef = useRef(null);
  const fileInputId = useId();
  const attestationId = useId();

  const fetchImages = async () => {
    setImagesError('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.list(`public-listings/${listingId}/images`);
      const parsed = publicListingImageListEnvelopeSchema.parse(payload);
      setImages(parsed.items);
    } catch (error) {
      setImagesError(mapListingImageErrorMessage(error, t));
    } finally {
      setImagesLoaded(true);
    }
  };

  useEffect(() => {
    setImages([]);
    setImagesLoaded(false);
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  // REQ-038's 10-image cap is combined across legacy imageUrls and
  // uploaded images (both are rendered together in the public gallery), so
  // the client-side cap check must count both, not just uploaded rows.
  const capReached = images.length + legacyImageCount >= MAX_LISTING_IMAGES;

  const handleUpload = async (event) => {
    event.preventDefault();
    setFormError('');
    const file = fileInputRef.current?.files?.[0];
    if (!room) {
      setFormError(t('property_management.listing_image_room_required'));
      return;
    }
    if (!file) {
      setFormError(t('property_management.listing_image_file_required'));
      return;
    }
    if (!ALLOWED_LISTING_IMAGE_MEDIA_TYPES.includes(file.type)) {
      setFormError(t('property_management.listing_image_type_invalid'));
      return;
    }
    if (file.size > MAX_LISTING_IMAGE_BYTES) {
      setFormError(t('property_management.listing_image_too_large'));
      return;
    }
    if (capReached) {
      setFormError(t('property_management.listing_image_cap_reached'));
      return;
    }
    if (!attestationAccepted) {
      setFormError(t('property_management.listing_image_attestation_required'));
      return;
    }
    setUploading(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.create(`public-listings/${listingId}/images`, {
        contentBase64,
        mediaType: file.type,
        room,
        attestationAccepted: true,
      });
      uploadPublicListingImageEnvelopeSchema.parse(payload);
      setRoom('');
      setAttestationAccepted(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchImages();
    } catch (error) {
      setFormError(mapListingImageErrorMessage(error, t));
    } finally {
      setUploading(false);
    }
  };


  const handleDelete = async (imageId) => {
    setFormError('');
    setDeletingImageId(imageId);
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.remove(`public-listings/${listingId}/images`, imageId);
      deletePublicListingImageEnvelopeSchema.parse(payload);
      await fetchImages();
    } catch (error) {
      setFormError(mapListingImageErrorMessage(error, t));
    } finally {
      setDeletingImageId('');
    }
  };

  return (
    <div className='listing-image-manager'>
      <h3>{t('property_management.listing_images_title')}</h3>
      {imagesError ? <p className='field-error' role='alert'>{imagesError}</p> : null}
      {imagesLoaded && images.length === 0 && !imagesError ? (
        <p>{t('property_management.listing_images_empty')}</p>
      ) : null}
      {images.length > 0 ? (
        <ul className='listing-image-list'>
          {images.map((image) => (
            <li key={image.imageId}>
              <span>{t(`property_management.room.${image.room}`)}</span>
              <Button
                appearance='subtle'
                disabled={disabled || deletingImageId === image.imageId}
                onClick={() => handleDelete(image.imageId)}
                type='button'
              >
                {deletingImageId === image.imageId
                  ? <><Spinner size='tiny' /> {t('property_management.listing_image_deleting')}</>
                  : t('property_management.listing_image_delete')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className='listing-image-upload-form' noValidate onSubmit={handleUpload}>
        <Field label={t('property_management.field.listing_image_room')} required>
          <Select disabled={disabled || uploading || capReached} onChange={(_event, data) => setRoom(data.value)} value={room}>
            <option value=''>{t('property_management.listing_image_room_placeholder')}</option>
            {publicListingImageRooms.map((option) => (
              <option key={option} value={option}>{t(`property_management.room.${option}`)}</option>
            ))}
          </Select>
        </Field>
        <div className='listing-image-file-field'>
          <label htmlFor={fileInputId}>{t('property_management.field.listing_image_file')}<span aria-hidden='true'>*</span></label>
          <input
            accept='image/jpeg,image/png'
            disabled={disabled || uploading || capReached}
            id={fileInputId}
            ref={fileInputRef}
            required
            type='file'
          />
        </div>
        <Field>
          <Checkbox
            checked={attestationAccepted}
            disabled={disabled || uploading || capReached}
            id={attestationId}
            label={t('property_management.listing_image_attestation_label')}
            onChange={(_event, data) => setAttestationAccepted(Boolean(data.checked))}
            required
          />
        </Field>
        {formError ? <p className='field-error' role='alert'>{formError}</p> : null}
        {capReached ? <p>{t('property_management.listing_image_cap_reached')}</p> : null}
        <Button appearance='secondary' disabled={disabled || uploading || capReached || !attestationAccepted} type='submit'>
          {uploading
            ? <><Spinner size='tiny' /> {t('property_management.listing_image_uploading')}</>
            : t('property_management.listing_image_upload_submit')}
        </Button>
      </form>
    </div>
  );
}

// Builds/edits the PublicListing draft (REQ-037 / issue #116's final slice):
// a unit without any listing gets a create form; a unit whose listing is
// still `draft` gets an edit form pre-filled from the current draft;
// `published`/`withdrawn` listings show read-only status only, since
// content changes to a published listing must go through withdraw first
// (ListingPublicationPanel), matching app.update_public_listing_draft's
// draft-only precondition (migration 0030). Once a draft listing exists,
// its images are managed independently by ListingImageManager (REQ-038):
// title/summary edits and photo uploads are separate concerns, so the
// image manager renders whenever a draft listing exists regardless of
// whether the title/summary edit form is open.
function PublicListingForm({ disabled, listing, onCreate, onUpdateDraft, session, t, unitId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => (listing ? listingFormFromSummary(listing) : emptyListingForm));
  const [busy, setBusy] = useState(false);
  const [attestationError, setAttestationError] = useState('');
  useEffect(() => {
    setForm(listing ? listingFormFromSummary(listing) : emptyListingForm);
  }, [listing]);
  const set = (field) => (_event, data) => setForm((current) => ({ ...current, [field]: data.value }));
  const isDraft = listing?.status === 'draft';
  const hasListing = Boolean(listing);

  if (!open && !hasListing) {
    return (
      <Button appearance='secondary' disabled={disabled} onClick={() => setOpen(true)}>
        {t('property_management.create_listing_toggle')}
      </Button>
    );
  }

  if (hasListing && !isDraft) {
    return (
      <div className='public-listing-status'>
        <span className='status'>{t(`property_management.listing_status.${listing.status}`)}</span>
        <span className='listing-meta'>{t(`property_management.media_review_status.${listing.mediaReviewStatus}`)}</span>
      </div>
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setAttestationError('');
    if (!hasListing && !form.attestationAccepted) {
      setAttestationError(t('property_management.listing_attestation_required'));
      return;
    }
    setBusy(true);
    try {
      const submitted = hasListing
        ? await onUpdateDraft(listing.id, listing.version, { title: form.title, summary: form.summary, imageUrls: listing.imageUrls ?? [] })
        : await onCreate(unitId, { title: form.title, summary: form.summary, attestationAccepted: form.attestationAccepted });
      if (submitted) setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {hasListing && !open ? (
        <div className='public-listing-status'>
          <span className='status'>{t('property_management.listing_status.draft')}</span>
          <span className='listing-meta'>{t(`property_management.media_review_status.${listing.mediaReviewStatus}`)}</span>
          <Button appearance='secondary' disabled={disabled} onClick={() => setOpen(true)}>
            {t('property_management.edit_listing_toggle')}
          </Button>
        </div>
      ) : null}
      {open ? (
        <form aria-label={t(hasListing ? 'property_management.edit_listing_form_label' : 'property_management.create_listing_form_label')} className='unit-form' noValidate onSubmit={handleSubmit}>
          <Field label={t('property_management.field.listing_title')} required>
            <Input disabled={busy} maxLength={140} required value={form.title} onChange={set('title')} />
          </Field>
          <Field label={t('property_management.field.listing_summary')} required>
            <Textarea disabled={busy} maxLength={4000} required resize='vertical' value={form.summary} onChange={set('summary')} />
          </Field>
          {!hasListing && (
            <Field validationMessage={attestationError || undefined}>
              <Checkbox
                disabled={busy}
                checked={form.attestationAccepted}
                label={t('property_management.listing_attestation_label')}
                onChange={(_event, data) => setForm((current) => ({ ...current, attestationAccepted: Boolean(data.checked) }))}
                required
              />
            </Field>
          )}
          <div className='unit-form-actions'>
            <Button appearance='primary' disabled={disabled || busy} type='submit'>
              {busy ? <><Spinner size='tiny' /> {t('property_management.saving')}</> : t(hasListing ? 'property_management.edit_listing_submit' : 'property_management.create_listing_submit')}
            </Button>
            <Button appearance='subtle' disabled={busy} onClick={() => setOpen(false)} type='button'>
              {t('property_management.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
      {hasListing ? (
        <ListingImageManager
          disabled={disabled}
          legacyImageCount={listing.imageUrls?.length ?? 0}
          listingId={listing.id}
          session={session}
          t={t}
        />
      ) : null}
    </>
  );
}

export function PropertyManagementPanel({
  feedError,
  feedLoading,
  listings,
  onRetryFeed,
  onRetryListingsFeed,
  properties,
  session,
}) {
  const { t } = useTranslation();
  const hasOrganizationContext = Boolean(session?.organizationId);
  const [tokenStatus, setTokenStatus] = useState(session?.sessionMode === 'demo' ? 'demo' : !hasOrganizationContext ? 'organization-unavailable' : session?.getAccessToken ? 'sign-in-required' : 'unavailable');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('');
  const apiConfig = useMemo(() => resolveApiBaseUrl(), []);

  useEffect(() => {
    let active = true;
    if (session?.sessionMode === 'demo') {
      setTokenStatus('demo');
      return () => {
        active = false;
      };
    }
    if (!session?.organizationId) {
      setTokenStatus('organization-unavailable');
      return () => {
        active = false;
      };
    }
    if (!session?.getAccessToken) {
      setTokenStatus('unavailable');
      return () => {
        active = false;
      };
    }
    setTokenStatus('sign-in-required');
    // Attempt silent (no-popup) token acquisition in the background so an
    // already-authenticated user does not have to click "Sign in to
    // continue" on every mount. If silent acquisition genuinely fails (no
    // getAccessTokenSilent, or it resolves without a token), the manual
    // sign-in affordance above remains the fallback (issue #123).
    if (typeof session.getAccessTokenSilent === 'function') {
      session.getAccessTokenSilent().then((token) => {
        if (active && token) setTokenStatus('ready');
      }).catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [session]);

  const enableLiveCommands = async () => {
    if (!session?.getAccessToken || !session?.organizationId) return;
    setMessage('');
    setMessageTone('');
    setTokenStatus('loading');
    try {
      let accessToken;
      try {
        accessToken = await resolveCommandAccessToken(session);
      } catch (error) {
        if (typeof session.signIn === 'function') {
          await session.signIn();
          accessToken = await resolveCommandAccessToken(session);
        } else {
          throw error;
        }
      }
      if (!accessToken) {
        setTokenStatus('sign-in-required');
        return;
      }
      setTokenStatus('ready');
    } catch (error) {
      setTokenStatus('sign-in-required');
      setMessage(error instanceof Error ? error.message : t('property_management.sign_in_error'));
      setMessageTone('error');
    }
  };

  const disableActions = tokenStatus !== 'ready';

  const submitCreateProperty = async (form) => {
    if (disableActions) return false;
    setMessage('');
    setMessageTone('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.create('properties', {
        name: form.name,
        propertyType: form.propertyType,
        address: {
          avenueOrStreet: form.avenueOrStreet,
          number: form.number,
          quartier: form.quartier,
          commune: form.commune,
          city: form.city,
          province: form.province,
          countryCode: form.countryCode.toUpperCase(),
          ...(form.postalCode ? { postalCode: form.postalCode } : {}),
        },
        timeZone: form.timeZone,
        jurisdictionCode: form.jurisdictionCode || null,
        firstUnit: {
          label: form.unitLabel,
          unitType: form.unitType,
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          furnishingStatus: form.furnishingStatus,
        },
        idempotencyKey: generateIdempotencyKey(),
      });
      rentalPropertyCreationEnvelopeSchema.parse(payload);
      setMessage(t('property_management.create_property_success'));
      setMessageTone('success');
      if (onRetryFeed) onRetryFeed();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('property_management.create_property_failed'));
      setMessageTone('error');
      return false;
    }
  };

  const submitAddUnit = async (propertyId, form) => {
    if (disableActions) return false;
    setMessage('');
    setMessageTone('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.create(`properties/${propertyId}/units`, {
        label: form.label,
        unitType: form.unitType,
        bedrooms: Number(form.bedrooms),
        bathrooms: Number(form.bathrooms),
        furnishingStatus: form.furnishingStatus,
        idempotencyKey: generateIdempotencyKey(),
      });
      rentableUnitCreationEnvelopeSchema.parse(payload);
      setMessage(t('property_management.add_unit_success'));
      setMessageTone('success');
      if (onRetryFeed) onRetryFeed();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('property_management.add_unit_failed'));
      setMessageTone('error');
      return false;
    }
  };

  const submitSetPricing = async (unitId, expectedVersion, form) => {
    if (disableActions) return null;
    setMessage('');
    setMessageTone('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.update(`units/${unitId}`, 'pricing', {
        amountMinor: form.amountMinor,
        currency: form.currency,
        effectiveFrom: new Date().toISOString(),
        expectedVersion,
        idempotencyKey: generateIdempotencyKey(),
      });
      const parsed = pricingVersionCreationEnvelopeSchema.parse(payload);
      setMessage(t('property_management.set_pricing_success'));
      setMessageTone('success');
      if (onRetryFeed) onRetryFeed();
      return parsed.data.unitVersion;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('property_management.set_pricing_failed'));
      setMessageTone('error');
      return null;
    }
  };

  const submitSetAvailability = async (unitId, expectedVersion, form) => {
    if (disableActions) return null;
    setMessage('');
    setMessageTone('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.update(`units/${unitId}`, 'availability', {
        status: form.status,
        reasonCode: form.reasonCode,
        effectiveFrom: new Date().toISOString(),
        expectedVersion,
        idempotencyKey: generateIdempotencyKey(),
      });
      const parsed = availabilityVersionCreationEnvelopeSchema.parse(payload);
      setMessage(t('property_management.set_availability_success'));
      setMessageTone('success');
      if (onRetryFeed) onRetryFeed();
      return parsed.data.unitVersion;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('property_management.set_availability_failed'));
      setMessageTone('error');
      return null;
    }
  };

  const submitCreateListing = async (unitId, form) => {
    if (disableActions) return false;
    setMessage('');
    setMessageTone('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.create(`units/${unitId}/public-listing`, {
        title: form.title,
        summary: form.summary,
        attestationAccepted: form.attestationAccepted,
        idempotencyKey: generateIdempotencyKey(),
      });
      createPublicListingEnvelopeSchema.parse(payload);
      setMessage(t('property_management.create_listing_success'));
      setMessageTone('success');
      if (onRetryListingsFeed) onRetryListingsFeed();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('property_management.create_listing_failed'));
      setMessageTone('error');
      return false;
    }
  };

  const submitUpdateListingDraft = async (listingId, expectedVersion, form) => {
    if (disableActions) return false;
    setMessage('');
    setMessageTone('');
    try {
      const accessToken = await resolveCommandAccessToken(session);
      const apiClient = await createPropertyManagementClient(session, accessToken);
      const payload = await apiClient.update('public-listings', `${listingId}/draft`, {
        title: form.title,
        summary: form.summary,
        // Preserve the listing's existing legacy image URLs: the schema
        // defaults an omitted imageUrls to [], which would otherwise wipe
        // them on every edit (this route never manages uploaded images).
        imageUrls: form.imageUrls ?? [],
        expectedVersion,
      });
      updatePublicListingDraftEnvelopeSchema.parse(payload);
      setMessage(t('property_management.edit_listing_success'));
      setMessageTone('success');
      if (onRetryListingsFeed) onRetryListingsFeed();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('property_management.edit_listing_failed'));
      setMessageTone('error');
      return false;
    }
  };

  return (
    <section aria-labelledby='property-management-title' className='panel property-panel'>
      <div className='panel-head'>
        <div>
          <p className='kicker'>{t('property_management.kicker')}</p>
          <h2 id='property-management-title'>{t('property_management.title')}</h2>
        </div>
      </div>
      {apiConfig.rejectedConfiguredValue ? (
        <p className='publication-feedback' data-tone='error' role='alert'>
          {t('property_management.rejected_base_url')}
        </p>
      ) : null}
      {tokenStatus === 'loading' ? (
        <p className='publication-feedback' data-tone='success' role='status'>{t('property_management.resolving_token')}</p>
      ) : null}
      {tokenStatus === 'demo' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>{t('property_management.demo_session')}</p>
      ) : null}
      {tokenStatus === 'organization-unavailable' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>{t('property_management.organization_unavailable')}</p>
      ) : null}
      {tokenStatus === 'sign-in-required' ? (
        <div className='publication-feedback' data-tone='error' role='alert'>
          <p>{t('property_management.sign_in_required')}</p>
          <Button appearance='secondary' onClick={enableLiveCommands}>{t('property_management.sign_in_to_continue')}</Button>
        </div>
      ) : null}
      {tokenStatus === 'unavailable' ? (
        <p className='publication-feedback' data-tone='error' role='alert'>{t('property_management.unavailable')}</p>
      ) : null}
      {feedLoading ? (
        <p className='publication-feedback' data-tone='success' role='status'>{t('property_management.feed_loading')}</p>
      ) : null}
      {feedError ? (
        <div className='publication-feedback' data-tone='error' role='alert'>
          <p>{t('property_management.feed_error')}</p>
          {onRetryFeed ? <Button appearance='secondary' onClick={onRetryFeed}>{t('property_management.feed_retry')}</Button> : null}
        </div>
      ) : null}
      {!feedLoading && !feedError && properties.length === 0 ? (
        <p className='publication-empty'>{t('property_management.empty_state')}</p>
      ) : null}
      {!feedLoading && !feedError && properties.length > 0 ? (
        <div className='rows' role='list' aria-label={t('property_management.portfolio')}>
          {properties.map((property) => (
            <div className='property-row' key={property.id} role='listitem'>
              <strong>{property.name}</strong>
              <span className='listing-meta'>{t(`property_management.property_type.${property.propertyType}`)}</span>
              <div className='unit-rows'>
                {property.units.map((unit) => {
                  const unitListing = (listings || []).find((listing) => listing.unitId === unit.id);
                  return (
                    <div className='unit-row' key={unit.id}>
                      <span>{unit.label}</span>
                      <span className='listing-meta'>{t(`property_management.unit_type.${unit.unitType}`)}</span>
                      <span className='status'>{t(`property_management.unit_availability_status.${unit.availabilityStatus}`)}</span>
                      <UnitPricingAvailabilityForm
                        disabled={disableActions}
                        onSetAvailability={submitSetAvailability}
                        onSetPricing={submitSetPricing}
                        t={t}
                        unit={unit}
                      />
                      <PublicListingForm
                        disabled={disableActions}
                        listing={unitListing}
                        onCreate={submitCreateListing}
                        onUpdateDraft={submitUpdateListingDraft}
                        session={session}
                        t={t}
                        unitId={unit.id}
                      />
                    </div>
                  );
                })}
              </div>
              <AddUnitForm disabled={disableActions} onSubmit={submitAddUnit} propertyId={property.id} t={t} />
            </div>
          ))}
        </div>
      ) : null}
      {message ? (
        <p className='publication-feedback' data-tone={messageTone} role={messageTone === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      ) : null}
      <CreatePropertyForm disabled={disableActions} onSubmit={submitCreateProperty} t={t} />
    </section>
  );
}
