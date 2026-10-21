import { z } from "zod";
import { createRoute } from "./route.js";

/**
 * Health and probe routes.
 *
 * Both are public: the orchestrator's probes must work without a token.
 * `/health/live` answers "is the process up" and `/health/ready` answers "may
 * this instance serve traffic" (database reachable, migrations applied).
 */

export const livenessRoute = createRoute({
  method: "get",
  path: "/health/live",
  summary: "Liveness probe",
  description: "Answers as long as the process is running. It touches no dependency.",
  tags: ["health"],
  permissions: [],
  public: true,
  responses: {
    "200": {
      description: "The process is alive",
      schema: z.object({ status: z.literal("ok"), uptimeSeconds: z.number().nonnegative() }),
    },
  },
});

export const readinessRoute = createRoute({
  method: "get",
  path: "/health/ready",
  summary: "Readiness probe",
  description: "Checks the database connection and the applied migration state.",
  tags: ["health"],
  permissions: [],
  public: true,
  responses: {
    "200": {
      description: "The instance may serve traffic",
      schema: z.object({
        status: z.literal("ok"),
        database: z.literal("ok"),
        migrations: z.literal("up-to-date"),
      }),
    },
    "503": {
      description: "The instance may not serve traffic",
      schema: z.object({
        status: z.literal("error"),
        database: z.enum(["ok", "unavailable"]),
        migrations: z.enum(["up-to-date", "pending", "unknown"]),
      }),
    },
  },
});
