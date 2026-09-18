# KEYFORTA Domain Contracts

**Status:** Normative backend domain contract v1.0

## 1. Contract conventions

Every command has `commandId`, `actorPartyId`, `organizationId` when applicable, `correlationId`, `causationId`, `occurredAt`, and an idempotency key when it may be retried. Every aggregate mutation increments `version`, writes an audit event, and emits immutable domain events through the outbox.

Every invariant is enforced in the domain/application layer and protected by a database constraint where possible.

## 2. Identity and organization

### `Organization`

**Commands:** `CreateOrganization`, `UpdateOrganization`, `SuspendOrganization`, `ReactivateOrganization`
**Events:** `OrganizationCreated`, `OrganizationUpdated`, `OrganizationSuspended`, `OrganizationReactivated`
**Invariants:** one legal organization identity per organization record; suspended organizations cannot create operational records; default currency and time zone are valid; all changes are audited.

### `Party` and `Profile`

**Commands:** `CreateParty`, `UpdateProfile`, `SubmitProfileVerification`, `VerifyProfile`, `RejectProfile`
**Events:** `PartyCreated`, `ProfileUpdated`, `ProfileVerificationSubmitted`, `ProfileVerified`, `ProfileVerificationRejected`
**Invariants:** external identity subject is unique within issuer; a profile belongs to one party; verification decisions identify reviewer and reason; sensitive evidence is not returned in ordinary profile reads.

### `Membership` and `Invitation`

**Commands:** `InviteManager`, `AcceptInvitation`, `ChangeMembershipRole`, `SuspendMembership`, `EndMembership`, `RevokeInvitation`
**Events:** `MembershipInvited`, `MembershipAccepted`, `MembershipRoleChanged`, `MembershipSuspended`, `MembershipEnded`, `InvitationRevoked`
**Invariants:** invitation is signed, scoped, expiring, and single-use; only an authorized landlord or platform administrator can invite; acceptance requires authenticated identity matching the invitation policy; effective intervals cannot create conflicting active primary roles.

## 3. Party and relationship

### `Relationship`

**Commands:** `EstablishRelationship`, `ChangeRelationshipScope`, `EndRelationship`
**Events:** `RelationshipEstablished`, `RelationshipScopeChanged`, `RelationshipEnded`
**Invariants:** subject and parties exist; relationship type is allowed; effective intervals are valid; ownership, management, occupancy, and assignment relationships cannot overlap in prohibited ways; historical records are retained.

## 4. Property and inventory

The Product Owner approved the detailed
[Rental Property and Unit Core Profile v1](../product/RENTAL_PROPERTY_INVENTORY_REQUIREMENTS_PROPOSAL.md)
on 2026-09-17. Its REQ-032 through REQ-036 field, visibility, versioning,
pricing, availability, archive, migration, and PublicListing rules are normative
for this section. Existing commands below remain valid only where their behavior
does not conflict with that profile; Property and Unit publication commands
control inventory eligibility, while PublicListing alone controls public
visibility. Runtime support remains pending separately reviewed implementation.

### `Property`

**Commands:** `CreateProperty`, `UpdateProperty`, `SubmitPropertyForVerification`, `ApprovePropertyVerification`, `RejectPropertyVerification`, `PublishProperty`, `UnpublishProperty`, `ArchiveProperty`, `AssignManager`
**Events:** `PropertyCreated`, `PropertyUpdated`, `PropertyVerificationSubmitted`, `PropertyVerificationApproved`, `PropertyVerificationRejected`, `PropertyPublished`, `PropertyUnpublished`, `PropertyArchived`, `ManagerAssigned`, `ManagerAssignmentRevoked`
**Invariants:** property belongs to one organization and contains one or more units; address and property time zone are valid; each property has at most one active assigned listing manager; a landlord may assign themselves or another eligible same-organization member; ownership alone does not authorize unit-listing management; assignment changes retain immutable history; archived properties cannot accept applications.

### `Unit` and `PricingVersion`

**Commands:** `CreateUnit`, `UpdateUnit`, `CompleteLegacyUnitProfile`, `SetUnitPricing`, `PublishUnit`, `PauseUnit`, `MarkUnitOccupied`, `MarkUnitVacant`, `ArchiveUnit`
**Events:** `UnitCreated`, `UnitUpdated`, `UnitPricingChanged`, `UnitPublished`, `UnitPaused`, `UnitAvailabilityChanged`
**Invariants:** unit label is unique within property; only the property's active assigned manager may manage its unit listings; pricing intervals do not overlap; occupied units cannot be published as available; signed lease terms are not rewritten by later pricing.

### `PublicListing`

**Commands:** `CreateUnitListing`, `UpdateUnitListing`, `PublishUnitListing`, `WithdrawUnitListing`
**Events:** `UnitListingCreated`, `UnitListingUpdated`, `UnitListingPublished`, `UnitListingWithdrawn`
**Invariants:** PublicListing is separately versioned and is the sole public-marketing and publication authority; publication snapshots selected Property, Unit, PricingVersion, availability, and approved-media versions atomically; ordinary operational edits never mutate a published snapshot; archived or ineligible inventory cannot publish; pre-activation compatibility behavior and public projection fields follow REQ-035 and PROP-012, PROP-015, PROP-019, PROP-022, and PROP-023.

## 5. Leasing and occupancy

### `ViewingRequest`

**Commands:** `RequestViewing`, `RescheduleViewing`, `ConfirmViewing`, `CancelViewing`, `RecordViewingOutcome`
**Events:** `ViewingRequested`, `ViewingRescheduled`, `ViewingConfirmed`, `ViewingCancelled`, `ViewingOutcomeRecorded`
**Invariants:** request references one published unit; requester may access the public workflow; scheduled time is valid for the property time zone; cancellation and rescheduling are audited.

### `RentalApplication`

**Commands:** `CreateApplicationDraft`, `UpdateApplicationDraft`, `SubmitApplication`, `RequestApplicationChanges`, `ResubmitApplication`, `ApproveApplication`, `RejectApplication`, `WithdrawApplication`
**Events:** `RentalApplicationCreated`, `ApplicationDraftUpdated`, `RentalApplicationSubmitted`, `ApplicationChangesRequested`, `ApplicationResubmitted`, `ApplicationApproved`, `ApplicationRejected`, `ApplicationWithdrawn`
**Invariants:** one application targets one unit; submitted versions are immutable; required fields, consent, and evidence references are complete before submission; only an authorized manager/landlord decides; approval does not activate occupancy.

### `Lease` and `OccupancyPeriod`

**Commands:** `CreateLeaseFromApplication`, `ProposeLeaseTerms`, `AcceptLease`, `SignLease`, `ActivateLease`, `RenewLease`, `TerminateLease`, `RecordMoveIn`, `RecordMoveOut`
**Events:** `LeaseCreated`, `LeaseOffered`, `LeaseAccepted`, `LeaseSigned`, `LeaseActivated`, `LeaseRenewed`, `LeaseTerminated`, `OccupancyStarted`, `OccupancyEnded`
**Invariants:** no overlapping active lease or occupancy for a unit; signed terms are immutable; activation requires required parties, accepted terms, required acknowledgements/signatures, and available unit; termination requires effective date and reason.

## 6. Billing and ledger

### `ChargeSchedule` and `Charge`

**Commands:** `CreateChargeSchedule`, `GenerateCharges`, `AdjustCharge`, `WaiveCharge`, `CloseChargeSchedule`
**Events:** `ChargeScheduleCreated`, `ChargesGenerated`, `ChargeAdjusted`, `ChargeWaived`, `ChargeScheduleClosed`
**Invariants:** generation is deterministic and unique by schedule and billing period; charge amount and currency are valid; posted charges are not edited in place; adjustments are auditable.

### `LedgerAccount` and `LedgerEntry`

**Commands:** `PostLedgerEntry`, `ReverseLedgerEntry`, `CreateReplacementEntry`, `CloseLedgerPeriod`
**Events:** `LedgerEntryPosted`, `LedgerEntryReversed`, `LedgerReplacementEntryCreated`, `LedgerPeriodClosed`
**Invariants:** posted entries are append-only; debit/credit or equivalent balancing rules hold; reversal references the original; closed periods cannot be silently changed.

## 7. Payments and reconciliation

### `PaymentIntent` and `Payment`

**Commands:** `CreatePaymentIntent`, `RecordPayment`, `AllocatePayment`, `RefundPayment`, `ReversePayment`, `ReconcilePayment`
**Events:** `PaymentIntentCreated`, `PaymentRecorded`, `PaymentAllocated`, `PaymentRefunded`, `PaymentReversed`, `PaymentReconciled`
**Invariants:** amount is positive and currency explicit; provider callbacks are verified and idempotent; allocation cannot exceed payment or charge balance; provider state does not replace ledger state; refunds and reversals are auditable.

## 8. Maintenance and inspection

### `ServiceOffer`

**Commands:** `CreateServiceOffer`, `UpdateServiceOffer`, `PublishServiceOffer`, `PauseServiceOffer`, `WithdrawServiceOffer`
**Events:** `ServiceOfferCreated`, `ServiceOfferUpdated`, `ServiceOfferPublished`, `ServiceOfferPaused`, `ServiceOfferWithdrawn`
**Invariants:** required operator verification exists before publication; service categories and coverage are valid; publication grants discoverability only.

### `MaintenanceRequest`, `Assignment`, `Quote`, and `Report`

**Commands:** `SubmitMaintenanceRequest`, `TriageRequest`, `AssignOperator`, `AcceptAssignment`, `ScheduleVisit`, `OpenAccessWindow`, `StartWork`, `CompleteWork`, `ConfirmCompletion`, `ReopenRequest`, `CancelRequest`, `SubmitQuote`, `ApproveQuote`, `RejectQuote`, `SubmitReport`, `SubmitEvidence`
**Events:** `MaintenanceRequestSubmitted`, `MaintenanceRequestTriaged`, `OperatorAssigned`, `AssignmentAccepted`, `VisitScheduled`, `AccessWindowOpened`, `WorkStarted`, `WorkCompleted`, `CompletionConfirmed`, `MaintenanceReopened`, `MaintenanceCancelled`, `QuoteSubmitted`, `QuoteApproved`, `QuoteRejected`, `ReportSubmitted`, `EvidenceSubmitted`
**Invariants:** requester is related to subject; assigned operator is eligible; property data is exposed only during an active access window; completion requires applicable report/evidence; quote total equals modeled components; every transition is audited.

## 9. Documents and communication

### `Document` and `DocumentVersion`

**Commands:** `RegisterDocument`, `UploadDocumentVersion`, `ReviewDocument`, `ActivateDocumentVersion`, `GrantDocumentAccess`, `RevokeDocumentAccess`, `AcknowledgeDocument`, `ArchiveDocument`
**Events:** `DocumentRegistered`, `DocumentVersionUploaded`, `DocumentReviewed`, `DocumentVersionActivated`, `DocumentAccessGranted`, `DocumentAccessRevoked`, `DocumentAcknowledged`, `DocumentArchived`
**Invariants:** versions are immutable and monotonic; exactly one version is active where required; sensitive documents are never public; access grants are scoped and expiring; retention/legal hold prevents premature deletion.

### `Conversation` and `Notification`

**Commands:** `StartConversation`, `SendMessage`, `MarkMessageRead`, `CloseConversation`, `QueueNotification`, `MarkNotificationRead`, `RecordDeliveryResult`
**Events:** `ConversationStarted`, `MessageSent`, `MessageRead`, `ConversationClosed`, `NotificationQueued`, `NotificationDelivered`, `NotificationFailed`
**Invariants:** participants are authorized for the subject; messages are attributed to authenticated parties; attachments are checked independently; delivery is asynchronous and retryable.

## 10. Governance, audit, and AI

### `AuditEvent` and `SupportAccessGrant`

Audit records are append-only. Privileged support access requires reason, target, scope, expiry, approver, and visibility. The system emits `SupportAccessRequested`, `SupportAccessApproved`, `SupportAccessRevoked`, and `SupportAccessExpired`.

### `AIRequest`, `AIResult`, and `HumanReviewTask`

AI may summarize, classify, draft, identify missing evidence, or answer with citations. It may not authorize, approve/reject, sign/activate/terminate, post/refund/reverse money, grant access, or conclusively verify. AI results include model/provider, policy version, source IDs, generated time, and human action.

## 11. Cross-context invariants

- Organization isolation is enforced at every protected read and command.
- A manager's access is valid only during the effective delegation interval and scope.
- A tenant's payment access derives from a valid lease/relationship, not a client-supplied lease ID alone.
- A unit cannot be simultaneously available and occupied.
- A payment cannot reduce a charge below zero.
- A document access grant cannot outlive its source relationship when policy requires relationship-bound access.
- An event consumer must tolerate duplicates and preserve event schema version compatibility.
