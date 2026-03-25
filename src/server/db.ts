import { PrismaClient } from "@prisma/client";
import { serverEnv } from "@/lib/env/server";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: serverEnv.databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
