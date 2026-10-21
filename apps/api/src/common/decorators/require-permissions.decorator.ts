import { SetMetadata } from "@nestjs/common";
import type { PermissionKey } from "@chlat/contracts";

/** The metadata key the `@RequirePermissions()` decorator writes. */
export const REQUIRE_PERMISSIONS_KEY = "chlat:requiredPermissions";

/**
 * Declare the permissions a route requires.
 *
 * The keys come from `@chlat/contracts`' permission catalogue, so a typo is a
 * compile error rather than a route that silently denies every caller.
 *
 * ```ts
 * @Get("revenue")
 * @RequirePermissions("platform.revenue.read")
 * async revenue() { … }
 * ```
 *
 * A route with **no** `@RequirePermissions()` and **no** `@Public()` is
 * denied with 403 by the permission guard. There is no implicit-allow path —
 * see `specs/architecture/rbac-design.md` §6.
 */
export const RequirePermissions = (
  ...permissions: PermissionKey[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
