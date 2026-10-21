import { z } from "zod";
import {
  AmountMinorSchema,
  CurrencyCodeSchema,
  EmailSchema,
  IsoDateTimeSchema,
  MetadataSchema,
  PaginationQuerySchema,
  PhoneSchema,
  PlateIdSchema,
  SlugSchema,
  TimeZoneSchema,
  UuidSchema,
} from "./common.js";

/**
 * Parking sites, parking sessions and plates.
 *
 * The state machines encoded here are the *shape* of the domain, not its
 * rules: the transition table itself lives in the API (see
 * `specs/features/parking-session/design.md` §3.2), because a rule is
 * business logic and this package holds schemas only.
 */

// ---------------------------------------------------------------------------
// Site
// ---------------------------------------------------------------------------

/** The lifecycle status of a parking site. */
export const SiteStatusSchema = z.enum(["ACTIVE", "INACTIVE", "DEACTIVATED"]);
export type SiteStatus = z.infer<typeof SiteStatusSchema>;

/** The status of a parking site within the platform. */
export const ParkingSiteSchema = z.object({
  id: UuidSchema,
  ownerId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  code: SlugSchema,
  address: z.string().trim().min(1).max(240),
  timeZone: TimeZoneSchema,
  currency: CurrencyCodeSchema,
  status: SiteStatusSchema,
  entryClaimTtlSeconds: z.number().int().positive(),
  graceMinutes: z.number().int().nonnegative(),
  metadata: MetadataSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ParkingSite = z.infer<typeof ParkingSiteSchema>;

/** The body of a site-creation request. */
export const CreateSiteRequestSchema = z.object({
  ownerId: UuidSchema,
  name: z.string().trim().min(1).max(120),
  code: SlugSchema,
  address: z.string().trim().min(1).max(240),
  timeZone: TimeZoneSchema,
  currency: CurrencyCodeSchema,
  entryClaimTtlSeconds: z.number().int().positive().max(86_400).default(900),
  graceMinutes: z.number().int().nonnegative().max(240).default(0),
});
export type CreateSiteRequest = z.infer<typeof CreateSiteRequestSchema>;

/** The body of a site-update request. Every field is optional. */
export const UpdateSiteRequestSchema = CreateSiteRequestSchema.partial().omit({ ownerId: true });
export type UpdateSiteRequest = z.infer<typeof UpdateSiteRequestSchema>;

/** The list query for the site collection. */
export const ListSitesQuerySchema = PaginationQuerySchema.extend({
  status: SiteStatusSchema.optional(),
  ownerId: UuidSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
});
export type ListSitesQuery = z.infer<typeof ListSitesQuerySchema>;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * The parking-session state machine.
 *
 * ```
 * PENDING_CLAIM → ACTIVE | CANCELLED | MANUAL_REVIEW
 * ACTIVE        → EXIT_PENDING | MANUAL_REVIEW
 * EXIT_PENDING  → COMPLETED | ACTIVE | MANUAL_REVIEW
 * MANUAL_REVIEW → ACTIVE | EXIT_PENDING | COMPLETED
 * COMPLETED     → (terminal)
 * CANCELLED     → (terminal)
 * ```
 */
export const SessionStatusSchema = z.enum([
  "PENDING_CLAIM",
  "ACTIVE",
  "EXIT_PENDING",
  "COMPLETED",
  "CANCELLED",
  "MANUAL_REVIEW",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/** The status of a manual-review case attached to a session. */
export const ReviewStatusSchema = z.enum(["OPEN", "RESOLVED"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

/** The role a guard holds on a site assignment. */
export const SiteRoleSchema = z.enum(["guard", "manager"]);
export type SiteRole = z.infer<typeof SiteRoleSchema>;

/** A parking session. */
export const ParkingSessionSchema = z.object({
  id: UuidSchema,
  siteId: UuidSchema,
  plateIdOriginal: PlateIdSchema,
  plateIdNormalized: PlateIdSchema,
  status: SessionStatusSchema,
  entryAt: IsoDateTimeSchema.nullable(),
  exitAt: IsoDateTimeSchema.nullable(),
  completedByUserId: UuidSchema.nullable(),
  pricingPolicyId: UuidSchema.nullable(),
  pricingPolicyVersion: z.number().int().positive().nullable(),
  feeAmountMinor: AmountMinorSchema.nullable(),
  feeCurrency: CurrencyCodeSchema.nullable(),
  metadata: MetadataSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ParkingSession = z.infer<typeof ParkingSessionSchema>;

/** The body of a session-creation request (the guard's "entry" action). */
export const CreateSessionRequestSchema = z.object({
  siteId: UuidSchema,
  plateId: PlateIdSchema,
  /** Optional note recorded alongside the session. */
  note: z.string().trim().max(500).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

/** The list query for the session collection. */
export const ListSessionsQuerySchema = PaginationQuerySchema.extend({
  siteId: UuidSchema.optional(),
  status: SessionStatusSchema.optional(),
  plateId: PlateIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

/** The body of a manual-activation request. */
export const ActivateSessionRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type ActivateSessionRequest = z.infer<typeof ActivateSessionRequestSchema>;

/** The body of a cancel request. */
export const CancelSessionRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type CancelSessionRequest = z.infer<typeof CancelSessionRequestSchema>;

/** The body of an exit-completion request. */
export const CompleteExitRequestSchema = z.object({
  /**
   * The plate the guard physically confirmed. When present it must match the
   * session's plate; a mismatch is a refusal, not an error.
   */
  plateId: PlateIdSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CompleteExitRequest = z.infer<typeof CompleteExitRequestSchema>;

// ---------------------------------------------------------------------------
// Manual review
// ---------------------------------------------------------------------------

/** A manual-review case. */
export const ManualReviewSchema = z.object({
  id: UuidSchema,
  sessionId: UuidSchema,
  siteId: UuidSchema,
  status: ReviewStatusSchema,
  reason: z.string().trim().min(1).max(500),
  resolution: z.string().trim().min(1).max(500).nullable(),
  openedByUserId: UuidSchema,
  resolvedByUserId: UuidSchema.nullable(),
  resolvedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ManualReview = z.infer<typeof ManualReviewSchema>;

/** The body of an open-review request. */
export const OpenReviewRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type OpenReviewRequest = z.infer<typeof OpenReviewRequestSchema>;

/** The body of a resolve-review request. */
export const ResolveReviewRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  /** The session state the review resolves to. */
  resolution: SessionStatusSchema.exclude(["PENDING_CLAIM", "CANCELLED", "MANUAL_REVIEW"]),
});
export type ResolveReviewRequest = z.infer<typeof ResolveReviewRequestSchema>;

// ---------------------------------------------------------------------------
// Staff / owners
// ---------------------------------------------------------------------------

/** A staff member assigned to a site. */
export const SiteStaffSchema = z.object({
  userId: UuidSchema,
  email: EmailSchema,
  displayName: z.string().trim().min(1).max(120),
  siteId: UuidSchema,
  siteRole: SiteRoleSchema,
  active: z.boolean(),
});
export type SiteStaff = z.infer<typeof SiteStaffSchema>;

/** The body of a staff-invitation request. */
export const InviteStaffRequestSchema = z.object({
  email: EmailSchema,
  displayName: z.string().trim().min(1).max(120),
  siteRole: SiteRoleSchema.default("guard"),
  phone: PhoneSchema.optional(),
});
export type InviteStaffRequest = z.infer<typeof InviteStaffRequestSchema>;
