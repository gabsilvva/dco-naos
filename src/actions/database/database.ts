import { db } from "./client";
import { Prisma, PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

type ModelName = keyof PrismaClient;

function toJson(value: any): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
  return value as Prisma.InputJsonValue;
}

function normalizeData(data: any): any {
  if (!data || typeof data !== "object") return data;

  const normalized: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" || value === null) {
      normalized[key] = toJson(value);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

async function getPrisma(): Promise<PrismaClient> {
  if (!prisma) {
    prisma = await db();
  }
  return prisma;
}

export async function INSERT(table: ModelName, data: any) {
  try {
    const prisma = await getPrisma();
    const result = await (prisma as any)[String(table)].create({
      data: normalizeData(data),
    });
    return {
      success: true,
      data: result,
      message: `Registro criado em ${String(table)}`,
    };
  } catch (error) {
    console.error(`Erro ao inserir em ${String(table)}:`, error);
    return {
      success: false,
      error,
      message: `Falha ao criar registro em ${String(table)}`,
    };
  }
}

export async function UPDATE(table: ModelName, where: any, data: any) {
  try {
    const prisma = await getPrisma();
    const result = await (prisma as any)[String(table)].update({
      where,
      data: normalizeData(data),
    });
    return {
      success: true,
      data: result,
      message: `Registro atualizado em ${String(table)}`,
    };
  } catch (error) {
    console.error(`Erro ao atualizar ${String(table)}:`, error);
    return {
      success: false,
      error,
      message: `Falha ao atualizar registro em ${String(table)}`,
    };
  }
}

export async function UPSERT(
  table: ModelName,
  where: any,
  create: any,
  update: any
) {
  try {
    const prisma = await getPrisma();
    const result = await (prisma as any)[String(table)].upsert({
      where,
      create: normalizeData(create),
      update: normalizeData(update),
    });
    return {
      success: true,
      data: result,
      message: `Registro upserted em ${String(table)}`,
    };
  } catch (error) {
    console.error(`Erro ao upsert em ${String(table)}:`, error);
    return {
      success: false,
      error,
      message: `Falha ao upsert registro em ${String(table)}`,
    };
  }
}

export async function DELETE(table: ModelName, where: any) {
  try {
    const prisma = await getPrisma();
    const result = await(prisma as any)[String(table)].deleteMany({ where });
    return {
      success: true,
      data: result,
      message: `Registro deletado de ${String(table)}`,
    };
  } catch (error) {
    console.error(`Erro ao deletar de ${String(table)}:`, error);
    return {
      success: false,
      error,
      message: `Falha ao deletar registro de ${String(table)}`,
    };
  }
}

export async function GET(
  table: ModelName,
  options?: {
    where?: any;
    select?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
    unique?: boolean;
    first?: boolean;
    field?: string;
    value?: any;
  }
) {
  try {
    const prisma = await getPrisma();

    let whereClause = options?.where || {};
    if (options?.field && options?.value !== undefined) {
      whereClause = { ...whereClause, [options.field]: options.value };
    }

    let result;
    if (options?.unique) {
      result = await (prisma as any)[String(table)].findUnique({
        where: whereClause,
        select: options?.select,
        include: options?.include,
      });
    } else if (options?.first) {
      result = await (prisma as any)[String(table)].findFirst({
        where: whereClause,
        select: options?.select,
        include: options?.include,
        orderBy: options?.orderBy,
      });
    } else {
      result = await (prisma as any)[String(table)].findMany({
        where: whereClause,
        select: options?.select,
        include: options?.include,
        orderBy: options?.orderBy,
        take: options?.take,
        skip: options?.skip,
      });
    }

    return {
      success: true,
      data: result,
      count: Array.isArray(result) ? result.length : result ? 1 : 0,
      message: result
        ? `Registro(s) obtido(s) de ${String(table)}`
        : `Nenhum registro encontrado em ${String(table)}`,
    };
  } catch (error) {
    console.error(`Erro ao obter de ${String(table)}:`, error);
    return {
      success: false,
      error,
      message: `Falha ao obter registros de ${String(table)}`,
    };
  }
}