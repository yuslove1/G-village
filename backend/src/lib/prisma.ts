import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: env.isDev ? ["warn", "error"] : ["error"],
  });

if (env.isDev) globalForPrisma.prisma = prisma;

export async function disconnectPrisma() {
  await prisma.$disconnect().catch((e) => logger.error({ err: e }, "prisma disconnect failed"));
}
