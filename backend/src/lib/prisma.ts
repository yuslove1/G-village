import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev ? ["warn", "error"] : ["error"],
  });

if (env.isDev) globalForPrisma.prisma = prisma;

export async function disconnectPrisma() {
  await prisma.$disconnect().catch((e) => logger.error({ err: e }, "prisma disconnect failed"));
}
