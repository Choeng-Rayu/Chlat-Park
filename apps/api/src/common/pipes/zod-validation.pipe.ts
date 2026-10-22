import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common";
import { z, type ZodType } from "zod";

import { ValidationException } from "../errors/api-exception.js";

/**
 * A validation pipe backed by a Zod schema.
 *
 * The schemas come from `@chlat/contracts`, so the API validates exactly
 * what the OpenAPI document publishes.
 *
 * The pipe is strict by construction. SEC-003 requires every request body to
 * be validated against a schema that *rejects* unknown properties, before
 * the controller is invoked. The contract schemas are plain `z.object`s, and
 * a plain `z.object` silently *strips* an unknown key instead of rejecting
 * it: a request carrying `role: "super_admin"` would pass validation and
 * the field would simply vanish before the controller saw it. So the pipe
 * enforces the strictness centrally, rather than trusting each contract
 * schema to remember it.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  /** The schema, in the form the pipe validates with. */
  private readonly strictSchema: ZodType<T>;

  constructor(schema: ZodType<T>) {
    this.strictSchema = toStrictSchema(schema);
  }

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.strictSchema.safeParse(value);

    if (!result.success) {
      throw new ValidationException(result.error.issues.map(toValidationIssue));
    }

    // `.strict()` applies to the object it is called on, so a nested object
    // still strips an unknown key. The schemas nest — a pricing policy
    // carries a discriminated union of configuration objects — so the pipe
    // looks for the stripped keys itself.
    const unknownKeys = findUnknownKeys(value, result.data);

    if (unknownKeys.length > 0) {
      throw new ValidationException(unknownKeys.map(toUnknownKeyIssue));
    }

    return result.data;
  }
}

/**
 * The strict variant of a schema.
 *
 * An object schema becomes strict: an unknown key is an error rather than a
 * silently dropped field. A schema that is not an object — a bare string, an
 * array, a union — has no unknown-key concept and is left exactly as it is.
 */
function toStrictSchema<T>(schema: ZodType<T>): ZodType<T> {
  if (!(schema instanceof z.ZodObject)) {
    return schema;
  }

  // `.strict()` only changes how unknown keys are treated; the schema still
  // validates the same payload and produces the same output.
  return schema.strict() as ZodType<T>;
}

/** A key the contract does not define, and where it was found. */
type UnknownKey = { path: (string | number)[]; key: string };

/**
 * The keys the request carries that the contract does not define, at any depth.
 *
 * Zod strips an unknown key rather than reporting it, so the request and the
 * parsed result are compared side by side: a key the request carries but the
 * result does not is a key the schema dropped, which means the contract does
 * not define it.
 */
function findUnknownKeys(
  request: unknown,
  parsed: unknown,
  path: (string | number)[] = [],
): UnknownKey[] {
  if (Array.isArray(request) && Array.isArray(parsed)) {
    return request.flatMap((item, index) => findUnknownKeys(item, parsed[index], [...path, index]));
  }

  if (!isPlainObject(request) || !isPlainObject(parsed)) {
    return [];
  }

  return Object.entries(request).flatMap(([key, value]) => {
    if (!Object.hasOwn(parsed, key)) {
      return [{ path: [...path, key], key }];
    }

    return findUnknownKeys(value, parsed[key], [...path, key]);
  });
}

/** Whether a value is a plain object — not an array, a class instance or `null`. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** A Zod issue, in the shape the API reports it. */
function toValidationIssue(issue: { path: PropertyKey[]; code: string; message: string }) {
  return {
    path: issue.path.join(".") || "(root)",
    code: issue.code,
    message: issue.message,
  };
}

/** An unknown key, in the shape the API reports a Zod issue. */
function toUnknownKeyIssue(unknownKey: UnknownKey) {
  return {
    path: unknownKey.path.join(".") || "(root)",
    code: "unrecognized_keys",
    message: `Unrecognized key: ${JSON.stringify(unknownKey.key)}`,
  };
}
