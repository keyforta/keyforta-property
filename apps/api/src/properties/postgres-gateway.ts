import type {
  PublicPropertyListQuery,
  PublicPropertyProjection,
} from "@keyforta/contracts";

import type { DatabaseClient } from "../database.js";

import {
  InvalidPublicPropertyCursorError,
  type PublicPropertyGateway,
} from "./gateway.js";

interface PublicListingRow {
  amenities: string[];
  area_square_meters: number | null;
  available_from: string;
  bathrooms: number;
  bedrooms: number;
  city: string;
  currency: string;
  district: string;
  image_urls: string[];
  monthly_rent_minor: string;
  slug: string;
  summary: string;
  title: string;
}

function parseDateOnly(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) return undefined;
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parsePublicListingRow(row: unknown): PublicListingRow {
  if (!row || typeof row !== "object") {
    throw new Error("The public listing query returned an invalid row.");
  }
  const candidate = row as Record<string, unknown>;
  const availableFrom = parseDateOnly(candidate.available_from);
  if (
    !Array.isArray(candidate.amenities) ||
    !candidate.amenities.every((value) => typeof value === "string") ||
    (candidate.area_square_meters !== null &&
      typeof candidate.area_square_meters !== "number") ||
    availableFrom === undefined ||
    typeof candidate.bathrooms !== "number" ||
    typeof candidate.bedrooms !== "number" ||
    typeof candidate.city !== "string" ||
    typeof candidate.currency !== "string" ||
    typeof candidate.district !== "string" ||
    !Array.isArray(candidate.image_urls) ||
    !candidate.image_urls.every((value) => typeof value === "string") ||
    typeof candidate.monthly_rent_minor !== "string" ||
    typeof candidate.slug !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.title !== "string"
  ) {
    throw new Error("The public listing query returned an invalid row.");
  }
  return {
    amenities: candidate.amenities,
    area_square_meters: candidate.area_square_meters,
    available_from: availableFrom,
    bathrooms: candidate.bathrooms,
    bedrooms: candidate.bedrooms,
    city: candidate.city,
    currency: candidate.currency,
    district: candidate.district,
    image_urls: candidate.image_urls,
    monthly_rent_minor: candidate.monthly_rent_minor,
    slug: candidate.slug,
    summary: candidate.summary,
    title: candidate.title,
  };
}

function toProjection(row: PublicListingRow): PublicPropertyProjection {
  return {
    address: row.district,
    amenities: row.amenities,
    availableFrom: row.available_from,
    bathrooms: row.bathrooms,
    bedrooms: row.bedrooms,
    city: row.city,
    currency: row.currency,
    district: row.district,
    id: row.slug,
    ...(row.image_urls[0] ? { imageUrl: row.image_urls[0] } : {}),
    imageUrls: row.image_urls,
    monthlyRentMinor: row.monthly_rent_minor,
    name: row.title,
    summary: row.summary,
    ...(row.area_square_meters
      ? { areaSquareMeters: row.area_square_meters }
      : {}),
  };
}

function sortRows(
  rows: PublicListingRow[],
  sort: PublicPropertyListQuery["sort"],
): PublicListingRow[] {
  if (sort === "name_asc") {
    return rows.sort(
      (left, right) =>
        left.title.localeCompare(right.title) ||
        left.slug.localeCompare(right.slug),
    );
  }
  if (sort === "name_desc") {
    return rows.sort(
      (left, right) =>
        right.title.localeCompare(left.title) ||
        left.slug.localeCompare(right.slug),
    );
  }
  return rows;
}

export function createPostgresPublicPropertyGateway(
  client: DatabaseClient,
): PublicPropertyGateway {
  return {
    async findById(propertyId) {
      const result = await client.query(
        "select * from app.get_public_listing($1)",
        [propertyId],
      );
      const row = result.rows[0];
      return row ? toProjection(parsePublicListingRow(row)) : undefined;
    },
    async list(query) {
      const result = await client.query(
        "select * from app.list_public_listings($1, $2, $3)",
        [
          query.district ?? null,
          query.minBedrooms ?? null,
          query.maxMonthlyRentMinor ?? null,
        ],
      );
      const rows = sortRows(
        result.rows
          .map(parsePublicListingRow)
          .filter(
            (row) =>
              query.city === undefined ||
              row.city.localeCompare(query.city, undefined, {
                sensitivity: "accent",
              }) === 0,
          ),
        query.sort,
      );
      const cursorIndex = query.cursor
        ? rows.findIndex((row) => row.slug === query.cursor)
        : -1;
      if (query.cursor && cursorIndex === -1) {
        throw new InvalidPublicPropertyCursorError();
      }
      const pageStart = cursorIndex + 1;
      const page = rows.slice(pageStart, pageStart + query.limit);

      return {
        items: page.map(toProjection),
        nextCursor:
          pageStart + page.length < rows.length
            ? page.at(-1)?.slug ?? null
            : null,
        total: rows.length,
      };
    },
  };
}