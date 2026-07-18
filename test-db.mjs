import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString =
  "postgresql://postgres.vabqqozdnhzeibcxmdoz:SMCebW5j5A9eobtw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";

const adapter = new PrismaPg({
  connectionString,
  max: 5,
  connectionTimeoutMillis: 10_000,
});

const prisma = new PrismaClient({ adapter });

try {
  const result = await prisma.$queryRawUnsafe("SELECT 1 as ok");
  console.log("SUCCESS:", result);
} catch (e) {
  console.error("FAIL:", e.message);
} finally {
  await prisma.$disconnect();
  process.exit(0);
}
