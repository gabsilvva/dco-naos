import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

export async function db(): Promise<PrismaClient> {
  try {
    if (process.env.NODE_ENV === "production") {
      prisma = new PrismaClient();
    } else {
      if (!global.__prisma) {
        global.__prisma = new PrismaClient();
      }
      prisma = global.__prisma;
    }

    await prisma.$connect();
    return prisma;
  } catch (error) {
    console.error(`Database connection failed:`, error);
    throw error;
  }
}

export async function disconnect(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
  }
}