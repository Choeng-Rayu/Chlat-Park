import { z } from "zod";
import { ErrorResponseSchema, UuidSchema } from "../schemas/common.js";
import {
  ClaimRequestSchema,
  ClaimResponseSchema,
  EntryClaimSchema,
  ReissueClaimRequestSchema,
} from "../schemas/ticket.js";
import { createRoute } from "./route.js";

/**
 * Entry-claim routes.
 *
 * The guest-facing claim endpoint is public: the claim token *is* the
 * credential. It is single-use, rate-limited and stored only as a hash.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };
const sessionIdParams = z.object({ sessionId: UuidSchema });
const claimIdParams = z.object({ claimId: UuidSchema });

export const claimEntryRoute = createRoute({
  method: "post",
  path: "/entry-claims/claim",
  summary: "Claim an entry QR and receive an e-ticket",
  description:
    "Exchanges the raw claim token for a ticket token. The ticket token is returned exactly once. " +
    "A successful claim moves the session from PENDING_CLAIM to ACTIVE and starts the fee clock.",
  tags: ["entry-claims"],
  permissions: [],
  public: true,
  rateLimitBucket: "claim",
  idempotent: true,
  body: ClaimRequestSchema,
  responses: {
    "200": { description: "The e-ticket", schema: ClaimResponseSchema },
    "400": errorResponse,
    "410": errorResponse,
    "429": errorResponse,
  },
});

export const getEntryClaimRoute = createRoute({
  method: "get",
  path: "/entry-claims/{claimId}",
  summary: "Read the state of an entry claim",
  tags: ["entry-claims"],
  permissions: ["site.sessions.read"],
  params: claimIdParams,
  responses: {
    "200": { description: "The claim", schema: EntryClaimSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const reissueEntryClaimRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/entry-claim/reissue",
  summary: "Reissue (rotate) the entry QR of a pending session",
  description:
    "Revokes the previous claim and issues a fresh token with a new TTL. The session stays in " +
    "PENDING_CLAIM.",
  tags: ["entry-claims"],
  permissions: ["site.entry_qr.reissue"],
  params: sessionIdParams,
  body: ReissueClaimRequestSchema,
  responses: {
    "200": {
      description: "The reissued claim",
      schema: z.object({
        claim: EntryClaimSchema,
        /** The raw claim token. Shown once. */
        claimToken: z.string(),
        claimExpiresAt: z.string(),
      }),
    },
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});
