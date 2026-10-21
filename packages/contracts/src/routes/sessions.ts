import { z } from "zod";
import { ErrorResponseSchema, UuidSchema } from "../schemas/common.js";
import {
  ActivateSessionRequestSchema,
  CancelSessionRequestSchema,
  CompleteExitRequestSchema,
  CreateSessionRequestSchema,
  ListSessionsQuerySchema,
  ParkingSessionSchema,
} from "../schemas/parking.js";
import { createRoute } from "./route.js";

/**
 * Parking-session routes.
 *
 * The session is the centre of the domain: entry creates it, the claim
 * activates it, the exit completes it.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };
const sessionIdParams = z.object({ sessionId: UuidSchema });

export const listSessionsRoute = createRoute({
  method: "get",
  path: "/parking-sessions",
  summary: "List parking sessions",
  description: "The list is scoped: a guard sees the sessions of the sites they are assigned to.",
  tags: ["parking-sessions"],
  permissions: ["site.sessions.read"],
  query: ListSessionsQuerySchema,
  responses: {
    "200": {
      description: "The sessions visible to the actor",
      schema: z.object({
        data: z.array(ParkingSessionSchema),
        page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
      }),
    },
    "403": errorResponse,
  },
});

export const createSessionRoute = createRoute({
  method: "post",
  path: "/parking-sessions",
  summary: "Create a parking session (entry)",
  description:
    "Creates a session in PENDING_CLAIM together with an entry claim. The raw claim token is " +
    "returned exactly once and rendered as the entry QR.",
  tags: ["parking-sessions"],
  permissions: ["site.sessions.create"],
  body: CreateSessionRequestSchema,
  responses: {
    "201": {
      description: "Created",
      schema: z.object({
        session: ParkingSessionSchema,
        /** The raw claim token. Shown once. */
        claimToken: z.string(),
        claimExpiresAt: z.string(),
      }),
    },
    "400": errorResponse,
    "403": errorResponse,
    "409": errorResponse,
  },
});

export const getSessionRoute = createRoute({
  method: "get",
  path: "/parking-sessions/{sessionId}",
  summary: "Read one parking session",
  tags: ["parking-sessions"],
  permissions: ["site.sessions.read"],
  params: sessionIdParams,
  responses: {
    "200": { description: "The session", schema: ParkingSessionSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const activateSessionRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/activate",
  summary: "Manually activate a never-claimed session",
  description: "Moves a PENDING_CLAIM session to ACTIVE, e.g. when the guest cannot scan the QR.",
  tags: ["parking-sessions"],
  permissions: ["site.sessions.activate"],
  params: sessionIdParams,
  body: ActivateSessionRequestSchema,
  responses: {
    "200": { description: "Activated", schema: ParkingSessionSchema },
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});

export const cancelSessionRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/cancel",
  summary: "Cancel a never-claimed session",
  description: "Moves a PENDING_CLAIM session to CANCELLED and revokes its entry claim.",
  tags: ["parking-sessions"],
  permissions: ["site.sessions.cancel"],
  params: sessionIdParams,
  body: CancelSessionRequestSchema,
  responses: {
    "200": { description: "Cancelled", schema: ParkingSessionSchema },
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});

export const requestExitRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/exit/request",
  summary: "Move a session to EXIT_PENDING",
  tags: ["parking-sessions"],
  permissions: ["site.exit.request"],
  params: sessionIdParams,
  responses: {
    "200": { description: "Exit requested", schema: ParkingSessionSchema },
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});

export const completeExitRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/exit/complete",
  summary: "Complete the exit of a session",
  description:
    "The transactional exit completion: re-checks the session status, the payment requirement and " +
    "the ticket under a row lock, then writes the session, ticket, payment, fee snapshot and audit " +
    "row in one transaction. A second concurrent completion loses and receives EXIT_ALREADY_COMPLETED.",
  tags: ["parking-sessions"],
  permissions: ["site.exit.complete"],
  idempotent: true,
  params: sessionIdParams,
  body: CompleteExitRequestSchema,
  responses: {
    "200": {
      description: "The session was completed",
      schema: z.object({
        session: ParkingSessionSchema,
        fee: z
          .object({
            amountMinor: z.number().int().nonnegative(),
            currency: z.string(),
            policyVersion: z.number().int().positive().nullable(),
          })
          .nullable(),
        receipt: z.record(z.string(), z.unknown()).nullable(),
      }),
    },
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});
