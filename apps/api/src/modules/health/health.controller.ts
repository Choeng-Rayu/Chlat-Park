import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";

import { Public } from "../../common/decorators/public.decorator.js";
import { ApiException } from "../../common/errors/api-exception.js";
import { HealthService } from "./health.service.js";

/**
 * The health probes.
 *
 * Both routes are `@Public()` — an orchestrator's probe carries no
 * credentials. They are on the reviewed public allowlist in
 * `@chlat/contracts` (`PUBLIC_ROUTE_ALLOWLIST`), and the route-audit test
 * fails the build if a public route appears that is not on that list.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * `GET /health/live` — is the process running?
   *
   * Touches no dependency on purpose: a liveness probe that depends on the
   * database restarts the whole fleet when the database blips.
   */
  @Get("live")
  @Public()
  @HttpCode(HttpStatus.OK)
  live(): { status: "ok"; uptimeSeconds: number } {
    return this.health.live();
  }

  /**
   * `GET /health/ready` — may this instance serve traffic?
   *
   * Answers 503 when the database is unreachable, so the orchestrator takes
   * the instance out of rotation instead of sending it traffic.
   */
  @Get("ready")
  @Public()
  async ready(): Promise<{
    status: "ok" | "error";
    database: "ok" | "unavailable";
    migrations: "up-to-date" | "pending" | "unknown";
  }> {
    const result = await this.health.ready();

    if (result.status !== "ok") {
      // The probe body travels in `error.details` so the client still sees
      // the database state, and the envelope stays consistent:
      // `success` is false and `error` is populated.
      throw new ApiException("SERVICE_UNAVAILABLE", "The instance is not ready.", result);
    }

    return result;
  }
}
