import { SetMetadata } from "@nestjs/common";

/** The metadata key the `@Public()` decorator writes. */
export const IS_PUBLIC_KEY = "chlat:isPublic";

/**
 * Mark a route as public.
 *
 * A public route skips authentication **and** the permission check. It is the
 * only way to opt out of the deny-by-default rule, and it is deliberately
 * loud: every `@Public()` route must appear on the reviewed allowlist in
 * `@chlat/contracts` (`PUBLIC_ROUTE_ALLOWLIST`), and the route-audit test
 * fails the build when it does not.
 *
 * The public surface is exactly:
 *
 * | Route | Why |
 * |---|---|
 * | `POST /auth/login` | There is no session yet. |
 * | `POST /auth/refresh` | The access token is expired by definition. |
 * | `POST /entry-claims/claim` | The claim token *is* the credential. |
 * | `GET /health/live` | A liveness probe. |
 * | `GET /health/ready` | A readiness probe. |
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
