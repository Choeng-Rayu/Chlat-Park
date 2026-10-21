import { ErrorResponseSchema } from "../schemas/common.js";
import { VerifyExitRequestSchema, VerifyExitResponseSchema } from "../schemas/ticket.js";
import { createRoute } from "./route.js";

/**
 * Exit-verification route.
 *
 * Verification returns a *status object*, not a decision. The guard reads the
 * verdict, physically checks the plate, records the payment or an exemption,
 * and then authorises the exit.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };

export const verifyExitRoute = createRoute({
  method: "post",
  path: "/verification/exit",
  summary: "Verify a ticket and read the exit details",
  description:
    "Returns one of exactly nine verdicts: VALID, PAYMENT_PENDING, PLATE_MISMATCH, " +
    "ALREADY_COMPLETED, REVOKED, EXPIRED, UNKNOWN, MANUAL_REVIEW_REQUIRED, NOT_ACTIVE.",
  tags: ["verification"],
  permissions: ["site.ticket.verify"],
  rateLimitBucket: "verify",
  body: VerifyExitRequestSchema,
  responses: {
    "200": { description: "The verdict", schema: VerifyExitResponseSchema },
    "400": errorResponse,
    "403": errorResponse,
    "429": errorResponse,
  },
});
