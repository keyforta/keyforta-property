import './PropertyPages.styles.css';
import {
  Button,
  Field,
  Input,
  makeStyles,
  SearchBox,
  Select,
  Textarea,
  tokens,
} from "@fluentui/react-components";
import {
  ArrowLeft20Regular,
  ArrowReset20Regular,
  ArrowRight20Regular,
  CheckmarkCircle20Filled,
  Circle20Regular,
  Filter20Regular,
} from "@fluentui/react-icons";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { localizeProperty, money, properties } from "../data/content.js";
import { PropertyCard } from "../components/PropertyCard.jsx";
import { StatusMessage } from "../components/StatusMessage.jsx";

const usePropertyPageStyles = makeStyles({
  filters: {
    display: "grid",
    gridTemplateColumns:
      "minmax(240px, 2fr) repeat(2, minmax(150px, 1fr)) minmax(220px, 1.3fr) auto auto",
    alignItems: "end",
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalXXL,
    paddingTop: tokens.spacingVerticalL,
    paddingRight: tokens.spacingHorizontalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    backgroundColor: "#fff",
    borderTopStyle: "solid",
    borderTopWidth: "4px",
    borderTopColor: "var(--logo-teal)",
    borderRightStyle: "solid",
    borderRightWidth: "1px",
    borderRightColor: "var(--line)",
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
    borderBottomColor: "var(--line)",
    borderLeftStyle: "solid",
    borderLeftWidth: "1px",
    borderLeftColor: "var(--line)",
    borderTopLeftRadius: "4px",
    borderTopRightRadius: tokens.borderRadiusLarge,
    borderBottomRightRadius: tokens.borderRadiusLarge,
    borderBottomLeftRadius: tokens.borderRadiusLarge,
    "@media (max-width: 1200px)": {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
    "@media (max-width: 600px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: tokens.spacingVerticalM,
    },
  },
  field: {
    minWidth: 0,
    "& label": {
      marginBottom: tokens.spacingVerticalXS,
      fontFamily: '"Instrument Sans", "Segoe UI", Arial, sans-serif',
      fontSize: tokens.fontSizeBase300,
      fontWeight: tokens.fontWeightSemibold,
    },
  },
  control: {
    width: "100%",
    minHeight: "44px",
    backgroundColor: "#fff",
  },
  action: {
    alignSelf: "end",
    minWidth: "132px",
    minHeight: "44px",
    fontSize: "1rem",
    "@media (max-width: 1200px)": {
      width: "100%",
    },
  },
  reset: {
    alignSelf: "end",
    minWidth: "108px",
    minHeight: "44px",
    fontSize: "1rem",
    color: "var(--logo-aubergine)",
    backgroundColor: "transparent",
    borderTopColor: "var(--line)",
    borderRightColor: "var(--line)",
    borderBottomColor: "var(--line)",
    borderLeftColor: "var(--line)",
    ":hover": {
      color: "var(--logo-aubergine)",
      backgroundColor: "var(--logo-cream)",
    },
    "@media (max-width: 1200px)": {
      width: "100%",
    },
  },
});

export function PropertiesPage({ lang, filters, onFilterChange }) {
  const { t } = useTranslation();
  const styles = usePropertyPageStyles();
  const form = filters;
  let items = properties.filter(
    (p) =>
      (p.area + " Kinshasa").toLowerCase().includes(form.area.toLowerCase()) &&
      p.beds >= Number(form.beds || 0) &&
      p.price <= Number(form.max || 99999),
  );

  if (form.sort === "price-low")
    items = [...items].sort((a, b) => a.price - b.price);
  if (form.sort === "price-high")
    items = [...items].sort((a, b) => b.price - a.price);
  if (form.sort === "beds")
    items = [...items].sort((a, b) => b.beds - a.beds || a.price - b.price);

  return (
    <section className="page content-page shell">
      <div className="section-head">
        <div>
          <p className="eyebrow">{t("property_pages.discovery_eyebrow")}</p>
          <h1>{t("property_pages.find_title")}</h1>
        </div>
        <p>{t("property_pages.discovery_intro")}</p>
      </div>
      <form
        className={styles.filters}
        id="filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field
          className={styles.field}
          label={t("property_pages.neighborhood")}
        >
          <SearchBox
            className={styles.control}
            size="large"
            name="area"
            value={form.area}
            onChange={(_, data) => onFilterChange("area", data.value)}
            placeholder={t("property_pages.placeholder_neighborhood")}
          />
        </Field>
        <Field className={styles.field} label={t("property_pages.bedrooms")}>
          <Select
            className={styles.control}
            size="large"
            name="beds"
            value={form.beds}
            onChange={(_, data) => onFilterChange("beds", data.value)}
          >
            <option value="">{t("property_pages.any")}</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
          </Select>
        </Field>
        <Field className={styles.field} label={t("property_pages.max_rent")}>
          <Select
            className={styles.control}
            size="large"
            name="max"
            value={form.max}
            onChange={(_, data) => onFilterChange("max", data.value)}
          >
            <option value="">{t("property_pages.any")}</option>
            <option value="300">$300</option>
            <option value="500">$500</option>
            <option value="900">$900</option>
          </Select>
        </Field>
        <Field className={styles.field} label={t("property_pages.sort_by")}>
          <Select
            className={styles.control}
            size="large"
            name="sort"
            value={form.sort}
            onChange={(_, data) => onFilterChange("sort", data.value)}
          >
            <option value="recommended">
              {t("property_pages.sort_recommended")}
            </option>
            <option value="price-low">
              {t("property_pages.sort_price_low")}
            </option>
            <option value="price-high">
              {t("property_pages.sort_price_high")}
            </option>
            <option value="beds">{t("property_pages.bedrooms")}</option>
          </Select>
        </Field>
        <Button
          appearance="primary"
          className={styles.action}
          icon={<Filter20Regular />}
          type="submit"
        >
          {t("property_pages.apply_filters")}
        </Button>
        <Button
          appearance="outline"
          className={styles.reset}
          icon={<ArrowReset20Regular />}
          type="button"
          onClick={() => onFilterChange("reset", "")}
        >
          {t("property_pages.reset")}
        </Button>
      </form>
      <p
        className="results-count"
        id="results-count"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {t("property_pages.results_count", { count: items.length })}
      </p>
      <div className="cards" id="property-results">
        {items.length ? (
          items.map((item, index) => (
            <PropertyCard
              key={item.id}
              lang={lang}
              item={item}
              position={index}
            />
          ))
        ) : (
          <div className="empty">{t("property_pages.no_results")}</div>
        )}
      </div>
    </section>
  );
}

export function PropertyDetailPage({ lang, propertyId }) {
  const { t } = useTranslation();
  const p = localizeProperty(
    properties.find((item) => item.id === propertyId) || properties[0],
    lang,
  );
  const deposit = p.price * p.depositMonths;

  return (
    <section className="page shell detail">
      <div>
        <Link className="icon-link" to="/properties">
          <ArrowLeft20Regular aria-hidden="true" />{" "}
          {t("property_pages.back_to_properties")}
        </Link>
        <div className="detail-photo">
          <img src={p.image} alt={p.imageAlt} />
        </div>
        <div className="content-narrow">
          <div className="detail-facts">
            <span>
              <strong>{t("property.bedroom", { count: p.beds })}</strong>
            </span>
            <span>
              <strong>{t("property.bathroom", { count: p.baths })}</strong>
            </span>
            <span>
              <strong>{p.area}</strong> {t("property_pages.neighborhood_label")}
            </span>
          </div>
          <h2>{t("property_pages.about_home")}</h2>
          <p>{p.description}</p>
          <h2>{t("property_pages.included")}</h2>
          <div className="amenities">
            {p.amenities.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="detail-sections">
            <div className="trust-card">
              <h3>{t("property_pages.verification_preview")}</h3>
              <p>
                <span className="check-mark" aria-hidden="true">
                  <CheckmarkCircle20Filled />
                </span>
                {p.verified}
              </p>
              <p>
                <span className="pending-mark" aria-hidden="true">
                  <Circle20Regular />
                </span>
                {t("property_pages.ownership_pending")}
              </p>
              <p>
                <span className="pending-mark" aria-hidden="true">
                  <Circle20Regular />
                </span>
                {t("property_pages.identity_checked")}
              </p>
            </div>
            <div className="cost-card">
              <h3>{t("property_pages.move_in_costs")}</h3>
              <div>
                <span>{t("property_pages.monthly_rent")}</span>
                <strong>{money(p.price, lang)}</strong>
              </div>
              <div>
                <span>
                  {t("property_pages.example_deposit", {
                    count: p.depositMonths,
                  })}
                </span>
                <strong>{money(deposit, lang)}</strong>
              </div>
              <div className="total">
                <span>{t("property_pages.shown_before_commitment")}</span>
                <strong>{money(p.price + deposit, lang)}</strong>
              </div>
              <small>{t("property_pages.mock_figures")}</small>
            </div>
          </div>
        </div>
      </div>
      <aside className="detail-panel">
        <p className="eyebrow">{p.available}</p>
        <h1>{p.title}</h1>
        <p className="meta">{p.area}, Kinshasa</p>
        <p className="price">
          {money(p.price, lang)} <small>{t("property.per_month")}</small>
        </p>
        <p>
          {t("property.bedroom", { count: p.beds })} · {t("property.bathroom", { count: p.baths })} · 1{" "}
          {t("property_pages.living_room")} · 1 {t("property_pages.kitchen")}
        </p>
        <Link className="button" to={`/view/${p.id}`}>
          {t("property_pages.request_viewing")}
        </Link>
        <Link
          className="button secondary application-link"
          to={`/apply/${p.id}`}
        >
          {t("property_pages.apply_unit")}
        </Link>
        <Link className="text-link" to="/trust">
          {t("property_pages.verification_link")}{" "}
          <ArrowRight20Regular aria-hidden="true" />
        </Link>
      </aside>
    </section>
  );
}

export function RentalApplicationPage({ lang, propertyId, onSubmit }) {
  const { t } = useTranslation();
  const property =
    properties.find((item) => item.id === propertyId) || properties[0];
  const [status, setStatus] = useState("");

  return (
    <section className="page content-page shell auth-page">
      <div className="application-card">
        <p className="eyebrow">{t("property_pages.application_eyebrow")}</p>
        <h1>
          {t("property_pages.application_title", {
            title: localizeProperty(property, lang).title,
          })}
        </h1>
        <p className="muted">{t("property_pages.application_intro")}</p>
        <form
          className="form-grid"
          id="rental-application-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = Object.fromEntries(new FormData(form));
            setStatus(onSubmit(values));
            form.reset();
          }}
        >
          <input type="hidden" name="propertyId" value={property.id} readOnly />
          <Field label={t("full_name")}>
            <Input name="name" required />
          </Field>
          <Field label={t("email")}>
            <Input name="email" type="email" required />
          </Field>
          <Field label={t("property_pages.phone")}>
            <Input name="phone" type="tel" required />
          </Field>
          <Field label={t("property_pages.current_address")}>
            <Input name="currentAddress" required />
          </Field>
          <Field label={t("property_pages.occupants")}>
            <Input name="occupants" type="number" min="1" required />
          </Field>
          <Field label={t("property_pages.income_source")}>
            <Input name="incomeSource" required />
          </Field>
          <Field label={t("property_pages.monthly_income")}>
            <Input name="monthlyIncome" type="number" min="0" required />
          </Field>
          <Field label={t("property_pages.move_in_date")}>
            <Input name="moveInDate" type="date" required />
          </Field>
          <Field label={t("property_pages.references")}>
            <Textarea name="notes" required />
          </Field>
          <label className="check-label">
            <input name="consent" type="checkbox" required />{" "}
            {t("property_pages.consent")}
          </label>
          <Button className="button copper" type="submit">
            {t("property_pages.submit_application")}
          </Button>
          <StatusMessage
            className="form-status show"
            intent="success"
            message={status}
          />
        </form>
      </div>
    </section>
  );
}

export function ViewingRequestPage({ lang, propertyId, onSubmit }) {
  const { t } = useTranslation();
  const property = properties.find((item) => item.id === propertyId) || properties[0];
  const [status, setStatus] = useState("");

  return (
    <section className="page content-page shell auth-page">
      <div className="application-card">
        <p className="eyebrow">{t("property_pages.viewing_eyebrow")}</p>
        <h1>{t("property_pages.viewing_title", { title: localizeProperty(property, lang).title })}</h1>
        <p className="muted">{t("property_pages.viewing_intro")}</p>
        <form
          className="form-grid"
          id="viewing-request-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            setStatus(onSubmit(Object.fromEntries(new FormData(form))));
            form.reset();
          }}
        >
          <input type="hidden" name="propertyId" value={property.id} readOnly />
          <Field label={t("full_name")}>
            <Input name="name" minLength={2} maxLength={120} required />
          </Field>
          <Field label={t("email")}>
            <Input name="email" type="email" required />
          </Field>
          <Field label={t("property_pages.phone")}>
            <Input name="phone" type="tel" maxLength={40} />
          </Field>
          <Field label={t("property_pages.preferred_time")}>
            <Input name="preferredAt" type="datetime-local" />
          </Field>
          <Field label={t("property_pages.viewing_message")}>
            <Textarea name="message" maxLength={1000} />
          </Field>
          <Button className="button copper" type="submit">
            {t("property_pages.submit_viewing")}
          </Button>
          <StatusMessage className="form-status show" intent="success" message={status} />
        </form>
        <Link className="text-link" to={`/property/${property.id}`}>
          <ArrowLeft20Regular aria-hidden="true" /> {t("property_pages.back_to_property")}
        </Link>
      </div>
    </section>
  );
}
