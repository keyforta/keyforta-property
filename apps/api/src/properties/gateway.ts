import type {
  PublicPropertyListQuery,
  PublicPropertyListResult,
  PublicPropertyProjection,
} from "@keyforta/contracts";

export interface PublicPropertyGateway {
  findById(propertyId: string): Promise<PublicPropertyProjection | undefined>;
  list(query: PublicPropertyListQuery): Promise<PublicPropertyListResult>;
}

export interface PublicPropertyRecord extends PublicPropertyProjection {
  createdAt: string;
  published: boolean;
}

export class InvalidPublicPropertyCursorError extends Error {
  constructor() {
    super("The public property cursor is invalid.");
    this.name = "InvalidPublicPropertyCursorError";
  }
}

function toProjection(record: PublicPropertyRecord): PublicPropertyProjection {
  return {
    address: record.address,
    city: record.city,
    id: record.id,
    ...(record.imageUrl ? { imageUrl: record.imageUrl } : {}),
    name: record.name,
    summary: record.summary,
  };
}

export function createMemoryPublicPropertyGateway(
  records: ReadonlyArray<PublicPropertyRecord>,
): PublicPropertyGateway {
  return {
    async findById(propertyId) {
      const record = records.find(
        (candidate) => candidate.published && candidate.id === propertyId,
      );
      return record ? toProjection(record) : undefined;
    },
    async list(query) {
      const filtered = records
        .filter(
          (record) =>
            record.published &&
            (query.city === undefined ||
              record.city.localeCompare(query.city, undefined, {
                sensitivity: "accent",
              }) === 0),
        )
        .sort((left, right) => {
          if (query.sort === "name_asc") {
            return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
          }
          if (query.sort === "name_desc") {
            return right.name.localeCompare(left.name) || left.id.localeCompare(right.id);
          }
          return (
            right.createdAt.localeCompare(left.createdAt) ||
            left.id.localeCompare(right.id)
          );
        });
      const cursorIndex = query.cursor
        ? filtered.findIndex((record) => record.id === query.cursor)
        : -1;
      if (query.cursor && cursorIndex === -1) {
        throw new InvalidPublicPropertyCursorError();
      }
      const pageStart = cursorIndex + 1;
      const page = filtered.slice(pageStart, pageStart + query.limit);
      const hasNextPage = pageStart + page.length < filtered.length;

      return {
        items: page.map(toProjection),
        nextCursor: hasNextPage ? page.at(-1)?.id ?? null : null,
        total: filtered.length,
      };
    },
  };
}