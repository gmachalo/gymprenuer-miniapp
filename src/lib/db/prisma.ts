import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.warn("[Prisma] DATABASE_URL not set — using unconfigured client");
  }
  // Strip pgbouncer=true — it's a Prisma CLI param, not understood by the pg driver
  const connectionString = (raw ?? "").replace(/[?&]pgbouncer=true/i, "").replace(/[?&]$/, "");
  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: {
      maxWait: 10_000,
      timeout: 15_000,
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

