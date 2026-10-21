import type { Route } from "./route.js";
import { changePasswordRoute, loginRoute, logoutRoute, meRoute, refreshRoute } from "./auth.js";
import {
  createPricingPolicyRoute,
  createSiteRoute,
  deactivateSiteRoute,
  getSiteReportRoute,
  getSiteRoute,
  listPricingPoliciesRoute,
  listSitesRoute,
  updateSiteRoute,
} from "./sites.js";
import {
  activateSessionRoute,
  cancelSessionRoute,
  completeExitRoute,
  createSessionRoute,
  getSessionRoute,
  listSessionsRoute,
  requestExitRoute,
} from "./sessions.js";
import { claimEntryRoute, getEntryClaimRoute, reissueEntryClaimRoute } from "./entry-claims.js";
import { getTicketRoute, listTicketsRoute, revokeTicketRoute } from "./tickets.js";
import { verifyExitRoute } from "./verification.js";
import {
  exemptPaymentRoute,
  getPaymentRoute,
  listPaymentsRoute,
  recordPaymentRoute,
} from "./payments.js";
import {
  getReviewRoute,
  listReviewsRoute,
  openReviewRoute,
  resolveReviewRoute,
} from "./manual-review.js";
import { livenessRoute, readinessRoute } from "./health.js";

/**
 * The route registry.
 *
 * This is the single list of every API route. The OpenAPI document is
 * generated from it, and the API's route-audit test walks it to assert that
 * every route declares a permission or is on the public allowlist.
 */
export const ROUTES: readonly Route[] = [
  // --- auth ---------------------------------------------------------------
  loginRoute,
  refreshRoute,
  logoutRoute,
  meRoute,
  changePasswordRoute,

  // --- sites --------------------------------------------------------------
  listSitesRoute,
  createSiteRoute,
  getSiteRoute,
  updateSiteRoute,
  deactivateSiteRoute,
  getSiteReportRoute,
  listPricingPoliciesRoute,
  createPricingPolicyRoute,

  // --- parking sessions ---------------------------------------------------
  listSessionsRoute,
  createSessionRoute,
  getSessionRoute,
  activateSessionRoute,
  cancelSessionRoute,
  requestExitRoute,
  completeExitRoute,

  // --- entry claims -------------------------------------------------------
  claimEntryRoute,
  getEntryClaimRoute,
  reissueEntryClaimRoute,

  // --- tickets ------------------------------------------------------------
  listTicketsRoute,
  getTicketRoute,
  revokeTicketRoute,

  // --- verification -------------------------------------------------------
  verifyExitRoute,

  // --- payments -----------------------------------------------------------
  listPaymentsRoute,
  recordPaymentRoute,
  exemptPaymentRoute,
  getPaymentRoute,

  // --- manual review ------------------------------------------------------
  listReviewsRoute,
  openReviewRoute,
  getReviewRoute,
  resolveReviewRoute,

  // --- health -------------------------------------------------------------
  livenessRoute,
  readinessRoute,
] as const;

/**
 * The public-route allowlist.
 *
 * A route marked `public: true` must appear here, and a route that appears
 * here must be marked public. The API's route audit checks both directions —
 * adding a public route is a security-relevant change.
 *
 * This mirrors the reviewed allowlist in
 * `specs/architecture/rbac-design.md` §6.2.
 */
export const PUBLIC_ROUTE_ALLOWLIST: readonly string[] = [
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /entry-claims/claim",
  "GET /health/live",
  "GET /health/ready",
] as const;

/** A route's stable identifier, e.g. `POST /parking-sessions`. */
export function routeKey(route: Pick<Route, "method" | "path">): string {
  return `${route.method.toUpperCase()} ${route.path}`;
}

/** Find a route by its method and path. */
export function findRoute(method: string, path: string): Route | undefined {
  const upper = method.toUpperCase();
  return ROUTES.find((route) => route.method === upper && route.path === path);
}
