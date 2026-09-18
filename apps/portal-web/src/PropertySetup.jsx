import { useEffect, useRef, useState } from "react";
import { Button } from "@fluentui/react-components";
import { createRentalPropertyInputSchema } from "@keyforta/contracts";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  DoorOpen,
  Home,
  MapPin,
  Minus,
  Plus,
} from "lucide-react";

const PROPERTY_DRAFTS_KEY = "keyforta.portal.property-drafts";

const initialForm = {
  name: "",
  propertyType: "apartment_building",
  avenueOrStreet: "",
  number: "",
  quartier: "",
  commune: "",
  city: "Kinshasa",
  province: "Kinshasa",
  countryCode: "CD",
  postalCode: "",
  timeZone: "Africa/Kinshasa",
  label: "",
  unitType: "apartment",
  bedrooms: "1",
  bathrooms: "1",
  areaSquareMeters: "",
  floorLabel: "",
  furnishingStatus: "unfurnished",
};

const seedProperties = [
  { id: "draft-riverside", name: "Riverside Apartments", location: "Gombe, Kinshasa", units: 3, status: "Draft" },
  { id: "draft-courtyard", name: "Limete Courtyard", location: "Limete, Kinshasa", units: 2, status: "Draft" },
];

const propertyTypes = [
  ["apartment_building", "Apartment building"],
  ["single_family", "Single-family home"],
  ["townhouse", "Townhouse"],
  ["mixed_use", "Mixed use"],
  ["other", "Other"],
];

const unitTypes = [
  ["studio", "Studio"],
  ["apartment", "Apartment"],
  ["house", "House"],
  ["townhouse", "Townhouse"],
  ["commercial", "Commercial"],
  ["other", "Other"],
];

const requiredFieldMessages = {
  name: "Enter a property name.",
  avenueOrStreet: "Enter an avenue or street.",
  number: "Enter a street number.",
  quartier: "Enter a quartier.",
  commune: "Enter a commune.",
  city: "Enter a city.",
  province: "Enter a province.",
  label: "Enter a unit label.",
};

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(PROPERTY_DRAFTS_KEY) || "null") || seedProperties;
  } catch {
    return seedProperties;
  }
}

function toContractInput(form) {
  const address = {
    avenueOrStreet: form.avenueOrStreet,
    number: form.number,
    quartier: form.quartier,
    commune: form.commune,
    city: form.city,
    province: form.province,
    countryCode: form.countryCode,
    ...(form.postalCode.trim() ? { postalCode: form.postalCode } : {}),
  };
  const firstUnit = {
    label: form.label,
    unitType: form.unitType,
    bedrooms: Number(form.bedrooms),
    bathrooms: Number(form.bathrooms),
    furnishingStatus: form.furnishingStatus,
    ...(form.areaSquareMeters ? { areaSquareMeters: Number(form.areaSquareMeters) } : {}),
    ...(form.floorLabel.trim() ? { floorLabel: form.floorLabel } : {}),
  };
  return {
    name: form.name,
    propertyType: form.propertyType,
    address,
    timeZone: form.timeZone,
    firstUnit,
  };
}

function issuesByField(result) {
  if (result.success) return {};
  return result.error.issues.reduce((errors, issue) => {
    const field = issue.path.at(-1);
    if (field && !errors[field]) errors[field] = requiredFieldMessages[field] || issue.message;
    return errors;
  }, {});
}

function Field({ children, error, label, name, optional = false }) {
  return (
    <div className="form-field">
      <label className="field-label" htmlFor={name}>
        {label} {optional && <small>Optional</small>}
      </label>
      {children}
      {error && <span className="field-error" id={`${name}-error`}>{error}</span>}
    </div>
  );
}

function SectionHeading({ icon: Icon, title, description }) {
  return (
    <div className="section-heading">
      <span className="section-icon" aria-hidden="true"><Icon size={19} /></span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export function PropertySetup() {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [drafts, setDrafts] = useState(readDrafts);
  const [savedName, setSavedName] = useState("");
  const [submissionAttempt, setSubmissionAttempt] = useState(0);
  const errorSummaryRef = useRef(null);

  useEffect(() => {
    if (submissionAttempt > 0) errorSummaryRef.current?.focus();
  }, [submissionAttempt]);

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setSavedName("");
  };

  const adjustNumber = (name, change, minimum) => {
    setForm((current) => ({
      ...current,
      [name]: String(Math.min(20, Math.max(minimum, Number(current[name]) + change))),
    }));
    setSavedName("");
  };

  const validateField = (event) => {
    const nextErrors = issuesByField(createRentalPropertyInputSchema.safeParse(toContractInput(form)));
    setErrors((current) => {
      const updated = { ...current };
      if (nextErrors[event.target.name]) updated[event.target.name] = nextErrors[event.target.name];
      else delete updated[event.target.name];
      return updated;
    });
  };

  const submit = (event) => {
    event.preventDefault();
    const result = createRentalPropertyInputSchema.safeParse(toContractInput(form));
    const nextErrors = issuesByField(result);
    setErrors(nextErrors);
    if (!result.success) {
      setSubmissionAttempt((current) => current + 1);
      return;
    }

    const nextDraft = {
      id: crypto.randomUUID(),
      name: result.data.name,
      location: `${result.data.address.commune}, ${result.data.address.city}`,
      units: 1,
      status: "Draft",
    };
    const nextDrafts = [nextDraft, ...drafts];
    localStorage.setItem(PROPERTY_DRAFTS_KEY, JSON.stringify(nextDrafts));
    setDrafts(nextDrafts);
    setSavedName(result.data.name);
    setForm(initialForm);
  };

  const inputProps = (name) => ({
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
    "aria-invalid": Boolean(errors[name]),
    id: name,
    name,
    onBlur: validateField,
    onChange: update,
    value: form[name],
  });

  return (
    <div className="property-workspace">
      <header className="property-header">
        <div>
          <div className="breadcrumb" aria-label="Breadcrumb">
            <span>Properties</span><ArrowRight size={13} aria-hidden="true" /><strong>New property</strong>
          </div>
          <p className="kicker">Rental inventory</p>
          <h1>Set up a property</h1>
          <p className="property-intro">Create the private property record and its first rentable unit together.</p>
        </div>
        <div className="stage-badge"><span /> Private draft</div>
      </header>

      <section className="inventory-metrics" aria-label="Portfolio summary">
        <article><span>Properties</span><strong>{drafts.length}</strong><small>Private inventory</small></article>
        <article><span>Units</span><strong>{drafts.reduce((total, draft) => total + draft.units, 0)}</strong><small>Across all properties</small></article>
        <article><span>Setup state</span><strong>{savedName ? "Saved" : "Draft"}</strong><small>Not publicly listed</small></article>
      </section>

      {savedName && (
        <div className="save-confirmation" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span><strong>{savedName}</strong> was saved as a private draft with its first unit.</span>
        </div>
      )}

      <form className="property-form" onSubmit={submit} noValidate>
        {Object.keys(errors).length > 0 && (
          <div className="error-summary" ref={errorSummaryRef} role="alert" tabIndex="-1">
            <strong>Check the highlighted fields.</strong>
            <span>The property cannot be saved until the required details are valid.</span>
          </div>
        )}

        <section className="form-section" aria-labelledby="property-details-heading">
          <SectionHeading icon={Building2} title="Property details" description="The identity used across your private portfolio." />
          <div className="form-grid two-columns">
            <Field label="Property name" name="name" error={errors.name}>
              <input {...inputProps("name")} autoComplete="organization" placeholder="Riverside Apartments" />
            </Field>
            <Field label="Property type" name="propertyType" error={errors.propertyType}>
              <select {...inputProps("propertyType")}>
                {propertyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="form-section" aria-labelledby="address-heading">
          <SectionHeading icon={MapPin} title="Address & location" description="Operational address details remain private unless later approved for publication." />
          <div className="form-grid address-grid">
            <Field label="Avenue or street" name="avenueOrStreet" error={errors.avenueOrStreet}>
              <input {...inputProps("avenueOrStreet")} autoComplete="address-line1" placeholder="Avenue Colonel Mondjiba" />
            </Field>
            <Field label="Number" name="number" error={errors.number}>
              <input {...inputProps("number")} autoComplete="address-line2" placeholder="42" />
            </Field>
            <Field label="Quartier" name="quartier" error={errors.quartier}>
              <input {...inputProps("quartier")} placeholder="Socimat" />
            </Field>
            <Field label="Commune" name="commune" error={errors.commune}>
              <input {...inputProps("commune")} placeholder="Ngaliema" />
            </Field>
            <Field label="City" name="city" error={errors.city}>
              <input {...inputProps("city")} autoComplete="address-level2" />
            </Field>
            <Field label="Province" name="province" error={errors.province}>
              <input {...inputProps("province")} autoComplete="address-level1" />
            </Field>
            <Field label="Country" name="countryCode" error={errors.countryCode}>
              <select {...inputProps("countryCode")} autoComplete="country">
                <option value="CD">Democratic Republic of the Congo</option>
                <option value="CG">Republic of the Congo</option>
                <option value="BE">Belgium</option>
                <option value="FR">France</option>
              </select>
            </Field>
            <Field label="Postal code" name="postalCode" error={errors.postalCode} optional>
              <input {...inputProps("postalCode")} autoComplete="postal-code" />
            </Field>
            <Field label="Time zone" name="timeZone" error={errors.timeZone}>
              <select {...inputProps("timeZone")}>
                <option value="Africa/Kinshasa">Africa/Kinshasa (UTC+1)</option>
                <option value="Africa/Lubumbashi">Africa/Lubumbashi (UTC+2)</option>
                <option value="Europe/Brussels">Europe/Brussels</option>
                <option value="Europe/Paris">Europe/Paris</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="form-section" aria-labelledby="unit-heading">
          <SectionHeading icon={DoorOpen} title="First unit" description="Every property starts with one valid rentable unit." />
          <div className="form-grid unit-grid">
            <Field label="Unit label" name="label" error={errors.label}>
              <input {...inputProps("label")} placeholder="Apartment 1A" />
            </Field>
            <Field label="Unit type" name="unitType" error={errors.unitType}>
              <select {...inputProps("unitType")}>
                {unitTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="Bedrooms" name="bedrooms" error={errors.bedrooms}>
              <div className="number-stepper">
                <Button appearance="transparent" aria-label="Decrease bedrooms" icon={<Minus size={15} />} onClick={() => adjustNumber("bedrooms", -1, 0)} type="button" />
                <input {...inputProps("bedrooms")} min="0" max="20" type="number" />
                <Button appearance="transparent" aria-label="Increase bedrooms" icon={<Plus size={15} />} onClick={() => adjustNumber("bedrooms", 1, 0)} type="button" />
              </div>
            </Field>
            <Field label="Bathrooms" name="bathrooms" error={errors.bathrooms}>
              <div className="number-stepper">
                <Button appearance="transparent" aria-label="Decrease bathrooms" icon={<Minus size={15} />} onClick={() => adjustNumber("bathrooms", -1, 1)} type="button" />
                <input {...inputProps("bathrooms")} min="1" max="20" type="number" />
                <Button appearance="transparent" aria-label="Increase bathrooms" icon={<Plus size={15} />} onClick={() => adjustNumber("bathrooms", 1, 1)} type="button" />
              </div>
            </Field>
            <Field label="Area (m²)" name="areaSquareMeters" error={errors.areaSquareMeters} optional>
              <input {...inputProps("areaSquareMeters")} min="1" max="100000" type="number" />
            </Field>
            <Field label="Floor" name="floorLabel" error={errors.floorLabel} optional>
              <input {...inputProps("floorLabel")} placeholder="Ground floor" />
            </Field>
            <Field label="Furnishing" name="furnishingStatus" error={errors.furnishingStatus}>
              <select {...inputProps("furnishingStatus")}>
                <option value="unfurnished">Unfurnished</option>
                <option value="part_furnished">Part furnished</option>
                <option value="furnished">Furnished</option>
              </select>
            </Field>
          </div>
        </section>

        <footer className="form-actions">
          <p><Home size={17} aria-hidden="true" /> Property and first unit are saved together.</p>
          <Button appearance="primary" icon={<Plus size={18} />} type="submit">Create property</Button>
        </footer>
      </form>

      <section className="recent-properties" aria-labelledby="recent-properties-heading">
        <div className="recent-heading">
          <div><p className="kicker">Portfolio</p><h2 id="recent-properties-heading">Recent properties</h2></div>
          <span>{drafts.length} private drafts</span>
        </div>
        <div className="recent-list">
          {drafts.slice(0, 4).map((property) => (
            <article key={property.id}>
              <span className="property-mark" aria-hidden="true"><Building2 size={18} /></span>
              <div><strong>{property.name}</strong><small>{property.location}</small></div>
              <span>{property.units} {property.units === 1 ? "unit" : "units"}</span>
              <span className="draft-status">{property.status}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}