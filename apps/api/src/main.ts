import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module.js";
import { getEnv } from "./config/env.js";

/**
 * The API's entrypoint.
 *
 * The bootstrap does four things and nothing else:
 *
 * 1. Validates the environment (and refuses to start when it is invalid).
 * 2. Mounts every route under `/v1`.
 * 3. Installs the global validation pipe and the CORS policy.
 * 4. Listens.
 *
 * The global prefix is `v1` and **only** `v1` — a controller must never
 * write `v1/` into its own `@Controller()` path, or the route becomes
 * `/v1/v1/…` and silently 404s.
 */
async function bootstrap(): Promise<void> {
  const env = getEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // The API answers JSON only; the body parser limit protects the login
    // and webhook endpoints from an oversized payload.
    bodyParser: true,
    logger: env.NODE_ENV === "test" ? false : undefined,
  });

  app.setGlobalPrefix("v1");

  app.useGlobalPipes(
    new ValidationPipe({
      // A request that carries a field the contract does not define is a 400,
      // not a silently ignored field. Every new query parameter must be
      // declared in the DTO.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      whitelist: true,
    }),
  );

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "Idempotency-Key"],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  });

  // The API is mounted behind a proxy in production, so the client IP is
  // taken from the first hop in `X-Forwarded-For`. `trust proxy` is 1, not
  // `true`: trusting the whole chain would let a client spoof its own IP
  // and defeat the rate limit.
  app.set("trust proxy", 1);

  await app.listen(env.API_PORT, "0.0.0.0");

  console.warn(`[api] Chlat-Park API listening on http://0.0.0.0:${env.API_PORT}/v1`);
}

void bootstrap().catch((error: unknown) => {
  console.error("[api] Failed to start:", error);
  process.exitCode = 1;
});
