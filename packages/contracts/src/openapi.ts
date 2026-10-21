import { createDocument } from "zod-openapi";
import type { ZodOpenApiPathItemObject } from "zod-openapi";
import { ROUTES, routeKey } from "./routes/index.js";

/**
 * The OpenAPI 3.1 document.
 *
 * It is assembled from the same route definitions and the same Zod schemas
 * the API validates requests with, so the published contract cannot drift
 * away from the implementation.
 */

/** The prefix every route is mounted under. */
export const API_PREFIX = "/api/v1";

/** The OpenAPI version this document declares. */
export const OPENAPI_VERSION = "3.1.0";

/** The document's metadata. */
export const OPENAPI_INFO = {
  title: "Chlat-Park API",
  version: "1.0.0",
  description: [
    "Chlat-Park is an e-ticket parking system: manual, guard-assisted motorcycle parking",
    "entry and exit, where a paper ticket is replaced by a QR-linked e-ticket bound to a",
    "motorcycle plate and a parking session.",
    "",
    "Guests never register. They scan the entry QR and receive an e-ticket; the guard scans",
    "the e-ticket at the exit and authorises the release of the bike.",
  ].join("\n"),
  license: { name: "UNLICENSED" },
} as const;

/**
 * Group the routes into OpenAPI path items.
 *
 * Several routes may share a path (e.g. `GET /sites` and `POST /sites`); they
 * are merged into a single path item.
 */
export function buildPaths(): Record<string, ZodOpenApiPathItemObject> {
  const paths: Record<string, ZodOpenApiPathItemObject> = {};

  for (const route of ROUTES) {
    const fullPath = `${API_PREFIX}${route.path}`;
    const existing = paths[fullPath] ?? {};

    paths[fullPath] = {
      ...existing,
      ...route.pathItem,
    } as ZodOpenApiPathItemObject;
  }

  return paths;
}

/**
 * Build the full OpenAPI 3.1 document.
 *
 * `reused: "ref"` keeps the document readable: a schema used by more than one
 * operation is emitted once under `components/schemas` and referenced
 * elsewhere.
 */
export function buildOpenApiDocument(): ReturnType<typeof createDocument> {
  return createDocument({
    openapi: OPENAPI_VERSION,
    info: OPENAPI_INFO,
    paths: buildPaths(),
    servers: [
      { url: "http://localhost:3001", description: "Local development" },
      { url: "https://api.chlat-park.com", description: "Production" },
    ],
    tags: [
      { name: "auth", description: "Sign-in, token rotation and the actor context" },
      { name: "sites", description: "Parking sites and their settings" },
      { name: "pricing", description: "Versioned pricing policies" },
      { name: "parking-sessions", description: "The parking-session lifecycle" },
      { name: "entry-claims", description: "Entry QR issuance and guest claims" },
      { name: "tickets", description: "E-tickets" },
      { name: "verification", description: "Exit verification" },
      { name: "payments", description: "Payments and exemptions" },
      { name: "manual-review", description: "Manual-review cases" },
      { name: "reports", description: "Site and platform reports" },
      { name: "health", description: "Liveness and readiness probes" },
    ],
    components: {
      securitySchemes: {
        accessToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "The access token issued by `POST /auth/login`. It is also delivered as an HttpOnly cookie.",
        },
      },
    },
    security: [{ accessToken: [] }],
  });
}

/** A summary of the documented surface, used by the API's route audit. */
export function routeSummary(): Array<{
  key: string;
  public: boolean;
  permissions: readonly string[];
}> {
  return ROUTES.map((route) => ({
    key: routeKey(route),
    public: route.public === true,
    permissions: route.permissions,
  }));
}
