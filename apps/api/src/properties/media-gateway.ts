import type { DatabaseClient } from "../database.js";
import {
  RentalInventoryAuthorizationError,
  resolveActor,
  translateWriteError,
} from "./inventory-command-gateway.js";

export const publicListingImageRooms = [
  "exterior",
  "living",
  "kitchen",
  "bathroom",
  "bedroom",
  "dining",
  "other",
] as const;

export type PublicListingImageRoom = (typeof publicListingImageRooms)[number];

export interface UploadPublicListingImageCommand {
  content: Buffer;
  contentHash: string;
  correlationId: string;
  listingId: string;
  mediaType: string;
  organizationId: string;
  room: string;
  sizeBytes: number;
  source: string;
  subject: string;
}

export interface UploadPublicListingImageResult {
  imageId: string;
  listingId: string;
  listingVersion: number;
  position: number;
}

export interface DeletePublicListingImageCommand {
  correlationId: string;
  imageId: string;
  listingId: string;
  organizationId: string;
  source: string;
  subject: string;
}

export interface DeletePublicListingImageResult {
  listingId: string;
  listingVersion: number;
}

export interface ListPublicListingImagesCommand {
  listingId: string;
  organizationId: string;
  subject: string;
}

export interface PublicListingImageSummary {
  createdAt: string;
  imageId: string;
  mediaType: string;
  position: number;
  room: string;
  sizeBytes: number;
}

export interface PublicListingImageByRoom {
  imageId: string;
  position: number;
  room: string;
}

export interface PublicListingImageContent {
  content: Buffer;
  mediaType: string;
}

export interface CanActorUploadPublicListingImageCommand {
  listingId: string;
  organizationId: string;
  subject: string;
}

export interface PublicListingMediaGateway {
  canActorUploadImage(
    command: CanActorUploadPublicListingImageCommand,
  ): Promise<boolean>;
  deleteImage(
    command: DeletePublicListingImageCommand,
  ): Promise<DeletePublicListingImageResult | undefined>;
  getPublicImageContent(
    listingId: string,
    imageId: string,
  ): Promise<PublicListingImageContent | undefined>;
  getReviewImageContent(
    listingId: string,
    imageId: string,
  ): Promise<PublicListingImageContent | undefined>;
  listImages(
    command: ListPublicListingImagesCommand,
  ): Promise<readonly PublicListingImageSummary[]>;
  listPublicImagesByRoom(
    listingId: string,
  ): Promise<readonly PublicListingImageByRoom[]>;
  uploadImage(
    command: UploadPublicListingImageCommand,
  ): Promise<UploadPublicListingImageResult | undefined>;
}

export function createPostgresPublicListingMediaGateway(
  client: DatabaseClient,
): PublicListingMediaGateway {
  return {
    // Cheap existence+authorization precheck the runtime API calls before
    // decoding base64 content or invoking the malware scanner, so an
    // authenticated-but-unauthorized actor cannot repeatedly burn scan
    // resources before being rejected (Copilot review finding on PR #131).
    async canActorUploadImage(command) {
      try {
        return await client.transaction(async (session) => {
          await resolveActor(session, command.subject, command.organizationId);
          const result = await session.query(
            `select app.actor_can_upload_public_listing_image($1) as allowed`,
            [command.listingId],
          );
          const row = result.rows[0] as { allowed?: boolean } | undefined;
          return row?.allowed === true;
        });
      } catch (error) {
        if (error instanceof RentalInventoryAuthorizationError) return false;
        throw error;
      }
    },
    async uploadImage(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        try {
          const result = await session.query(
            `select * from app.upload_public_listing_image($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              command.listingId,
              command.room,
              command.mediaType,
              command.sizeBytes,
              command.content,
              command.contentHash,
              command.correlationId,
              command.source,
            ],
          );
          const row = result.rows[0] as
            | {
                image_id?: string;
                listing_id?: string;
                listing_version?: number;
                image_position?: number;
              }
            | undefined;
          if (
            !row?.image_id ||
            !row.listing_id ||
            row.listing_version === undefined ||
            row.image_position === undefined
          ) {
            return undefined;
          }
          return {
            imageId: row.image_id,
            listingId: row.listing_id,
            listingVersion: row.listing_version,
            position: row.image_position,
          };
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async deleteImage(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        try {
          const result = await session.query(
            `select * from app.delete_public_listing_image($1, $2, $3, $4)`,
            [command.listingId, command.imageId, command.correlationId, command.source],
          );
          const row = result.rows[0] as
            | { listing_id?: string; listing_version?: number }
            | undefined;
          if (!row?.listing_id || row.listing_version === undefined) return undefined;
          return { listingId: row.listing_id, listingVersion: row.listing_version };
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async listImages(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        try {
          const result = await session.query(
            `select * from app.list_public_listing_images_for_actor($1)`,
            [command.listingId],
          );
          return result.rows.map((row) => {
            const typed = row as {
              image_id: string;
              room: string;
              media_type: string;
              size_bytes: number;
              image_position: number;
              created_at: Date | string;
            };
            return {
              createdAt:
                typed.created_at instanceof Date
                  ? typed.created_at.toISOString()
                  : new Date(typed.created_at).toISOString(),
              imageId: typed.image_id,
              mediaType: typed.media_type,
              position: typed.image_position,
              room: typed.room,
              sizeBytes: typed.size_bytes,
            };
          });
        } catch (error) {
          translateWriteError(error);
        }
      });
    },

    async listPublicImagesByRoom(listingId) {
      const result = await client.query(
        "select * from app.list_public_listing_images_by_room($1)",
        [listingId],
      );
      return result.rows.map((row) => {
        const typed = row as { image_id: string; room: string; image_position: number };
        return { imageId: typed.image_id, position: typed.image_position, room: typed.room };
      });
    },

    async getPublicImageContent(listingId, imageId) {
      const result = await client.query(
        "select * from app.get_public_listing_image_content($1, $2)",
        [listingId, imageId],
      );
      const row = result.rows[0] as
        | { media_type?: string; content?: Buffer }
        | undefined;
      if (!row?.media_type || !row.content) return undefined;
      return { content: row.content, mediaType: row.media_type };
    },

    // Platform-admin-only review path (migration 0033): serves the same
    // image bytes as getPublicImageContent, but only while the listing is
    // still awaiting media review, so a reviewer can see an uploaded image
    // before approving/rejecting it -- getPublicImageContent would 404 at
    // that point, since publish (and therefore public eligibility) has not
    // happened yet.
    async getReviewImageContent(listingId, imageId) {
      const result = await client.query(
        "select * from app.get_public_listing_image_content_for_review($1, $2)",
        [listingId, imageId],
      );
      const row = result.rows[0] as
        | { media_type?: string; content?: Buffer }
        | undefined;
      if (!row?.media_type || !row.content) return undefined;
      return { content: row.content, mediaType: row.media_type };
    },
  };
}
