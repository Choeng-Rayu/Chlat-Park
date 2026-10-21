import { z } from "zod";
import { ErrorResponseSchema, UuidSchema } from "../schemas/common.js";
import {
  CreateSiteRequestSchema,
  ListSitesQuerySchema,
  ParkingSiteSchema,
  UpdateSiteRequestSchema,
} from "../schemas/parking.js";
import { CreatePricingPolicyRequestSchema, PricingPolicySchema } from "../schemas/payment.js";
import { SiteReportSchema } from "../schemas/admin.js";
import { createRoute } from "./route.js";

/**
 * Parking-site routes.
 *
 * A site's lifecycle (settings, staff, pricing) and the platform-wide site
 * collection share one file, because they share one resource.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };
const siteIdParams = z.object({ siteId: UuidSchema });

export const listSitesRoute = createRoute({
  method: "get",
  path: "/sites",
  summary: "List parking sites",
  tags: ["sites"],
  permissions: ["platform.sites.read"],
  query: ListSitesQuerySchema,
  responses: {
    "200": {
      description: "The sites visible to the actor",
      schema: z.object({
        data: z.array(ParkingSiteSchema),
        page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
      }),
    },
    "401": errorResponse,
    "403": errorResponse,
  },
});

export const createSiteRoute = createRoute({
  method: "post",
  path: "/sites",
  summary: "Create a parking site",
  tags: ["sites"],
  permissions: ["platform.sites.create"],
  body: CreateSiteRequestSchema,
  responses: {
    "201": { description: "Created", schema: ParkingSiteSchema },
    "400": errorResponse,
    "403": errorResponse,
    "409": errorResponse,
  },
});

export const getSiteRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}",
  summary: "Read one parking site",
  tags: ["sites"],
  permissions: ["platform.sites.read"],
  params: siteIdParams,
  responses: {
    "200": { description: "The site", schema: ParkingSiteSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const updateSiteRoute = createRoute({
  method: "patch",
  path: "/sites/{siteId}",
  summary: "Update a parking site",
  tags: ["sites"],
  permissions: ["platform.sites.update"],
  params: siteIdParams,
  body: UpdateSiteRequestSchema,
  responses: {
    "200": { description: "The updated site", schema: ParkingSiteSchema },
    "400": errorResponse,
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const deactivateSiteRoute = createRoute({
  method: "delete",
  path: "/sites/{siteId}",
  summary: "Deactivate a parking site",
  description:
    "Soft-deletes the site. It blocks new sessions; existing sessions and their audit trail are kept.",
  tags: ["sites"],
  permissions: ["platform.sites.deactivate"],
  params: siteIdParams,
  responses: {
    "204": { description: "Deactivated" },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const getSiteReportRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}/report",
  summary: "Read the site's report (sessions, payments, totals)",
  tags: ["sites", "reports"],
  permissions: ["site.reports.read"],
  params: siteIdParams,
  query: z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  }),
  responses: {
    "200": { description: "The report", schema: SiteReportSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const listPricingPoliciesRoute = createRoute({
  method: "get",
  path: "/sites/{siteId}/pricing-policies",
  summary: "List the site's pricing policy versions",
  tags: ["sites", "pricing"],
  permissions: ["site.pricing.read"],
  params: siteIdParams,
  responses: {
    "200": {
      description: "The policy versions, newest first",
      schema: z.object({ data: z.array(PricingPolicySchema) }),
    },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const createPricingPolicyRoute = createRoute({
  method: "post",
  path: "/sites/{siteId}/pricing-policies",
  summary: "Create a new pricing policy version",
  description:
    "A policy is immutable: creating one produces a new version with a new id and an " +
    "effective-from timestamp. The currently effective policy stays in force until then.",
  tags: ["sites", "pricing"],
  permissions: ["site.pricing.manage"],
  requiresReauth: true,
  params: siteIdParams,
  body: CreatePricingPolicyRequestSchema,
  responses: {
    "201": { description: "Created", schema: PricingPolicySchema },
    "400": errorResponse,
    "403": errorResponse,
    "409": errorResponse,
  },
});
