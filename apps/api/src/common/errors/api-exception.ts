import { HttpException } from "@nestjs/common";

import { type ErrorCode, ERROR_MESSAGE, ERROR_STATUS } from "./error-codes.js";

/**
 * The API's domain exception.
 *
 * Every deliberate failure — a validation failure, a denied permission, a
 * missing session — is raised as an `ApiException` carrying a stable error
 * code. The global filter turns it into the error envelope; the code never
 * reaches the client as free text.
 */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_MESSAGE[code], ERROR_STATUS[code], { errorCode: code });
    this.name = "ApiException";
  }

  /** The machine-readable code. */
  get apiErrorCode(): ErrorCode {
    return this.code;
  }
}

/** Shorthand for a 400 `VALIDATION_FAILED`. */
export class ValidationException extends ApiException {
  constructor(details: unknown, message?: string) {
    super("VALIDATION_FAILED", message, details);
    this.name = "ValidationException";
  }
}

/** Shorthand for a 404 `NOT_FOUND`. */
export class NotFoundException extends ApiException {
  constructor(code: ErrorCode = "NOT_FOUND", message?: string) {
    super(code, message);
    this.name = "NotFoundException";
  }
}

/** Shorthand for a 403 `AUTHZ_PERMISSION_DENIED`. */
export class PermissionDeniedException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super("AUTHZ_PERMISSION_DENIED", message, details);
    this.name = "PermissionDeniedException";
  }
}
