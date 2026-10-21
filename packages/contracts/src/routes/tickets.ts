import { z } from "zod";
import { ErrorResponseSchema, UuidSchema } from "../schemas/common.js";
import { ListTicketsQuerySchema, TicketSchema } from "../schemas/ticket.js";
import { createRoute } from "./route.js";

/**
 * Ticket routes.
 *
 * A ticket is what the guard scans at the exit. The ticket token itself is a
 * bearer credential and is never returned by a list endpoint.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };
const ticketIdParams = z.object({ ticketId: UuidSchema });

export const listTicketsRoute = createRoute({
  method: "get",
  path: "/tickets",
  summary: "List e-tickets",
  tags: ["tickets"],
  permissions: ["site.sessions.read"],
  query: ListTicketsQuerySchema,
  responses: {
    "200": {
      description: "The tickets visible to the actor",
      schema: z.object({
        data: z.array(TicketSchema),
        page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
      }),
    },
    "403": errorResponse,
  },
});

export const getTicketRoute = createRoute({
  method: "get",
  path: "/tickets/{ticketId}",
  summary: "Read one e-ticket",
  tags: ["tickets"],
  permissions: ["site.ticket.verify"],
  params: ticketIdParams,
  responses: {
    "200": { description: "The ticket", schema: TicketSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const revokeTicketRoute = createRoute({
  method: "post",
  path: "/tickets/{ticketId}/revoke",
  summary: "Revoke an e-ticket",
  description: "A revoked ticket no longer authorises an exit.",
  tags: ["tickets"],
  permissions: ["site.review.open"],
  params: ticketIdParams,
  body: z.object({ reason: z.string().trim().min(1).max(500) }),
  responses: {
    "200": { description: "Revoked", schema: TicketSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});
