import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton for Next.js hot-reload and Fluid Compute reuse.
 * The connection pool lives in PostgreSQL — never in module state that we
 * treat as authoritative.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
