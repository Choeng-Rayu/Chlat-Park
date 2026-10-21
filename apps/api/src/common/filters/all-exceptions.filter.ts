import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { ApiException } from "../errors/api-exception.js";
import { type ErrorCode, ERROR_MESSAGE, ERROR_STATUS } from "../errors/error-codes.js";
import type { ApiEnvelope } from "../interceptors/transform.interceptor.js";

/** The error payload carried inside the envelope. */
export interface ApiErrorDetail {
  /** The stable, machine-readable code. */
  code: ErrorCode;
  /** The human-readable message. */
  message: string;
  /** Optional structured detail, e.g. the validation issues. */
  details?: unknown;
  /** The correlation id of the request. */
  requestId: string;
}

/**
 * The global exception filter.
 *
 * It maps every thrown value onto the same error envelope, so a client never
 * sees a raw stack trace, a Prisma message, or a NestJS default body. An
 * unmapped exception becomes a generic `INTERNAL_ERROR` — the original error
 * is logged, never returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { requestId?: string }>();

    const requestId = request.requestId ?? "unknown";
    const { status, detail } = this.describe(exception, requestId);

    const body: ApiEnvelope<never> = {
      success: false,
      data: null,
      message: detail.message,
      error: detail,
    };

    if (!response.headersSent) {
      response.status(status).json(body);
    }
  }

  /**
   * Turn an exception into a status and an error detail.
   *
   * @internal
   */
  private describe(
    exception: unknown,
    requestId: string,
  ): { status: number; detail: ApiErrorDetail } {
    if (exception instanceof ApiException) {
      return {
        status: exception.getStatus(),
        detail: {
          code: exception.code,
          message: exception.message,
          ...(exception.details !== undefined ? { details: exception.details } : {}),
          requestId,
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      // NestJS's built-in exceptions carry a string or `{ message, statusCode }`.
      const message =
        typeof payload === "string"
          ? payload
          : typeof (payload as { message?: unknown })?.message === "string"
            ? ((payload as { message: string }).message satisfies string)
            : exception.message;

      const code = this.codeForStatus(status);

      return {
        status,
        detail: {
          code,
          message: message || ERROR_MESSAGE[code],
          requestId,
        },
      };
    }

    // An unmapped exception is a bug. Log it, but never leak it.
    console.error("[api] Unhandled exception:", exception);

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: {
        code: "INTERNAL_ERROR",
        message: ERROR_MESSAGE.INTERNAL_ERROR,
        requestId,
      },
    };
  }

  /**
   * The default code for an HTTP status.
   *
   * @internal
   */
  private codeForStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "VALIDATION_FAILED";
      case HttpStatus.UNAUTHORIZED:
        return "AUTH_UNAUTHENTICATED";
      case HttpStatus.FORBIDDEN:
        return "AUTHZ_PERMISSION_DENIED";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return "SEC_REQUEST_TOO_LARGE";
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return "SEC_UNSUPPORTED_MEDIA_TYPE";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "RATE_LIMITED";
      case HttpStatus.SERVICE_UNAVAILABLE:
        return "SERVICE_UNAVAILABLE";
      default:
        return status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_FAILED";
    }
  }
}

/** Exported for the status map, so a consumer can assert the pairing. */
export { ERROR_STATUS };
