import { Module } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { API_PREFIX } from "@chlat/contracts";

import { AppModule } from "../../src/app.module.js";
import { UnannotatedFixtureController } from "../fixtures/deny-by-default.fixture.js";

/**
 * The application graph the e2e suite boots.
 *
 * It is the production `AppModule` plus one fixture controller that
 * deliberately declares no authorization metadata. The global guards
 * registered in `AppModule` (`APP_GUARD`) apply to it exactly as they apply
 * to every other route, which is what makes the deny-by-default proof
 * meaningful.
 */
@Module({
  imports: [AppModule],
  controllers: [UnannotatedFixtureController],
})
export class TestAppModule {}

/**
 * Build the application the same way `main.ts` builds it.
 *
 * The e2e suite must exercise the *real* application graph — the global
 * guards, the envelope interceptor and the exception filter — because those
 * are the parts that decide whether a route is protected. A test that boots a
 * hand-assembled module would prove nothing about the security model.
 *
 * Note what is *not* registered here: the envelope interceptor and the
 * exception filter are registered in `AppModule` as `APP_INTERCEPTOR` and
 * `APP_FILTER`, which are already global. Adding them again here would wrap
 * the response twice.
 */
export async function createTestApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(TestAppModule, {
    logger: false,
    abortOnError: false,
  });

  // The same prefix the server uses, imported from the contracts so the two
  // can never drift. A hardcoded string here once made every e2e assertion
  // 404 against a correctly-mounted route.
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  await app.init();

  return app;
}
