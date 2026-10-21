import { type CanActivate, type ExecutionContext, Injectable, type Type } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PermissionKey } from "@chlat/contracts";

import { ACTOR_HEADER, type ActorContext } from "../auth/actor.js";
import { AuthorizationService } from "../authorization/authorization.service.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { REQUIRE_PERMISSIONS_KEY } from "../decorators/require-permissions.decorator.js";
import { ApiException } from "../errors/api-exception.js";

/**
 * The permission guard — deny by default.
 *
 * This is the security core of the API. The rule it enforces
 * (`specs/architecture/rbac-design.md` §6):
 *
 * > A route with **no** `@RequirePermissions(...)` and **no** `@Public()`
 * > returns **403**.
 *
 * There is no implicit-allow path. A developer who adds a controller and
 * forgets the decorator gets a 403, not an open door.
 *
 * The guard is registered globally (`APP_GUARD`), so it runs for every route.
 * It runs **after** the JWT guard, which is why the actor is expected to be
 * present; a request without an actor is rejected with 401 rather than 403,
 * because "you are not signed in" is a different answer from "you may not do
 * this".
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorization: AuthorizationService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();

    // A `@Public()` route skips the permission check entirely. It has already
    // been through the JWT guard, which also honours `@Public()`.
    if (this.isPublic(handler, controller)) {
      return true;
    }

    const required = this.requiredPermissions(handler, controller);

    // Deny by default: no metadata means no allow.
    if (!required || required.length === 0) {
      throw new ApiException(
        "AUTHZ_PERMISSION_DENIED",
        "This route declares no required permission.",
        { route: describeRoute(context), reason: "missing-permission-metadata" },
      );
    }

    const actor = context.switchToHttp().getRequest<{ [ACTOR_HEADER]?: ActorContext }>()[
      ACTOR_HEADER
    ];

    if (!actor) {
      throw new ApiException("AUTH_UNAUTHENTICATED", undefined, {
        route: describeRoute(context),
      });
    }

    if (!this.authorization.hasAllPermissions(actor, required)) {
      throw new ApiException("AUTHZ_PERMISSION_DENIED", undefined, {
        route: describeRoute(context),
        required,
        actorRole: actor.role,
      });
    }

    return true;
  }

  /**
   * Is the route marked `@Public()`?
   *
   * The marker on the controller covers every route on it — a controller is
   * public or it is not.
   */
  private isPublic(handler: object, controller: object): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler as Type,
        controller as Type,
      ]) === true
    );
  }

  /**
   * The permissions the route requires.
   *
   * The handler's metadata wins over the controller's. `undefined` means the
   * route declares none — the deny-by-default case.
   */
  private requiredPermissions(handler: object, controller: object): PermissionKey[] | undefined {
    return this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRE_PERMISSIONS_KEY, [
      handler as Type,
      controller as Type,
    ]);
  }
}

/**
 * A stable description of the route, used in the error `details`.
 *
 * @internal
 */
function describeRoute(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<{ method?: string; path?: string }>();
  return `${request.method ?? "?"} ${request.path ?? "?"}`;
}
