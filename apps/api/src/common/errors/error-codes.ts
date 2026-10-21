/**
 * The API's error-code registry.
 *
 * Every non-2xx response carries exactly one of these codes. The codes are
 * part of the public contract: the web app branches on them, so a code is
 * never renamed — a new code is added instead.
 *
 * The canonical list lives in `@chlat/contracts` (`ERROR_CODES`). This module
 * re-exports it as a *typed registry* so the API can reference a code without
 * a string literal, and adds the API-internal codes the HTTP layer needs.
 */

import { ERROR_CODES } from "@chlat/contracts";

/**
 * The error codes the API itself produces.
 *
 * These are a superset of the contract's codes: the contract lists the codes
 * a **client** may see, this registry adds the ones the transport layer
 * produces (an unmapped exception, a rate limit, a missing route).
 */
export const ErrorCode = {
  // --- generic ------------------------------------------------------------
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // --- authentication -----------------------------------------------------
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  AUTH_ACCOUNT_SUSPENDED: "AUTH_ACCOUNT_SUSPENDED",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID",
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  AUTH_TOKEN_STALE: "AUTH_TOKEN_STALE",
  AUTH_REFRESH_REPLAYED: "AUTH_REFRESH_REPLAYED",
  AUTH_REAUTH_REQUIRED: "AUTH_REAUTH_REQUIRED",
  AUTH_CSRF_INVALID: "AUTH_CSRF_INVALID",
  AUTH_UNAUTHENTICATED: "AUTH_UNAUTHENTICATED",

  // --- authorization ------------------------------------------------------
  AUTHZ_PERMISSION_DENIED: "AUTHZ_PERMISSION_DENIED",
  AUTHZ_SCOPE_DENIED: "AUTHZ_SCOPE_DENIED",

  // --- parking sites -----------------------------------------------------
  PARK_SITE_NOT_FOUND: "PARK_SITE_NOT_FOUND",
  PARK_INVALID_TRANSITION: "PARK_INVALID_TRANSITION",
  PARK_DUPLICATE_ACTIVE_SESSION: "PARK_DUPLICATE_ACTIVE_SESSION",
  PARK_PLATE_INVALID: "PARK_PLATE_INVALID",

  // --- parking session ----------------------------------------------------
  PARK_SESSION_NOT_FOUND: "PARK_SESSION_NOT_FOUND",

  // --- entry claim --------------------------------------------------------
  CLAIM_NOT_FOUND: "CLAIM_NOT_FOUND",
  CLAIM_ALREADY_CLAIMED: "CLAIM_ALREADY_CLAIMED",
  CLAIM_EXPIRED: "CLAIM_EXPIRED",
  CLAIM_CLAIM_REVOKED: "CLAIM_CLAIM_REVOKED",

  // --- ticket -------------------------------------------------------------
  TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
  TICKET_REVOKED: "TICKET_REVOKED",
  TICKET_EXPIRED: "TICKET_EXPIRED",

  // --- exit ---------------------------------------------------------------
  EXIT_NOT_ACTIVE: "EXIT_NOT_ACTIVE",
  EXIT_ALREADY_COMPLETED: "EXIT_ALREADY_COMPLETED",
  EXIT_PAYMENT_PENDING: "EXIT_PAYMENT_PENDING",
  EXIT_MANUAL_REVIEW_REQUIRED: "EXIT_MANUAL_REVIEW_REQUIRED",
  EXIT_PLATE_MISMATCH: "EXIT_PLATE_MISMATCH",

  // --- payment ------------------------------------------------------------
  PAYMENT_NOT_FOUND: "PAYMENT_NOT_FOUND",
  PAYMENT_INVALID_AMOUNT: "PAYMENT_INVALID_AMOUNT",
  PAYMENT_ALREADY_SETTLED: "PAYMENT_ALREADY_SETTLED",
  PAYMENT_EXEMPT_REASON_REQUIRED: "PAYMENT_EXEMPT_REASON_REQUIRED",

  // --- manual review ------------------------------------------------------
  REVIEW_NOT_FOUND: "REVIEW_NOT_FOUND",
  REVIEW_ALREADY_RESOLVED: "REVIEW_ALREADY_RESOLVED",

  // --- security -----------------------------------------------------------
  SEC_CSRF_INVALID: "SEC_CSRF_INVALID",
  SEC_RATE_LIMITED: "SEC_RATE_LIMITED",
  SEC_REQUEST_TOO_LARGE: "SEC_REQUEST_TOO_LARGE",
  SEC_UNSUPPORTED_MEDIA_TYPE: "SEC_UNSUPPORTED_MEDIA_TYPE",
} as const;

/** A literal union of every error code the API can emit. */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The HTTP status that accompanies each error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,

  AUTH_INVALID_CREDENTIALS: 401,
  AUTH_ACCOUNT_SUSPENDED: 403,
  AUTH_TOKEN_EXPIRED: 401,
  AUTH_TOKEN_INVALID: 401,
  AUTH_TOKEN_MISSING: 401,
  AUTH_TOKEN_STALE: 401,
  AUTH_REFRESH_REPLAYED: 401,
  AUTH_REAUTH_REQUIRED: 403,
  AUTH_CSRF_INVALID: 403,
  AUTH_UNAUTHENTICATED: 401,

  AUTHZ_PERMISSION_DENIED: 403,
  AUTHZ_SCOPE_DENIED: 403,

  PARK_SITE_NOT_FOUND: 404,
  PARK_INVALID_TRANSITION: 409,
  PARK_DUPLICATE_ACTIVE_SESSION: 409,
  PARK_PLATE_INVALID: 400,

  PARK_SESSION_NOT_FOUND: 404,

  CLAIM_NOT_FOUND: 404,
  CLAIM_ALREADY_CLAIMED: 409,
  CLAIM_EXPIRED: 410,
  CLAIM_CLAIM_REVOKED: 409,

  TICKET_NOT_FOUND: 404,
  TICKET_REVOKED: 409,
  TICKET_EXPIRED: 410,

  EXIT_NOT_ACTIVE: 409,
  EXIT_ALREADY_COMPLETED: 409,
  EXIT_PAYMENT_PENDING: 409,
  EXIT_MANUAL_REVIEW_REQUIRED: 409,
  EXIT_PLATE_MISMATCH: 409,

  PAYMENT_NOT_FOUND: 404,
  PAYMENT_INVALID_AMOUNT: 400,
  PAYMENT_ALREADY_SETTLED: 409,
  PAYMENT_EXEMPT_REASON_REQUIRED: 400,

  REVIEW_NOT_FOUND: 404,
  REVIEW_ALREADY_RESOLVED: 409,

  SEC_CSRF_INVALID: 403,
  SEC_RATE_LIMITED: 429,
  SEC_REQUEST_TOO_LARGE: 413,
  SEC_UNSUPPORTED_MEDIA_TYPE: 415,
};

/** The default human-readable message for each error code. */
export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "The request payload is invalid.",
  NOT_FOUND: "The requested resource does not exist.",
  CONFLICT: "The request conflicts with the current state.",
  INTERNAL_ERROR: "An unexpected error occurred.",
  RATE_LIMITED: "Too many requests.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",

  AUTH_INVALID_CREDENTIALS: "Invalid email or password.",
  AUTH_ACCOUNT_SUSPENDED: "This account is suspended.",
  AUTH_TOKEN_EXPIRED: "The access token has expired.",
  AUTH_TOKEN_INVALID: "The access token is invalid.",
  AUTH_TOKEN_MISSING: "An access token is required.",
  AUTH_TOKEN_STALE: "The session is stale.",
  AUTH_REFRESH_REPLAYED: "The refresh token was already used.",
  AUTH_REAUTH_REQUIRED: "Re-authentication is required for this action.",
  AUTH_CSRF_INVALID: "The CSRF token is missing or invalid.",
  AUTH_UNAUTHENTICATED: "Authentication is required.",

  AUTHZ_PERMISSION_DENIED: "You do not have the required permission.",
  AUTHZ_SCOPE_DENIED: "The target is outside your scope.",

  PARK_SITE_NOT_FOUND: "The parking site does not exist.",
  PARK_INVALID_TRANSITION: "The state transition is not allowed.",
  PARK_DUPLICATE_ACTIVE_SESSION: "The vehicle already has an active session.",
  PARK_PLATE_INVALID: "The plate is not valid.",

  PARK_SESSION_NOT_FOUND: "The parking session does not exist.",

  CLAIM_NOT_FOUND: "The claim token is not valid.",
  CLAIM_ALREADY_CLAIMED: "The entry QR has already been claimed.",
  CLAIM_EXPIRED: "The entry QR has expired.",
  CLAIM_CLAIM_REVOKED: "The entry QR has been revoked.",

  TICKET_NOT_FOUND: "The ticket does not exist.",
  TICKET_REVOKED: "The ticket has been revoked.",
  TICKET_EXPIRED: "The ticket has expired.",

  EXIT_NOT_ACTIVE: "The session is not active.",
  EXIT_ALREADY_COMPLETED: "The session has already been completed.",
  EXIT_PAYMENT_PENDING: "The payment is still pending.",
  EXIT_MANUAL_REVIEW_REQUIRED: "The session needs a manual review.",
  EXIT_PLATE_MISMATCH: "The plate does not match the session.",

  PAYMENT_NOT_FOUND: "The payment does not exist.",
  PAYMENT_INVALID_AMOUNT: "The amount is not valid.",
  PAYMENT_ALREADY_SETTLED: "The payment is already settled.",
  PAYMENT_EXEMPT_REASON_REQUIRED: "An exemption requires a reason.",

  REVIEW_NOT_FOUND: "The review case does not exist.",
  REVIEW_ALREADY_RESOLVED: "The review case is already resolved.",

  SEC_CSRF_INVALID: "The CSRF token is missing or invalid.",
  SEC_RATE_LIMITED: "Too many requests.",
  SEC_REQUEST_TOO_LARGE: "The request body is too large.",
  SEC_UNSUPPORTED_MEDIA_TYPE: "The content type is not supported.",
};

/** The contract's own code list, re-exported so the two cannot drift silently. */
export const CONTRACT_ERROR_CODES = ERROR_CODES;

/**
 * A type guard: is the given string a known error code?
 *
 * @internal
 */
export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_STATUS, value);
}
