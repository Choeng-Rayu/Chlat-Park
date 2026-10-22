import {
  CreatePricingPolicyRequestSchema,
  LoginRequestSchema,
  PaginationQuerySchema,
} from "@chlat/contracts";
import { type ArgumentMetadata } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ValidationException } from "../errors/api-exception.js";
import { ZodValidationPipe } from "./zod-validation.pipe.js";

/**
 * The Zod validation pipe.
 *
 * The pipe is the API's request-validation boundary: it hands the payload to
 * the contract's schema and either returns the parsed value or throws a
 * `VALIDATION_FAILED` exception carrying the failing paths.
 *
 * The schemas used here are the real ones from `@chlat/contracts` — the same
 * schemas the OpenAPI document is generated from — so the test proves the
 * pipe works against the contract rather than against a stand-in.
 */

/** The metadata of a `@Body()` argument. The pipe never reads it. */
const bodyMetadata: ArgumentMetadata = { type: "body", metatype: undefined, data: undefined };

/** A valid login body. */
const validLogin = {
  email: "guard@example.com",
  password: "correct-horse-battery",
};

/** A valid pricing-policy body. Its `config` is a nested object. */
const validPricingPolicy = {
  ruleType: "FLAT",
  config: { ruleType: "FLAT", amountMinor: 500, currency: "USD" },
  effectiveFrom: "2026-01-01T00:00:00.000Z",
};

describe("the Zod validation pipe", () => {
  it("returns a payload that satisfies the schema", () => {
    const pipe = new ZodValidationPipe(LoginRequestSchema);

    const result = pipe.transform(validLogin, bodyMetadata);

    expect(result).toEqual(validLogin);
  });

  it("returns the value the schema transformed", () => {
    const pipe = new ZodValidationPipe(LoginRequestSchema);

    // The contract's `EmailSchema` trims and lower-cases, so what comes
    // back is the schema's output, not the request's input.
    const result = pipe.transform({ ...validLogin, email: "  Guard@Example.COM " }, bodyMetadata);

    expect(result.email).toBe("guard@example.com");
  });

  it("applies the schema's coercion and its defaults", () => {
    const pipe = new ZodValidationPipe(PaginationQuerySchema);

    const result = pipe.transform({ limit: "50" }, bodyMetadata);

    expect(result.limit).toBe(50);
    expect(result.cursor).toBeUndefined();
  });

  it("rejects a payload that violates the schema", () => {
    const pipe = new ZodValidationPipe(LoginRequestSchema);

    expect(() =>
      pipe.transform({ email: "not-an-email", password: "short" }, bodyMetadata),
    ).toThrow(ValidationException);
  });

  it("reports the path of the failing field", () => {
    const pipe = new ZodValidationPipe(LoginRequestSchema);

    try {
      pipe.transform({ ...validLogin, email: "not-an-email" }, bodyMetadata);
      expect.unreachable("The payload must be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);

      const failure = error as ValidationException;
      const issues = failure.details as { path: string; code: string; message: string }[];

      expect(issues.map((issue) => issue.path)).toContain("email");
      expect(failure.apiErrorCode).toBe("VALIDATION_FAILED");
      expect(failure.getStatus()).toBe(400);
    }
  });

  it("rejects an unknown key on a contract schema", () => {
    const pipe = new ZodValidationPipe(LoginRequestSchema);

    // SEC-003: a request that carries a field the contract does not define
    // is a 400, not a silently ignored field. The contract schemas are plain
    // `z.object`s, and a plain `z.object` *strips* an unknown key instead of
    // rejecting it — so the pipe is the one that makes the schema strict.
    try {
      pipe.transform({ ...validLogin, role: "super_admin" }, bodyMetadata);
      expect.unreachable("The unknown key must be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);

      const failure = error as ValidationException;
      const issues = failure.details as { path: string; code: string; message: string }[];

      // The offending key is named, so the caller can see which field the
      // contract does not define.
      expect(issues.map((issue) => issue.message).join(" ")).toContain("role");
      expect(issues.map((issue) => issue.code)).toContain("unrecognized_keys");
      expect(failure.apiErrorCode).toBe("VALIDATION_FAILED");
      expect(failure.getStatus()).toBe(400);
    }
  });

  it("rejects an unknown key nested inside the payload", () => {
    const pipe = new ZodValidationPipe(CreatePricingPolicyRequestSchema);

    // The strictness is not limited to the top level: the pricing policy
    // carries a nested configuration object, and an unknown key inside it is
    // rejected as well.
    try {
      pipe.transform(
        {
          ...validPricingPolicy,
          config: { ...validPricingPolicy.config, amountMinorOverride: 1 },
        },
        bodyMetadata,
      );
      expect.unreachable("The nested unknown key must be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);

      const failure = error as ValidationException;
      const issues = failure.details as { path: string; code: string; message: string }[];

      expect(issues.map((issue) => issue.message).join(" ")).toContain("amountMinorOverride");
      expect(issues.map((issue) => issue.path)).toContain("config.amountMinorOverride");
    }
  });

  it("rejects an unknown key when the schema is strict", () => {
    const pipe = new ZodValidationPipe(z.object({ email: z.string() }).strict());

    try {
      pipe.transform({ email: "guard@example.com", role: "super_admin" }, bodyMetadata);
      expect.unreachable("The unknown key must be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);

      const failure = error as ValidationException;
      const issues = failure.details as { path: string; code: string; message: string }[];

      // The unknown key is named in the failure, so the caller can see
      // which field the contract does not define.
      expect(issues.map((issue) => issue.message).join(" ")).toContain("role");
    }
  });

  it("validates a schema that is not an object", () => {
    const pipe = new ZodValidationPipe(z.string());

    // A schema that is not an object has no unknown-key concept, so the pipe
    // leaves it alone — but it still validates it.
    expect(pipe.transform("guard@example.com", bodyMetadata)).toBe("guard@example.com");
    expect(() => pipe.transform(42, bodyMetadata)).toThrow(ValidationException);
  });
});
