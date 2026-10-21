/**
 * `@chlat/contracts` — the single source of truth for the Chlat-Park contract.
 *
 * This package depends on `zod` and `zod-openapi` only. It has no knowledge
 * of NestJS, Next.js or Prisma: it holds *schemas* and the *permission
 * catalogue*, never business rules. (See
 * `specs/architecture/container-architecture.md` §5.)
 */

// --- permissions ------------------------------------------------------------
export {
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_CATEGORIES,
  ROLE_PERMISSIONS,
  SITE_ROLE_EXTRA_PERMISSIONS,
  ROLES,
  isPermissionKey,
  isRole,
  permissionsForRole,
  describePermission,
} from "./permissions.js";
export type {
  PermissionKey,
  PermissionCategory,
  PermissionScopeKind,
  Role,
} from "./permissions.js";

// --- schemas ----------------------------------------------------------------
export * from "./schemas/common.js";
export * from "./schemas/auth.js";
export * from "./schemas/rbac.js";
export * from "./schemas/parking.js";
export * from "./schemas/ticket.js";
export * from "./schemas/payment.js";
export * from "./schemas/admin.js";

// --- routes -----------------------------------------------------------------
export { createRoute } from "./routes/route.js";
export type {
  Route,
  RouteDefinition,
  RouteResponseDefinition,
  HttpMethod,
} from "./routes/route.js";
export { ROUTES, PUBLIC_ROUTE_ALLOWLIST, routeKey, findRoute } from "./routes/index.js";

// --- openapi ----------------------------------------------------------------
export {
  API_PREFIX,
  OPENAPI_VERSION,
  OPENAPI_INFO,
  buildOpenApiDocument,
  buildPaths,
  routeSummary,
} from "./openapi.js";
