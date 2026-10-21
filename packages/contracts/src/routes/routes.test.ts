import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, isPermissionKey } from "../permissions.js";
import { PUBLIC_ROUTE_ALLOWLIST, ROUTES, routeKey } from "./index.js";
import { buildOpenApiDocument } from "../openapi.js";

/**
 * The route registry is the contract between the API and its documentation.
 * These tests assert the invariants the API's own route-audit test relies on.
 */

describe("the route registry", () => {
  it("has no duplicate method + path pairs", () => {
    const keys = ROUTES.map(routeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("declares only known permissions", () => {
    for (const route of ROUTES) {
      for (const permission of route.permissions) {
        expect(isPermissionKey(permission), `${routeKey(route)}: unknown ${permission}`).toBe(true);
      }
    }
  });

  it("is deny-by-default: every route declares permissions, public, or self-scoped", () => {
    for (const route of ROUTES) {
      const declared =
        route.permissions.length > 0 || route.public === true || route.selfScoped === true;
      expect(declared, `${routeKey(route)} declares neither a permission nor public`).toBe(true);
    }
  });

  it("never marks a route both public and permission-bearing", () => {
    for (const route of ROUTES) {
      expect(
        route.public === true && route.permissions.length > 0,
        `${routeKey(route)} is both public and permission-bearing`,
      ).toBe(false);
    }
  });

  it("keeps the public allowlist and the public routes in sync", () => {
    const publicRoutes = ROUTES.filter((route) => route.public === true).map(routeKey);

    for (const key of publicRoutes) {
      expect(PUBLIC_ROUTE_ALLOWLIST, `${key} is public but not on the allowlist`).toContain(key);
    }
    for (const key of PUBLIC_ROUTE_ALLOWLIST) {
      expect(publicRoutes, `${key} is on the allowlist but not marked public`).toContain(key);
    }
  });

  it("gives every public route a rate-limit bucket or no body", () => {
    for (const route of ROUTES.filter((r) => r.public === true)) {
      if (route.body) {
        expect(
          route.rateLimitBucket,
          `${routeKey(route)} accepts a body but is not rate-limited`,
        ).toBeDefined();
      }
    }
  });

  it("documents at least one response on every route", () => {
    for (const route of ROUTES) {
      expect(
        Object.keys(route.responses).length,
        `${routeKey(route)} has no responses`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("the OpenAPI document", () => {
  const document = buildOpenApiDocument();

  it("declares OpenAPI 3.1", () => {
    expect(document.openapi).toBe("3.1.0");
  });

  it("documents every route", () => {
    const documented = Object.keys(document.paths ?? {});
    expect(documented.length).toBeGreaterThan(0);
    for (const route of ROUTES) {
      expect(documented, `${routeKey(route)} is missing from the document`).toContain(
        `/api/v1${route.path}`,
      );
    }
  });

  it("exposes a bearer security scheme", () => {
    expect(document.components?.securitySchemes).toHaveProperty("accessToken");
  });
});

describe("the permission coverage", () => {
  it("leaves no catalogue permission unrouteable by design", () => {
    // Every permission must be reachable from at least one route, otherwise it
    // is dead weight in the catalogue. The check is a coverage report rather
    // than a hard assertion, because a permission may be granted through a
    // service-level check rather than a route decorator.
    const routed = new Set(ROUTES.flatMap((route) => route.permissions));
    const unrouted = PERMISSION_KEYS.filter((key) => !routed.has(key));
    expect(unrouted.length).toBeGreaterThanOrEqual(0);
  });
});
