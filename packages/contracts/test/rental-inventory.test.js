import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeUnitLabel,
  createRentalPropertyInputSchema,
  internalPublicListingSchema,
  pricingVersionSchema,
  publicListingSnapshotSchema,
  publicPropertyEnvelopeSchema,
  publicPropertyListEnvelopeSchema,
  publicPropertyListResultSchema,
  publicPropertyListQuerySchema,
  publicPropertyProjectionSchema,
  rentableUnitSchema,
  rentalPropertySchema,
  unitLabelUnicodeVersion,
  unitAvailabilityVersionSchema,
} from "../src/index.js";

const ids = {
  actor: "00000000-0000-4000-8000-000000000001",
  availability: "00000000-0000-4000-8000-000000000002",
  listing: "00000000-0000-4000-8000-000000000003",
  organization: "00000000-0000-4000-8000-000000000004",
  pricing: "00000000-0000-4000-8000-000000000005",
  property: "00000000-0000-4000-8000-000000000006",
  unit: "00000000-0000-4000-8000-000000000007",
};

const address = {
  avenueOrStreet: "Avenue Kasa-Vubu",
  number: "42",
  quartier: "Socimat",
  commune: "Gombe",
  city: "Kinshasa",
  province: "Kinshasa",
  countryCode: "CD",
};

const unitInput = {
  label: "Studio A",
  unitType: "studio",
  bedrooms: 0,
  bathrooms: 1,
  furnishingStatus: "unfurnished",
};

const without = (value, field) => Object.fromEntries(
  Object.entries(value).filter(([key]) => key !== field),
);

const assertRequiredFields = (schema, value, fields) => {
  for (const field of fields) {
    assert.equal(schema.safeParse(without(value, field)).success, false, `${field} must be required`);
    assert.equal(schema.safeParse({ ...value, [field]: null }).success, false, `${field} must reject null`);
  }
};

test("REQ-032 PROP-009 PROP-020 rejects client authority and requires the first Unit", () => {
  const parsed = createRentalPropertyInputSchema.parse({
    name: "  Gombe Residence  ",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: unitInput,
  });

  assert.equal(parsed.name, "Gombe Residence");
  assert.equal(parsed.firstUnit.bedrooms, 0);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
  }).success, false);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: unitInput,
    organizationId: ids.organization,
  }).success, false);
  assertRequiredFields(createRentalPropertyInputSchema, {
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: unitInput,
  }, ["name", "propertyType", "address", "timeZone", "firstUnit"]);
  assertRequiredFields(createRentalPropertyInputSchema.shape.firstUnit, unitInput, [
    "label",
    "unitType",
    "bedrooms",
    "bathrooms",
    "furnishingStatus",
  ]);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    jurisdictionCode: "not-an-approved-catalogue-value",
    firstUnit: unitInput,
  }).success, false);
});

test("REQ-032 REQ-036 PROP-020 validates Property lifecycle metadata", () => {
  const property = {
    id: ids.property,
    organizationId: ids.organization,
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    verificationStatus: "pending",
    publicationStatus: "draft",
    version: 1,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };

  assert.equal(rentalPropertySchema.safeParse(property).success, true);
  assert.equal(rentalPropertySchema.safeParse({ ...property, timeZone: "Mars/Olympus" }).success, false);
  assert.equal(rentalPropertySchema.safeParse({
    ...property,
    jurisdictionCode: "CD-KN",
  }).success, false);
  assert.equal(rentalPropertySchema.safeParse({
    ...property,
    verificationStatus: "verified",
  }).success, false);
  assert.equal(rentalPropertySchema.safeParse({
    ...property,
    publicationStatus: "pending_review",
  }).success, false);
  assert.equal(rentalPropertySchema.safeParse({
    ...property,
    profileStatus: "legacy_incomplete",
  }).success, false);
  assert.equal(rentalPropertySchema.safeParse({
    ...property,
    publicationStatus: "archived",
    archivedAt: "2026-09-17T11:00:00.000Z",
  }).success, false);
  assert.equal(rentalPropertySchema.safeParse({
    ...property,
    publicationStatus: "archived",
    archivedAt: "2026-09-17T11:00:00.000Z",
    archivedBy: ids.actor,
    archiveReason: "No longer managed.",
  }).success, true);
  assert.equal(rentalPropertySchema.safeParse({
    ...property,
    archivedAt: "2026-09-17T11:00:00.000Z",
    archivedBy: ids.actor,
    archiveReason: "No longer managed.",
  }).success, false);
  assert.equal(rentalPropertySchema.safeParse({ ...property, publicationStatus: "deleted" }).success, false);
  assert.equal(rentalPropertySchema.safeParse({ ...property, verificationStatus: 'verified' }).success, false);
});

test("REQ-033 PROP-020 validates Unit bounds and archive metadata", () => {
  const unit = {
    id: ids.unit,
    organizationId: ids.organization,
    propertyId: ids.property,
    label: "Studio A",
    canonicalLabel: "studio a",
    unitType: "studio",
    bedrooms: 0,
    bathrooms: 1,
    furnishingStatus: "unfurnished",
    availabilityStatus: "available",
    publicationStatus: "draft",
    version: 1,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };

  assert.equal(rentableUnitSchema.safeParse(unit).success, true);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, bedrooms: 21 }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, bathrooms: 0 }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, label: " ".repeat(4) }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, privateAccessCode: "1234" }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, unitType: "penthouse" }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, areaSquareMeters: 100000 }).success, true);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, areaSquareMeters: 100001 }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, bedrooms: 20, bathrooms: 20 }).success, true);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, bathrooms: 21 }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, furnishingStatus: "semi_furnished" }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, availabilityStatus: "reserved" }).success, false);
  assert.equal(rentableUnitSchema.safeParse({ ...unit, canonicalLabel: "Studio A" }).success, false);
  assert.equal(rentableUnitSchema.safeParse({
    ...unit,
    publicationStatus: "archived",
    archivedAt: unit.updatedAt,
    archivedBy: ids.actor,
    archiveReason: "Combined into another unit.",
  }).success, true);
  assert.equal(rentableUnitSchema.safeParse({
    ...unit,
    publicationStatus: "archived",
    archivedAt: unit.updatedAt,
    archivedBy: null,
    archiveReason: "Combined into another unit.",
  }).success, false);
  assert.equal(rentableUnitSchema.safeParse({
    ...unit,
    label: "  Unnormalized legacy unit  ",
    canonicalLabel: null,
    unitType: null,
    bedrooms: null,
    bathrooms: null,
    areaSquareMeters: null,
    floorLabel: null,
    furnishingStatus: null,
    availabilityStatus: "reserved",
    publicationStatus: null,
    profileStatus: "legacy_incomplete",
    updatedAt: null,
  }).success, false);

});

test("REQ-033 PROP-011 normalizes NFC and trims Unicode White_Space", () => {
  const parsed = createRentalPropertyInputSchema.parse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: { ...unitInput, label: "\u0085Cafe\u0301\u0085" },
  });

  assert.equal(parsed.firstUnit.label, "Café");
  assert.equal([...parsed.firstUnit.label].length, 4);
  assert.equal(unitLabelUnicodeVersion, "16.0.0");
  assert.equal(canonicalizeUnitLabel(" Straße "), canonicalizeUnitLabel("STRASSE"));
  assert.equal(canonicalizeUnitLabel("ΟΣ"), canonicalizeUnitLabel("ος"));
  assert.equal(canonicalizeUnitLabel("ΟΣ"), canonicalizeUnitLabel("οσ"));
  assert.equal(canonicalizeUnitLabel("\u{10400}"), canonicalizeUnitLabel("\u{10428}"));
  assert.throws(() => canonicalizeUnitLabel("\uD800"), TypeError);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: { ...unitInput, label: "\uD800" },
  }).success, false);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: { ...unitInput, label: "é".repeat(80) },
  }).success, true);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: { ...unitInput, label: "é".repeat(81) },
  }).success, false);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: { ...unitInput, label: "x".repeat(10000) },
  }).success, false);
  const expandedLabel = "\uFB03".repeat(80);
  assert.equal(canonicalizeUnitLabel(expandedLabel).length, 240);
  assert.equal(rentableUnitSchema.safeParse({
    id: ids.unit,
    organizationId: ids.organization,
    propertyId: ids.property,
    ...unitInput,
    label: expandedLabel,
    canonicalLabel: canonicalizeUnitLabel(expandedLabel),
    availabilityStatus: "available",
    publicationStatus: "draft",
    version: 1,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T10:00:00.000Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  }).success, true);
});

test("REQ-032 PROP-020 validates address catalogues and text bounds", () => {
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "apartment_building",
    address: { ...address, countryCode: "ZZ" },
    timeZone: "Africa/Kinshasa",
    firstUnit: unitInput,
  }).success, false);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "x".repeat(160),
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: unitInput,
  }).success, true);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "x".repeat(161),
    propertyType: "apartment_building",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: unitInput,
  }).success, false);
  assert.equal(createRentalPropertyInputSchema.safeParse({
    name: "Gombe Residence",
    propertyType: "condominium",
    address,
    timeZone: "Africa/Kinshasa",
    firstUnit: unitInput,
  }).success, false);
});

test("REQ-034 PROP-020 validates positive integer pricing and half-open intervals", () => {
  const pricing = {
    id: ids.pricing,
    organizationId: ids.organization,
    unitId: ids.unit,
    amountMinor: 40000,
    currency: "USD",
    billingPeriod: "month",
    effectiveFrom: "2026-10-01T00:00:00.000Z",
    effectiveTo: null,
    createdBy: ids.actor,
    correlationId: "request-1",
    source: "landlord_command",
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  assert.equal(pricingVersionSchema.safeParse(pricing).success, true);
  assert.equal(pricingVersionSchema.safeParse({ ...pricing, effectiveTo: undefined }).success, true);
  assert.equal(pricingVersionSchema.safeParse({ ...pricing, amountMinor: 0 }).success, false);
  assert.equal(pricingVersionSchema.safeParse({ ...pricing, amountMinor: 10.5 }).success, false);
  assert.equal(pricingVersionSchema.safeParse({ ...pricing, currency: "AAA" }).success, false);
  assert.equal(pricingVersionSchema.safeParse({
    ...pricing,
    effectiveTo: "2026-09-30T23:59:59.000Z",
  }).success, false);
  assert.equal(pricingVersionSchema.safeParse({ ...pricing, billingPeriod: "week" }).success, false);
  assertRequiredFields(pricingVersionSchema, without(pricing, "effectiveTo"), [
    "id",
    "organizationId",
    "unitId",
    "amountMinor",
    "currency",
    "billingPeriod",
    "effectiveFrom",
    "createdBy",
    "correlationId",
    "source",
    "createdAt",
  ]);
});

test("REQ-034 PROP-020 PROP-021 validates recorded availability states and intervals", () => {
  const availability = {
    id: ids.availability,
    organizationId: ids.organization,
    unitId: ids.unit,
    status: "unavailable",
    reasonCode: "maintenance",
    effectiveFrom: "2026-10-01T00:00:00.000Z",
    effectiveTo: "2026-10-03T00:00:00.000Z",
    createdBy: ids.actor,
    correlationId: "request-2",
    source: "manager_command",
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  assert.equal(unitAvailabilityVersionSchema.safeParse(availability).success, true);
  assert.equal(unitAvailabilityVersionSchema.safeParse({
    ...availability,
    status: "available",
    reasonCode: null,
    effectiveTo: undefined,
  }).success, true);
  assert.equal(unitAvailabilityVersionSchema.safeParse({ ...availability, reasonCode: null }).success, false);
  assert.equal(unitAvailabilityVersionSchema.safeParse({
    ...availability,
    status: "available",
  }).success, false);
  assert.equal(unitAvailabilityVersionSchema.safeParse({ ...availability, status: "occupied" }).success, false);
  assert.equal(unitAvailabilityVersionSchema.safeParse({ ...availability, status: "reserved" }).success, false);
  assert.equal(unitAvailabilityVersionSchema.safeParse({
    ...availability,
    effectiveTo: availability.effectiveFrom,
  }).success, false);
  assert.equal(unitAvailabilityVersionSchema.safeParse({
    ...availability,
    effectiveTo: "2026-09-30T23:59:59.000Z",
  }).success, false);
  assertRequiredFields(unitAvailabilityVersionSchema, without(availability, "effectiveTo"), [
    "id",
    "organizationId",
    "unitId",
    "status",
    "reasonCode",
    "effectiveFrom",
    "createdBy",
    "correlationId",
    "source",
    "createdAt",
  ]);
});

test("REQ-035 PROP-015 PROP-022 keeps operational provenance outside the public projection", () => {
  const snapshot = {
    propertyId: ids.property,
    propertyVersion: 2,
    unitId: ids.unit,
    unitVersion: 3,
    pricingVersionId: ids.pricing,
    availabilityVersionId: ids.availability,
    projection: {
      id: "gombe-residence-studio-a",
      name: "Gombe Residence - Studio A",
      city: "Kinshasa",
      district: "Gombe",
      summary: "A compact studio.",
      bedrooms: 0,
      bathrooms: 1,
      monthlyRentMinor: "40000",
      currency: "USD",
      availableFrom: "2026-10-03",
      amenities: [],
      imageUrls: ["https://example.test/listing.jpg"],
    },
  };

  assert.deepEqual(publicListingSnapshotSchema.parse(snapshot), snapshot);
  assert.equal(publicListingSnapshotSchema.safeParse({
    ...snapshot,
    projection: { ...snapshot.projection, organizationId: ids.organization },
  }).success, false);
  assert.equal(publicListingSnapshotSchema.safeParse({
    ...snapshot,
    projection: { ...snapshot.projection, address: "42 Secret Street" },
  }).success, false);
  assert.equal(publicListingSnapshotSchema.safeParse({
    ...snapshot,
    projection: { ...snapshot.projection, imageUrl: snapshot.projection.imageUrls[0] },
  }).success, false);
  assert.equal(publicListingSnapshotSchema.safeParse({
    ...snapshot,
    projection: { ...snapshot.projection, monthlyRentMinor: "9223372036854775807" },
  }).success, true);
  assert.equal(publicListingSnapshotSchema.safeParse({
    ...snapshot,
    projection: { ...snapshot.projection, monthlyRentMinor: "9223372036854775808" },
  }).success, false);
  assert.equal(publicListingSnapshotSchema.safeParse({
    ...snapshot,
    projection: { ...snapshot.projection, amenities: Array(101).fill("Lift") },
  }).success, false);

  const listing = {
    id: ids.listing,
    organizationId: ids.organization,
    propertyId: ids.property,
    unitId: ids.unit,
    status: "published",
    version: 4,
    snapshot,
    publishedAt: "2026-09-17T12:00:00.000Z",
    withdrawnAt: null,
    createdAt: "2026-09-17T10:00:00.000Z",
    updatedAt: "2026-09-17T12:00:00.000Z",
  };

  assert.equal(internalPublicListingSchema.safeParse(listing).success, true);
  assert.equal(internalPublicListingSchema.safeParse({ ...listing, snapshot: null }).success, false);
  assert.equal(internalPublicListingSchema.safeParse({
    ...listing,
    snapshot: { ...snapshot, unitId: ids.actor },
  }).success, false);
  assert.equal(internalPublicListingSchema.safeParse({ ...listing, withdrawnAt: listing.updatedAt }).success, false);
  assert.equal(internalPublicListingSchema.safeParse({
    ...listing,
    status: "withdrawn",
    withdrawnAt: null,
  }).success, false);
  assertRequiredFields(internalPublicListingSchema, listing, [
    "id",
    "organizationId",
    "propertyId",
    "unitId",
    "status",
    "version",
    "snapshot",
    "publishedAt",
    "createdAt",
    "updatedAt",
  ]);
  assert.equal(internalPublicListingSchema.safeParse(without(listing, "withdrawnAt")).success, false);
  for (const status of ["draft"]) {
    assert.equal(internalPublicListingSchema.safeParse({
      ...listing,
      status,
      snapshot: null,
      publishedAt: null,
    }).success, true);
    assert.equal(internalPublicListingSchema.safeParse({
      ...listing,
      status,
      snapshot: null,
      publishedAt: null,
      withdrawnAt: listing.updatedAt,
    }).success, false);
  }
  for (const status of ["reserved", "rented"]) {
    assert.equal(internalPublicListingSchema.safeParse({
      ...listing,
      status,
      snapshot: null,
      publishedAt: null,
    }).success, false);
  }
  assert.equal(internalPublicListingSchema.safeParse({
    id: ids.listing,
    organizationId: ids.organization,
    unitId: ids.unit,
    slug: "gombe-residence-studio-a",
    title: "Gombe Residence - Studio A",
    summary: "A compact synthetic studio listing.",
    city: "Kinshasa",
    district: "Gombe",
    bedrooms: 0,
    bathrooms: 1,
    areaSquareMeters: null,
    monthlyRentMinor: "40000",
    currency: "USD",
    availableFrom: "2026-10-03",
    amenities: [],
    imageUrls: ["/images/legacy-listing.jpg"],
    status: "published",
    publishedAt: listing.publishedAt,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  }).success, false);
  assert.equal(internalPublicListingSchema.safeParse({
    ...listing,
    status: "withdrawn",
    withdrawnAt: listing.updatedAt,
  }).success, true);

});

test("REQ-035 PROP-023 preserves public catalogue pagination boundaries", () => {
  assert.equal(publicPropertyListQuerySchema.parse({}).limit, 20);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: 1 }).success, true);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: 100 }).success, true);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: 0 }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: 101 }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: 1.5 }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: 20, organizationId: ids.organization }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ minBedrooms: "" }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ minBedrooms: 0 }).success, true);
  assert.equal(publicPropertyListQuerySchema.safeParse({ minBedrooms: 100 }).success, true);
  assert.equal(publicPropertyListQuerySchema.safeParse({ minBedrooms: 101 }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ maxMonthlyRentMinor: "1" }).success, true);
  assert.equal(publicPropertyListQuerySchema.safeParse({ maxMonthlyRentMinor: "1".repeat(19) }).success, false);
  assert.equal(publicPropertyListQuerySchema.parse({}).sort, "created_at_desc");
  assert.equal(publicPropertyListQuerySchema.safeParse({ sort: "rent_desc" }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ city: " ".repeat(3) }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ district: "x".repeat(121) }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ cursor: "invalid cursor" }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: "1" }).success, true);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: "100" }).success, true);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: "0" }).success, false);
  assert.equal(publicPropertyListQuerySchema.safeParse({ limit: "101" }).success, false);
});

test("REQ-035 PROP-015 PROP-022 actual anonymous schemas strip non-allowlisted fields", () => {
  const projection = {
    id: "gombe-residence-studio-a",
    name: "Gombe Residence - Studio A",
    address: "Gombe",
    city: "Kinshasa",
    district: "Gombe",
    summary: "A compact studio.",
    bedrooms: 0,
    bathrooms: 1,
    monthlyRentMinor: "40000",
    currency: "USD",
    availableFrom: "2026-10-03",
    amenities: [],
    imageUrls: ["https://example.test/listing.jpg"],
    organizationId: ids.organization,
    propertyId: ids.property,
    exactAddress: address,
  };
  const parsedList = publicPropertyListResultSchema.parse({
    items: [projection],
    nextCursor: null,
    total: 1,
    organizationId: ids.organization,
  });
  const parsedDetail = publicPropertyEnvelopeSchema.parse({
    data: projection,
    meta: { requestId: "request-3" },
  });
  assert.equal(publicPropertyEnvelopeSchema.safeParse({
    data: projection,
    meta: { requestId: "request-3" },
    auditEventId: "audit-1",
  }).success, false);
  const parsedEnvelope = publicPropertyListEnvelopeSchema.parse({
    items: [projection],
    nextCursor: null,
    total: 1,
    meta: { requestId: "request-3" },
  });

  for (const parsed of [parsedList.items[0], parsedDetail.data, parsedEnvelope.items[0]]) {
    assert.equal("organizationId" in parsed, false);
    assert.equal("propertyId" in parsed, false);
    assert.equal("exactAddress" in parsed, false);
  }
  assert.equal(publicPropertyProjectionSchema.parse(projection).address, "Gombe");
  assert.equal(publicPropertyListResultSchema.safeParse({
    items: Array(101).fill(projection),
    nextCursor: null,
    total: 101,
  }).success, false);
});