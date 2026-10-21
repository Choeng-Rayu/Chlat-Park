import { Module } from "@nestjs/common";

import { PrismaModule } from "../../prisma/prisma.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

/**
 * The health module.
 *
 * It owns the two probes and nothing else. The probes are the only part of
 * the API that is reachable without a token, so the module is deliberately
 * tiny and has no write paths.
 */
@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
