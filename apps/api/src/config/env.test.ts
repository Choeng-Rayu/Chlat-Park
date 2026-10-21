import { describe, expect, it } from "vitest";

import { EnvValidationError, validateEnv } from "./env.js";

/**
 * The environment contract.
 *
 * A half-configured API is more dangerous than an API that refuses to start:
 * a missing pepper silently changes every plate digest, and a missing secret
 * falls back to a value everybody knows. The validation must fail fast, and
 * it must list every problem at once.
 */

/** A valid environment, with one variable overridable. */
function validEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://chlat:chlat@localhost:5432/chlat_park",
    JWT_ACCESS_SECRET: "a".repeat(48),
    JWT_REFRESH_SECRET: "b".repeat(48),
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    PLATE_PEPPER: "c".repeat(48),
    ENCRYPTION_KEY: "d".repeat(48),
    API_PORT: "3001",
    CORS_ORIGINS: "http://localhost:3000",
    RATE_LIMIT_TTL_MS: "60000",
    RATE_LIMIT_LIMIT: "120",
    RATE_LIMIT_LOGIN_TTL_MS: "900000",
    RATE_LIMIT_LOGIN_LIMIT: "10",
    ...overrides,
  };
}

describe("validateEnv", () => {
  it("accepts a complete environment", () => {
    const env = validateEnv(validEnv());

    expect(env.API_PORT).toBe(3001);
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:3000"]);
    expect(env.JWT_ACCESS_TTL).toBe("15m");
  });

  it("rejects a missing DATABASE_URL", () => {
    const source = validEnv();
    delete source["DATABASE_URL"];

    expect(() => validateEnv(source)).toThrow(EnvValidationError);
  });

  it("rejects a DATABASE_URL that is not a postgres connection string", () => {
    expect(() => validateEnv(validEnv({ DATABASE_URL: "mysql://localhost/db" }))).toThrow(
      EnvValidationError,
    );
  });

  it("rejects a short JWT secret", () => {
    expect(() => validateEnv(validEnv({ JWT_ACCESS_SECRET: "too-short" }))).toThrow(
      EnvValidationError,
    );
  });

  it("rejects a refresh secret that equals the access secret", () => {
    const secret = "e".repeat(48);

    expect(() =>
      validateEnv(validEnv({ JWT_ACCESS_SECRET: secret, JWT_REFRESH_SECRET: secret })),
    ).toThrow(EnvValidationError);
  });

  it("rejects a malformed duration", () => {
    expect(() => validateEnv(validEnv({ JWT_ACCESS_TTL: "15 minutes" }))).toThrow(
      EnvValidationError,
    );
  });

  it("rejects a wildcard CORS origin in production", () => {
    expect(() => validateEnv(validEnv({ NODE_ENV: "production", CORS_ORIGINS: "*" }))).toThrow(
      EnvValidationError,
    );
  });

  it("accepts a wildcard CORS origin in development", () => {
    expect(
      validateEnv(validEnv({ NODE_ENV: "development", CORS_ORIGINS: "*" })).CORS_ORIGINS,
    ).toEqual(["*"]);
  });

  it("lists every problem at once", () => {
    const source = validEnv();
    delete source["DATABASE_URL"];
    delete source["PLATE_PEPPER"];

    try {
      validateEnv(source);
      expect.unreachable("The environment must be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues).toHaveLength(2);
    }
  });
});
