import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerModule } from "@nestjs/throttler";

import { getEnv } from "./config/env.js";
import { AuthorizationService } from "./common/authorization/authorization.service.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard.js";
import { PermissionsGuard } from "./common/guards/permissions.guard.js";
import { TransformInterceptor } from "./common/interceptors/transform.interceptor.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

/**
 * The API's root module.
 *
 * The three global providers are the API's cross-cutting contract:
 *
 * | Provider | Responsibility |
 * |---|---|
 * | `JwtAuthGuard` | *Who* the caller is. Skipped on `@Public()` routes. |
 * | `PermissionsGuard` | *What* the caller may do. Deny by default. |
 * | `AllExceptionsFilter` | Every failure becomes the same error envelope. |
 *
 * `TransformInterceptor` wraps every successful response in the same
 * envelope.
 *
 * The guards are registered in this order, and the order matters: the
 * authentication guard must attach the actor before the permission guard
 * looks for it.
 */
@Module({
  imports: [
    JwtModule.register({
      secret: getEnv().JWT_ACCESS_SECRET,
      signOptions: { expiresIn: getEnv().JWT_ACCESS_TTL },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: getEnv().RATE_LIMIT_TTL_MS,
        limit: getEnv().RATE_LIMIT_LIMIT,
      },
    ]),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    AuthorizationService,

    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
