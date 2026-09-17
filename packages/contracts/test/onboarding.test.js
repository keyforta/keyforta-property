import assert from "node:assert/strict";
import test from "node:test";

import {
  landlordOnboardingApplicationInputSchema,
  landlordOnboardingApplicationSchema,
  landlordOnboardingDecisionInputSchema,
} from "../src/index.js";

test("landlord onboarding submission accepts only bounded applicant fields", () => {
  assert.deepEqual(
    landlordOnboardingApplicationInputSchema.parse({
      applicantName: "  Ada Landlord  ",
      proposedOrganizationName: "  Ada Estates  ",
    }),
    {
      applicantName: "Ada Landlord",
      proposedOrganizationName: "Ada Estates",
    },
  );
  assert.equal(
    landlordOnboardingApplicationInputSchema.safeParse({
      applicantName: "Ada Landlord",
      proposedOrganizationName: "Ada Estates",
      subject: "untrusted-subject",
    }).success,
    false,
  );
});

test("landlord onboarding decisions require a bounded reason", () => {
  assert.equal(
    landlordOnboardingDecisionInputSchema.safeParse({
      decision: "approved",
      reason: "Verified pilot applicant.",
    }).success,
    true,
  );
  assert.equal(
    landlordOnboardingDecisionInputSchema.safeParse({
      decision: "approved",
      reason: "",
    }).success,
    false,
  );
});

test("landlord onboarding projections strip identity and audit internals", () => {
  const parsed = landlordOnboardingApplicationSchema.parse({
    applicantName: "Ada Landlord",
    applicantObjectId: "00000000-0000-4000-8000-000000000001",
    applicantSubject: "private-subject",
    decidedAt: null,
    decisionReason: null,
    id: "00000000-0000-4000-8000-000000000002",
    proposedOrganizationName: "Ada Estates",
    status: "pending",
    submittedAt: "2026-09-16T12:00:00.000Z",
  });

  assert.equal("applicantObjectId" in parsed, false);
  assert.equal("applicantSubject" in parsed, false);
});