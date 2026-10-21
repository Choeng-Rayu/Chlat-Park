import { z } from "zod";
import {
  AmountMinorSchema,
  CurrencyCodeSchema,
  IsoDateTimeSchema,
  MetadataSchema,
  PaginationQuerySchema,
  UuidSchema,
} from "./common.js";

/**
 * Platform-administration and audit schemas.
 *
 * These power the super-admin console: the site/owner/user management views,
 * the platform-wide revenue and analytics views, and the audit log.
 */

/** The action recorded in an audit row. */
export const AuditActionSchema = z.enum([
  "auth.login",
  "auth.logout",
  "auth.refresh",
  "auth.password_changed",
  "session.created",
  "session.activated",
  "session.cancelled",
  "session.completed",
  "entry_claim.issued",
  "entry_claim.reissued",
  "entry_claim.claimed",
  "entry_claim.revoked",
  "ticket.issued",
  "ticket.revoked",
  "ticket.verified",
  "payment.recorded",
  "payment.exempted",
  "payment.voided",
  "review.opened",
  "review.resolved",
  "site.created",
  "site.updated",
  "site.deactivated",
  "owner.created",
  "owner.suspended",
  "user.suspended",
  "user.reinstated",
  "staff.invited",
  "staff.deactivated",
  "pricing.created",
  "pricing.activated",
  "permission.granted",
  "permission.revoked",
  "audit.exported",
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/** The outcome of an audited action. */
export const AuditOutcomeSchema = z.enum(["SUCCESS", "FAILURE", "DENIED"]);
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

/** An audit-log row. */
export const AuditLogSchema = z.object({
  id: UuidSchema,
  action: AuditActionSchema,
  outcome: AuditOutcomeSchema,
  actorUserId: UuidSchema.nullable(),
  actorRole: z.string().nullable(),
  siteId: UuidSchema.nullable(),
  /** The primary entity the action acted on, e.g. a session id. */
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  /** The site scope resolved at the moment of the action. */
  scope: MetadataSchema.optional(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/** The list query for the audit log. */
export const ListAuditLogQuerySchema = PaginationQuerySchema.extend({
  siteId: UuidSchema.optional(),
  actorUserId: UuidSchema.optional(),
  action: AuditActionSchema.optional(),
  outcome: AuditOutcomeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListAuditLogQuery = z.infer<typeof ListAuditLogQuerySchema>;

/** A parking owner. */
export const OwnerSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  siteCount: z.number().int().nonnegative(),
  suspended: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type Owner = z.infer<typeof OwnerSchema>;

/** The body of an owner-creation request. */
export const CreateOwnerRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(120),
});
export type CreateOwnerRequest = z.infer<typeof CreateOwnerRequestSchema>;

/** Platform-wide revenue aggregates. */
export const PlatformRevenueSchema = z.object({
  currency: CurrencyCodeSchema,
  collectedMinor: AmountMinorSchema,
  exemptMinor: AmountMinorSchema,
  voidedMinor: AmountMinorSchema,
  failedMinor: AmountMinorSchema,
  sessionCount: z.number().int().nonnegative(),
  paidSessionCount: z.number().int().nonnegative(),
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
});
export type PlatformRevenue = z.infer<typeof PlatformRevenueSchema>;

/** Platform-wide adoption and funnel analytics. */
export const PlatformAnalyticsSchema = z.object({
  sessionsCreated: z.number().int().nonnegative(),
  ticketsIssued: z.number().int().nonnegative(),
  claimsCompleted: z.number().int().nonnegative(),
  exitsCompleted: z.number().int().nonnegative(),
  uniquePlates: z.number().int().nonnegative(),
  claimRate: z.number().min(0).max(1),
  exitRate: z.number().min(0).max(1),
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
});
export type PlatformAnalytics = z.infer<typeof PlatformAnalyticsSchema>;

/** The query for a platform report. */
export const PlatformReportQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  siteId: UuidSchema.optional(),
});
export type PlatformReportQuery = z.infer<typeof PlatformReportQuerySchema>;

/** A site report — sessions, payments and totals for one site. */
export const SiteReportSchema = z.object({
  siteId: UuidSchema,
  currency: CurrencyCodeSchema,
  sessionCount: z.number().int().nonnegative(),
  completedSessionCount: z.number().int().nonnegative(),
  collectedMinor: AmountMinorSchema,
  exemptMinor: AmountMinorSchema,
  outstandingMinor: AmountMinorSchema,
  averageDurationMinutes: z.number().nonnegative(),
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
});
export type SiteReport = z.infer<typeof SiteReportSchema>;
