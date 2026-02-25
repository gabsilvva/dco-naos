import { UUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { Availability, Medias, ProductMeta } from "@service/catalog/meta.types";
import { ProductGoogle } from "@service/catalog/google.types";
import { ProductTikTok } from "@service/catalog/tiktok.types";
import { Creative } from "@/services/creatives/creatives.types";

type ModelName = keyof PrismaClient;

export interface Config {
  products: ModelName;
  leads: ModelName;
}

export interface DatabaseRecord {
  id: UUID;
  crm: string;
  name: string;
  availability: Availability;
  products: { meta: ProductMeta, google: ProductGoogle, tiktok: ProductTikTok };
  creative: Creative;
  medias: Medias;
}