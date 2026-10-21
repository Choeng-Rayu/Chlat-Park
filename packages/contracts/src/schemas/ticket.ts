import { z } from "zod";
import { IsoDateTimeSchema, MetadataSchema, PaginationQuerySchema, UuidSchema } from "./common.js";

/**
 * Entry claims and e-tickets.
 *
 * A guest never registers: they scan the entry QR, the API exchanges the raw
 * claim token for a ticket token, and the ticket is what the guard scans at
 * the exit. Both tokens are shown exactly once.
 */

/** The lifecycle status of an e-ticket. */
export const TicketStatusSchema = z.enum(["ISSUED", "REVOKED", "EXPIRED"]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

/** The lifecycle status of an entry claim. */
export const ClaimStatusSchema = z.enum(["PENDING", "CLAIMED", "EXPIRED", "REVOKED"]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

/** An e-ticket. */
export const TicketSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  siteId: UuidSchema,
  status: TicketStatusSchema,
  /** The plate the ticket is bound to. Returned only to authorised actors. */
  plateId: z.string().trim().min(1).max(16),
  issuedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema.nullable(),
  revokedAt: IsoDateTimeSchema.nullable(),
  metadata: MetadataSchema.optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

/** An entry claim. The raw token is never part of this shape. */
export const EntryClaimSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  siteId: UuidSchema,
  status: ClaimStatusSchema,
  expiresAt: IsoDateTimeSchema,
  claimedAt: IsoDateTimeSchema.nullable(),
});
export type EntryClaim = z.infer<typeof EntryClaimSchema>;

/**
 * The body of the claim request.
 *
 * The raw claim token is what the guest scans; it is single-use, rate-limited
 * and stored only as a hash.
 */
export const ClaimRequestSchema = z.object({
  claimToken: z.string().trim().min(20).max(512),
});
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

/**
 * The response to a successful claim.
 *
 * `ticketToken` is returned exactly once — the guest is expected to store it
 * (or render it as a QR) immediately.
 */
export const ClaimResponseSchema = z.object({
  ticket: TicketSchema,
  /** The raw ticket token. Shown once. */
  ticketToken: z.string().min(20),
  entryAt: IsoDateTimeSchema,
  site: z.object({
    id: UuidSchema,
    name: z.string(),
    address: z.string(),
  }),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

/** The body of a reissue request for a pending claim. */
export const ReissueClaimRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});
export type ReissueClaimRequest = z.infer<typeof ReissueClaimRequestSchema>;

/** The list query for the ticket collection. */
export const ListTicketsQuerySchema = PaginationQuerySchema.extend({
  siteId: UuidSchema.optional(),
  sessionId: UuidSchema.optional(),
  status: TicketStatusSchema.optional(),
});
export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;

/**
 * The verdict of an exit verification.
 *
 * The verification returns a *status object*, not a decision: the guard
 * physically checks the plate and then authorises the exit.
 */
export const VerificationVerdictSchema = z.enum([
  "VALID",
  "PAYMENT_PENDING",
  "PLATE_MISMATCH",
  "ALREADY_COMPLETED",
  "REVOKED",
  "EXPIRED",
  "UNKNOWN",
  "MANUAL_REVIEW_REQUIRED",
  "NOT_ACTIVE",
]);
export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;

/** The body of an exit-verification request. */
export const VerifyExitRequestSchema = z.object({
  /** The ticket token from the scanned QR, or the ticket reference. */
  ticketToken: z.string().trim().min(20).max(512).optional(),
  ticketId: UuidSchema.optional(),
  /** The plate the guard read off the bike, for a physical cross-check. */
  plateId: z.string().trim().min(1).max(16).optional(),
});
export type VerifyExitRequest = z.infer<typeof VerifyExitRequestSchema>;

/** The response of an exit verification. */
export const VerifyExitResponseSchema = z.object({
  verdict: VerificationVerdictSchema,
  session: z
    .object({
      id: UuidSchema,
      siteId: UuidSchema,
      status: z.string(),
      plateId: z.string(),
      entryAt: IsoDateTimeSchema.nullable(),
      durationMinutes: z.number().int().nonnegative(),
    })
    .nullable(),
  ticket: z
    .object({
      id: UuidSchema,
      status: TicketStatusSchema,
    })
    .nullable(),
  fee: z
    .object({
      amountMinor: z.number().int().nonnegative(),
      currency: z.string(),
      policyVersion: z.number().int().positive().nullable(),
    })
    .nullable(),
  paymentStatus: z.string().nullable(),
});
export type VerifyExitResponse = z.infer<typeof VerifyExitResponseSchema>;
