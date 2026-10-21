import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

import { getEnv } from "../config/env.js";

/**
 * The Prisma service.
 *
 * Prisma 7 requires a **driver adapter**: the client no longer opens a
 * connection itself, it is handed one. This service builds the `pg` adapter
 * from `DATABASE_URL` and hands it to the client.
 *
 * There is no `@nestjs/prisma` package for NestJS 12 (it still targets
 * NestJS 10/11), so the service is written by hand. It is deliberately thin:
 * connect on init, disconnect on destroy, expose the client as `prisma`.
 *
 * ```ts
 * constructor(private readonly prisma: PrismaService) {}
 * const site = await this.prisma.parkingSite.findUnique({ where: { id } });
 * ```
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const env = getEnv();

    super({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    });
  }

  /** Open the connection pool when the module initialises. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Close the connection pool when the module is destroyed. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
