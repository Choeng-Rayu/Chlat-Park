import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

import { ValidationException } from "../errors/api-exception.js";

/**
 * A validation pipe backed by a Zod schema.
 *
 * The schemas come from `@chlat/contracts`, so the API validates exactly
 * what the OpenAPI document publishes. Unknown keys are rejected, matching
 * `forbidNonWhitelisted: true` in the global pipe configuration — a request
 * that carries a field the contract does not define is a 400, not a silently
 * ignored field.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      throw new ValidationException(
        result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          code: issue.code,
          message: issue.message,
        })),
      );
    }

    return result.data;
  }
}
