import { z } from "zod";
import { ErrorResponseSchema, UuidSchema } from "../schemas/common.js";
import {
  ExemptPaymentRequestSchema,
  ListPaymentsQuerySchema,
  PaymentSchema,
  RecordPaymentRequestSchema,
} from "../schemas/payment.js";
import { createRoute } from "./route.js";

/**
 * Payment routes.
 *
 * A payment is settled against a session. The currency is never supplied by
 * the client — it comes from the site or the pricing policy.
 */

const errorResponse = { description: "Error", schema: ErrorResponseSchema };
const sessionIdParams = z.object({ sessionId: UuidSchema });
const paymentIdParams = z.object({ paymentId: UuidSchema });

export const listPaymentsRoute = createRoute({
  method: "get",
  path: "/payments",
  summary: "List payment records",
  tags: ["payments"],
  permissions: ["platform.payments.read"],
  query: ListPaymentsQuerySchema,
  responses: {
    "200": {
      description: "The payments visible to the actor",
      schema: z.object({
        data: z.array(PaymentSchema),
        page: z.object({ nextCursor: z.string().nullable(), hasMore: z.boolean() }),
      }),
    },
    "403": errorResponse,
  },
});

export const recordPaymentRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/payment",
  summary: "Record a manual payment result",
  description: "Settles the fee for a session. Honours the Idempotency-Key header.",
  tags: ["payments"],
  permissions: ["site.payments.record"],
  idempotent: true,
  params: sessionIdParams,
  body: RecordPaymentRequestSchema,
  responses: {
    "201": { description: "Recorded", schema: PaymentSchema },
    "400": errorResponse,
    "403": errorResponse,
    "404": errorResponse,
    "409": errorResponse,
  },
});

export const exemptPaymentRoute = createRoute({
  method: "post",
  path: "/parking-sessions/{sessionId}/payment/exemption",
  summary: "Grant a fee exemption",
  description: "The reason is mandatory and is written to the audit log.",
  tags: ["payments"],
  permissions: ["site.payments.exempt"],
  requiresReauth: true,
  params: sessionIdParams,
  body: ExemptPaymentRequestSchema,
  responses: {
    "201": { description: "Exempted", schema: PaymentSchema },
    "400": errorResponse,
    "403": errorResponse,
    "404": errorResponse,
  },
});

export const getPaymentRoute = createRoute({
  method: "get",
  path: "/payments/{paymentId}",
  summary: "Read one payment record",
  tags: ["payments"],
  permissions: ["platform.payments.read"],
  params: paymentIdParams,
  responses: {
    "200": { description: "The payment", schema: PaymentSchema },
    "403": errorResponse,
    "404": errorResponse,
  },
});
