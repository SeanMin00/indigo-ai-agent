import { serverEnv } from "@/lib/env/server";

void serverEnv.databaseUrl;

// Prisma client generation and module resolution are still being stabilized in this scaffold.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient: PrismaClientCtor } = require("@prisma/client") as {
  PrismaClient: new () => {
    $disconnect(): Promise<void>;
  };
};

type PrismaClientInstance = InstanceType<typeof PrismaClientCtor>;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClientInstance;
};

export const db = globalForPrisma.prisma ?? new PrismaClientCtor();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
