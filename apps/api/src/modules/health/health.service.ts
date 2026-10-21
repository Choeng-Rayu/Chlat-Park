import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

/** The result of a readiness probe. */
export interface ReadinessResult {
  /** Whether the instance may serve traffic. */
  status: "ok" | "error";
  /** The state of the database connection. */
  database: "ok" | "unavailable";
  /** The state of the applied migrations. */
  migrations: "up-to-date" | "pending" | "unknown";
}

/**
 * The health service.
 *
 * Liveness answers "is the process up" and touches no dependency. Readiness
 * answers "may this instance serve traffic" and therefore pings the
 * database — a process that cannot reach Postgres must be taken out of the
 * load balancer even though it is perfectly alive.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** The liveness answer. Never touches a dependency. */
  live(): { status: "ok"; uptimeSeconds: number } {
    return { status: "ok", uptimeSeconds: Math.floor(process.uptime()) };
  }

  /**
   * The readiness answer.
   *
   * A database that cannot be reached produces `status: "error"` rather than
   * an exception: the probe must answer with a body, and the HTTP status
   * (503) is what the orchestrator reads.
   */
  async ready(): Promise<ReadinessResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "ok", migrations: "unknown" };
    } catch {
      return { status: "error", database: "unavailable", migrations: "unknown" };
    }
  }
}
