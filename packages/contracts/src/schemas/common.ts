import { z } from "zod";

/**
 * Shared primitives: identifiers, pagination, money, and the error envelope.
 *
 * These are the shapes every other schema builds on, so a change here is a
 * change to the whole API contract.
 */

/** A UUID v4 string. */
export const UuidSchema = z.string().uuid();

/**
 * An ISO-8601 timestamp in UTC.
 *
 * The API always emits `...Z` and always parses into a `Date`.
 *
 * The `.meta()` block is what makes this work: `zod-openapi` serialises the
 * *output* side of a schema into the OpenAPI document and rejects a bare
 * transform there. Declaring the wire format manually — as the error message
 * itself suggests — keeps the generated document and the runtime behaviour in
 * agreement: the document says `date-time` string, the parser yields a
 * `Date`.
 */
export const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .meta({ type: "string", format: "date-time" });

/** A date without a time component, `YYYY-MM-DD`. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/**
 * An amount of money in the minor unit (cents, sen, etc.).
 *
 * Money is never stored as a float — see `specs/features/pricing-and-payment/`.
 */
export const AmountMinorSchema = z.number().int().nonnegative();

/**
 * An ISO-4217 currency code, upper case.
 *
 * The code comes from the site or the pricing policy; a client may never
 * supply it.
 */
export const CurrencyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Expected a 3-letter ISO-4217 currency code");

/**
 * A time-zone identifier, e.g. `Asia/Jakarta`.
 *
 * Validated against the IANA database at runtime by the API, not here, to
 * keep this package dependency-free.
 */
export const TimeZoneSchema = z.string().trim().min(1).max(64);

/**
 * A motorcycle plate, as typed by a guard.
 *
 * The raw value is kept for the audit trail and a normalised form is derived
 * from it (see ADR-007). The plate is never returned in a log line — only
 * its digest is.
 */
export const PlateIdSchema = z
  .string()
  .trim()
  .min(2, "A plate is at least 2 characters")
  .max(16, "A plate is at most 16 characters");

/** A slug-safe identifier, e.g. a site code. */
export const SlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a lowercase kebab-case slug");

/** An email address. */
export const EmailSchema = z.string().trim().toLowerCase().email().max(320);

/** An E.164 phone number, optional. */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "Expected an E.164 phone number");

/**
 * Cursor pagination.
 *
 * The API uses opaque cursors rather than offsets: the session list is sorted
 * by `(created_at DESC, id DESC)` and an offset would skip or repeat rows when
 * a session is created mid-scroll.
 */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * The page envelope returned by every list endpoint.
 */
export const PaginatedResponseSchema = z.object({
  data: z.array(z.unknown()),
  page: z.object({
    nextCursor: z.string().nullable().default(null),
    hasMore: z.boolean().default(false),
  }),
});

export type PaginatedResponse<T> = {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
};

/**
 * A single validation failure inside the `details` array of the error
 * envelope.
 */
export const ValidationIssueSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

/**
 * The stable, machine-readable error codes.
 *
 * These are part of the public contract: the web app branches on them, so a
 * code is never renamed — a new code is added instead.
 */
export const ERROR_CODES = [
  // --- generic -----------------------------------------------------------
  "VALIDATION_FAILED",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
  "RATE_LIMITED",

  // --- auth --------------------------------------------------------------
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_ACCOUNT_SUSPENDED",
  "AUTH_TOKEN_EXPIRED",
  "AUTH_TOKEN_INVALID",
  "AUTH_REFRESH_REPLAYED",
  "AUTH_REAUTH_REQUIRED",
  "AUTH_CSRF_INVALID",
  "AUTH_UNAUTHENTICATED",

  // --- authorization -----------------------------------------------------
  "AUTHZ_PERMISSION_DENIED",
  "AUTHZ_SCOPE_DENIED",

  // --- parking session ---------------------------------------------------
  "PARK_SESSION_NOT_FOUND",
  "PARK_INVALID_TRANSITION",
  "PARK_DUPLICATE_ACTIVE_SESSION",
  "PARK_PLATE_INVALID",

  // --- entry claim -------------------------------------------------------
  "CLAIM_NOT_FOUND",
  "CLAIM_ALREADY_CLAIMED",
  "CLAIM_EXPIRED",
  "CLAIM_CLAIM_REVOKED",

  // --- ticket ------------------------------------------------------------
  "TICKET_NOT_FOUND",
  "TICKET_REVOKED",
  "TICKET_EXPIRED",

  // --- exit --------------------------------------------------------------
  "EXIT_NOT_ACTIVE",
  "EXIT_ALREADY_COMPLETED",
  "EXIT_PAYMENT_PENDING",
  "EXIT_MANUAL_REVIEW_REQUIRED",
  "EXIT_PLATE_MISMATCH",

  // --- payment -----------------------------------------------------------
  "PAYMENT_NOT_FOUND",
  "PAYMENT_INVALID_AMOUNT",
  "PAYMENT_ALREADY_SETTLED",

  // --- manual review -----------------------------------------------------
  "REVIEW_NOT_FOUND",
  "REVIEW_ALREADY_RESOLVED",
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * The error envelope.
 *
 * Every non-2xx response from the API has exactly this shape. There are no
 * stack traces, no SQL fragments, and no raw exception messages.
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * A correlation id, e.g. a ULID. Echoed in the `X-Request-Id` header and in
 * the error envelope.
 */
export const RequestIdSchema = z.string().min(8).max(64);

/** A generic key/value map for free-form response details. */
export const MetadataSchema = z.record(z.string(), z.unknown());
