import { z } from "zod";

/**
 * The API's environment contract.
 *
 * The environment is validated **once, at boot**, and the process refuses to
 * start when anything is missing or malformed. A half-configured API is far
 * more dangerous than an API that does not start: a missing `PLATE_PEPPER`
 * would silently change the digest of every plate, and a missing
 * `JWT_ACCESS_SECRET` would fall back to a default that everybody knows.
 *
 * The variables themselves are documented in the repository root
 * `.env.example`, which is the template a developer copies to `.env`.
 */

/** A `postgresql://` connection string. */
const DatabaseUrlSchema = z
  .string()
  .min(1, "DATABASE_URL is required")
  .refine(
    (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
    "DATABASE_URL must be a postgresql:// connection string",
  );

/** A secret of at least 32 characters. */
const SecretSchema = z.string().min(32, "must be at least 32 characters long");

/** A duration such as `15m`, `12h` or `7d`. */
const DurationSchema = z
  .string()
  .trim()
  .regex(/^\d+[smhd]$/, "must be a duration such as `15m`, `12h` or `7d`");

/** A comma-separated list of browser origins. */
const CorsOriginsSchema = z
  .string()
  .min(1, "CORS_ORIGINS is required")
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  )
  .refine((origins) => origins.length > 0, {
    message: "CORS_ORIGINS must contain at least one origin",
  });

/** The shape of the validated environment. */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    // --- database --------------------------------------------------------
    DATABASE_URL: DatabaseUrlSchema,

    // --- authentication --------------------------------------------------
    JWT_ACCESS_SECRET: SecretSchema,
    JWT_REFRESH_SECRET: SecretSchema,
    JWT_ACCESS_TTL: DurationSchema.default("15m"),
    JWT_REFRESH_TTL: DurationSchema.default("7d"),

    // --- secrets ---------------------------------------------------------
    PLATE_PEPPER: z.string().min(16, "must be at least 16 characters long"),
    ENCRYPTION_KEY: z.string().min(16, "must be at least 16 characters long"),

    // --- http ------------------------------------------------------------
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CORS_ORIGINS: CorsOriginsSchema,

    // --- rate limiting ---------------------------------------------------
    RATE_LIMIT_TTL_MS: z.coerce.number().int().min(100).default(60_000),
    RATE_LIMIT_LIMIT: z.coerce.number().int().min(1).default(120),
    RATE_LIMIT_LOGIN_TTL_MS: z.coerce.number().int().min(100).default(900_000),
    RATE_LIMIT_LOGIN_LIMIT: z.coerce.number().int().min(1).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["JWT_REFRESH_SECRET"],
        message: "must differ from JWT_ACCESS_SECRET",
      });
    }

    // A wildcard CORS origin would let any website call the API with the
    // victim's cookies. It is a development convenience only.
    if (env.NODE_ENV === "production" && env.CORS_ORIGINS.includes("*")) {
      ctx.addIssue({
        code: "custom",
        path: ["CORS_ORIGINS"],
        message: "must not be `*` in production — list the browser origins explicitly",
      });
    }
  });

/** The validated environment. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * Thrown when the environment is missing or invalid.
 *
 * The message lists every problem at once, so a developer fixes the whole
 * `.env` in one pass instead of one variable per restart.
 */
export class EnvValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

/**
 * Validate a raw environment.
 *
 * @throws {EnvValidationError} when a variable is missing or malformed.
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    });
    throw new EnvValidationError(issues);
  }

  return result.data;
}

let cached: Env | undefined;

/**
 * The validated environment, parsed once per process.
 *
 * @throws {EnvValidationError} on the first call when the environment is invalid.
 */
export function getEnv(): Env {
  cached ??= validateEnv();
  return cached;
}
