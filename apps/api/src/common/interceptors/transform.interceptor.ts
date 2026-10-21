import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { type Observable, map } from "rxjs";

/**
 * The response envelope.
 *
 * Every successful response has the same shape:
 *
 * ```json
 * { "success": true, "data": { … }, "message": null, "error": null }
 * ```
 *
 * and every failure has:
 *
 * ```json
 * { "success": false, "data": null, "message": "…", "error": { "code": "…", "…": "…" } }
 * ```
 *
 * A client therefore never has to guess whether it is looking at a payload or
 * an error: `success` answers that, and `error.code` says what happened.
 */
export interface ApiEnvelope<T> {
  /** Whether the call succeeded. */
  success: boolean;
  /** The payload on success, `null` on failure. */
  data: T | null;
  /** A human-readable note, `null` when there is nothing to add. */
  message: string | null;
  /** The error detail, `null` on success. */
  error: unknown | null;
}

/**
 * Wraps every controller return value in the envelope.
 *
 * The interceptor is deliberately dumb: it does not know about errors, only
 * about successful responses. Failures are the exception filter's job, so
 * there is exactly one place where the error shape is decided.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: data ?? null,
        message: null,
        error: null,
      })),
    );
  }
}
