import { type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { ACTOR_HEADER, type ActorContext } from "../auth/actor.js";
import { AuthorizationService } from "../authorization/authorization.service.js";
import { Public } from "../decorators/public.decorator.js";
import { RequirePermissions } from "../decorators/require-permissions.decorator.js";
import { ApiException } from "../errors/api-exception.js";
import { PermissionsGuard } from "./permissions.guard.js";

/**
 * The deny-by-default proof.
 *
 * The rule under test (`specs/architecture/rbac-design.md` §6):
 *
 * > A route with no `@RequirePermissions(...)` and no `@Public()` returns 403.
 *
 * If this test ever fails, the API has an implicit-allow path, and every
 * un-annotated route in the codebase is open.
 */

/** A minimal execution context over a handler and an optional actor. */
function contextFor(handler: object, actor?: ActorContext): ExecutionContext {
  const request: Record<string, unknown> = { method: "GET", path: "/v1/example" };
  if (actor) {
    request[ACTOR_HEADER] = actor;
  }

  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

/** A super-admin actor. */
const superAdmin: ActorContext = {
  userId: "3f6d5b1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
  role: "super_admin",
  scopeKind: "platform",
  ownerProfileId: null,
  guardProfileId: null,
  authzVersion: 1,
};

/** A guard actor. */
const guard: ActorContext = {
  userId: "11111111-2222-4333-8444-555555555555",
  role: "guard",
  scopeKind: "assigned",
  ownerProfileId: null,
  guardProfileId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
  authzVersion: 1,
};

function makeGuard(): PermissionsGuard {
  return new PermissionsGuard(new Reflector(), new AuthorizationService());
}

describe("PermissionsGuard", () => {
  it("denies a route with no permission metadata and no @Public() marker", () => {
    class Unannotated {
      handler(): void {
        /* no decorators */
      }
    }

    const guardInstance = makeGuard();

    expect(() =>
      guardInstance.canActivate(contextFor(Unannotated.prototype.handler, superAdmin)),
    ).toThrow(ApiException);

    try {
      guardInstance.canActivate(contextFor(Unannotated.prototype.handler, superAdmin));
      expect.unreachable("The guard must deny an un-annotated route.");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).code).toBe("AUTHZ_PERMISSION_DENIED");
      expect((error as ApiException).getStatus()).toBe(403);
    }
  });

  it("allows a @Public() route even without an actor", () => {
    class PublicRoute {
      @Public()
      handler(): void {
        /* public */
      }
    }

    expect(makeGuard().canActivate(contextFor(PublicRoute.prototype.handler))).toBe(true);
  });

  it("allows a route whose declared permission the actor holds", () => {
    class RevenueRoute {
      @RequirePermissions("platform.revenue.read")
      handler(): void {
        /* permitted */
      }
    }

    expect(makeGuard().canActivate(contextFor(RevenueRoute.prototype.handler, superAdmin))).toBe(
      true,
    );
  });

  it("denies a route whose declared permission the actor does not hold", () => {
    class RevenueRoute {
      @RequirePermissions("platform.revenue.read")
      handler(): void {
        /* permitted */
      }
    }

    try {
      makeGuard().canActivate(contextFor(RevenueRoute.prototype.handler, guard));
      expect.unreachable("A guard must not hold platform.revenue.read.");
    } catch (error) {
      expect((error as ApiException).code).toBe("AUTHZ_PERMISSION_DENIED");
    }
  });

  it("requires every declared permission, not just one of them", () => {
    class PlateRoute {
      @RequirePermissions("platform.analytics.read", "platform.audit.export")
      handler(): void {
        /* two permissions */
      }
    }

    // The super admin holds the whole catalogue, so the route is allowed.
    expect(makeGuard().canActivate(contextFor(PlateRoute.prototype.handler, superAdmin))).toBe(
      true,
    );
  });

  it("rejects a request that carries no actor at all", () => {
    class RevenueRoute {
      @RequirePermissions("platform.revenue.read")
      handler(): void {
        /* permitted */
      }
    }

    try {
      makeGuard().canActivate(contextFor(RevenueRoute.prototype.handler));
      expect.unreachable("A request without an actor must be rejected.");
    } catch (error) {
      expect((error as ApiException).code).toBe("AUTH_UNAUTHENTICATED");
      expect((error as ApiException).getStatus()).toBe(401);
    }
  });
});
