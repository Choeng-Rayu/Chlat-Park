import { z } from "zod";
import { ErrorResponseSchema, UuidSchema } from "../schemas/common.js";
import {
  ManualReviewSchema,
  OpenReviewRequestSchema,
  ResolveReviewRequestSchema,
} from "../schemas/parking.js";
import { createRoute } from "./route.js";

/**
 * Manual-review routes.
 *
 * A review is opened for any refusal a guard cannot resolve directly, and it
 * moves the session to MANUAL_REVIEW. Resolving it requires an authorised
 * actor and an audited reason.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };
const reviewIdParams = z.object({ reviewId: UuidSchema });
const sessionIdParams = z.object({ sessionId: UuidSchema });

export const listReviewsRoute = createRoute({
  method: "get",
  path: "/manual-reviews",
  summary: "List manual-review cases",
  tags: ["manual-review"],
  permissions: ["site.review.open"],
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().trim().min(1).optional(),
    siteId: UuidSchema.optional(),
    status: z.enum(["OPEN", "RESOLVED"]).optional(),
  }),
  responses: {
    "200": {
      description: "The review cases visible to the actor",
      schema: z.object({
        data: z.array(ManualReviewSchema),
        page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
      }),
    },
    "403": errorResponse,
  },
});

export const openReviewRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/review",
  summary: "Open a manual-review case for a session",
  description: "Moves the session to MANUAL_REVIEW and records the reason.",
  tags: ["manual-review"],
  permissions: ["site.review.open"],
  params: sessionIdParams,
  body: OpenReviewRequestSchema,
  responses: {
    "201": { description: "Opened", schema: ManualReviewSchema },
    "400": errorResponse,
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});

export const getReviewRoute = createRoute({
  method: "get",
  path: "/manual-reviews/{reviewId}",
  summary: "Read one manual-review case",
  tags: ["manual-review"],
  permissions: ["site.review.open"],
  params: reviewIdParams,
  responses: {
    "200": { description: "The review case", schema: ManualReviewSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const resolveReviewRoute = createRoute({
  method: "post",
  path: "/manual-reviews/{reviewId}/resolve",
  summary: "Resolve a manual-review case",
  description:
    "The session may resolve to ACTIVE, EXIT_PENDING or COMPLETED. The before and after states are " +
    "written to the audit log.",
  tags: ["manual-review"],
  permissions: ["site.review.resolve"],
  requiresReauth: true,
  params: reviewIdParams,
  body: ResolveReviewRequestSchema,
  responses: {
    "200": { description: "Resolved", schema: ManualReviewSchema },
    "400": errorResponse,
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});
