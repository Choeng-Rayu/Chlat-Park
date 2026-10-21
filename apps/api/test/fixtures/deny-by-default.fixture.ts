import { Controller, Get } from "@nestjs/common";

/**
 * A controller that deliberately declares **no** authorization metadata.
 *
 * It exists only in the test tree. The e2e suite mounts it to prove the
 * deny-by-default rule at the HTTP boundary: a request to
 * `GET /api/v1/test/unannotated` must be answered with 403, not 200 — even with
 * a valid super-admin token.
 *
 * This is the fixture that catches a regression where `PermissionsGuard` is
 * weakened into an implicit allow.
 */
@Controller("test")
export class UnannotatedFixtureController {
  /** No `@Public()`, no `@RequirePermissions()` — the deny-by-default case. */
  @Get("unannotated")
  unannotated(): { secret: string } {
    return { secret: "this must never be reachable" };
  }
}
