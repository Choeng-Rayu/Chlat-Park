import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

/**
 * The Prisma module.
 *
 * It is `@Global()` so that every feature module can inject `PrismaService`
 * without importing the module again. The service is still exported, so a
 * module that prefers an explicit import may take it.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
