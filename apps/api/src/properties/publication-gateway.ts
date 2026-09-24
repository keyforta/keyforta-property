import type { DatabaseClient, DatabaseSession } from "../database.js";
import { RentalInventoryAuthorizationError } from "./inventory-command-gateway.js";

export interface SetPublicListingPublicationCommand {
  correlationId: string;
  listingId: string;
  organizationId: string;
  published: boolean;
  subject: string;
}

export interface ListPublicListingsForActorCommand {
  correlationId: string;
  organizationId: string;
  subject: string;
}

export interface PublicListingSummary {
  id: string;
  imageUrls: string[];
  mediaReviewNotes: string | null;
  mediaReviewStatus: string;
  note: string;
  status: string;
  summary: string | null;
  title: string;
  unitId: string;
  version: number;
}

export interface ReviewPublicListingMediaCommand {
  correlationId: string;
  decision: "approved" | "rejected";
  listingId: string;
  notes?: string | null;
  reviewerObjectId: string;
  reviewerSubject: string;
  source: string;
}

export interface ReviewPublicListingMediaResult {
  listingId: string;
  mediaReviewStatus: string;
}

export interface PendingPublicListingMediaReviewImage {
  imageId: string;
  mediaType: string;
  position: number;
  room: string;
}

export interface PendingPublicListingMediaReview {
  imageUrls: string[];
  listingId: string;
  organizationId: string;
  organizationName: string;
  propertyName: string;
  submittedAt: string;
  summary: string | null;
  title: string | null;
  uploadedImages: PendingPublicListingMediaReviewImage[];
  unitId: string;
  unitLabel: string;
}

export interface PublicListingPublicationGateway {
  listForActor(
    command: ListPublicListingsForActorCommand,
  ): Promise<PublicListingSummary[]>;
  listPendingMediaReview(): Promise<PendingPublicListingMediaReview[]>;
  reviewPublicListingMedia(
    command: ReviewPublicListingMediaCommand,
  ): Promise<ReviewPublicListingMediaResult | undefined>;
  setPublication(command: SetPublicListingPublicationCommand): Promise<boolean>;
}

async function resolveActor(
  session: DatabaseSession,
  subject: string,
  organizationId: string,
): Promise<void> {
  const actor = await session.query("select * from app.resolve_actor($1, $2)", [
    subject,
    organizationId,
  ]);
  if (actor.rows.length !== 1) {
    throw new RentalInventoryAuthorizationError();
  }
}

export function createPostgresPublicListingPublicationGateway(
  client: DatabaseClient,
): PublicListingPublicationGateway {
  return {
    async listForActor(command) {
      return client.transaction(async (session) => {
        await resolveActor(session, command.subject, command.organizationId);
        const result = await session.query(
          "select app.list_public_listings_for_actor() as listings",
        );
        const row = result.rows[0] as { listings?: PublicListingSummary[] } | undefined;
        return row?.listings ?? [];
      });
    },

    async listPendingMediaReview() {
      const result = await client.query(
        "select * from app.list_public_listings_pending_media_review()",
      );
      return result.rows.map((row) => {
        const typed = row as {
          listing_id: string;
          organization_id: string;
          organization_name: string;
          unit_id: string;
          property_name: string;
          unit_label: string;
          title: string | null;
          summary: string | null;
          image_urls: string[];
          uploaded_images: Array<{
            imageId: string;
            room: string;
            mediaType: string;
            position: number;
          }>;
          submitted_at: Date | string;
        };
        return {
          imageUrls: typed.image_urls ?? [],
          listingId: typed.listing_id,
          organizationId: typed.organization_id,
          organizationName: typed.organization_name,
          propertyName: typed.property_name,
          submittedAt: typed.submitted_at instanceof Date
            ? typed.submitted_at.toISOString()
            : new Date(typed.submitted_at).toISOString(),
          summary: typed.summary,
          title: typed.title,
          unitId: typed.unit_id,
          unitLabel: typed.unit_label,
          uploadedImages: (typed.uploaded_images ?? []).map((image) => ({
            imageId: image.imageId,
            mediaType: image.mediaType,
            position: image.position,
            room: image.room,
          })),
        };
      });
    },

    async reviewPublicListingMedia(command) {
      const result = await client.query(
        "select * from app.review_public_listing_media($1, $2, $3, $4, $5, $6, $7)",
        [
          command.listingId,
          command.decision,
          command.reviewerSubject,
          command.reviewerObjectId,
          command.notes ?? null,
          command.correlationId,
          command.source,
        ],
      );
      const row = result.rows[0] as
        | { listing_id?: string; media_review_status?: string }
        | undefined;
      if (!row?.listing_id || !row.media_review_status) return undefined;
      return { listingId: row.listing_id, mediaReviewStatus: row.media_review_status };
    },

    async setPublication(command) {
      return client.transaction(async (session) => {
        const actor = await session.query("select * from app.resolve_actor($1, $2)", [
          command.subject,
          command.organizationId,
        ]);
        if (actor.rows.length !== 1) return false;
        await session.query("select set_config('app.correlation_id', $1, true)", [
          command.correlationId,
        ]);
        const result = await session.query(
          "select app.set_public_listing_publication($1, $2) as changed",
          [command.listingId, command.published],
        );
        return (result.rows[0] as { changed?: boolean } | undefined)?.changed === true;
      });
    },
  };
}