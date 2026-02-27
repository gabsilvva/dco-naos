import { Config as MINIOConfig } from "@/actions/minio/minio.types";
import { Config as DBConfig } from "@action/database/database.types";
import { Age, Gender } from ".@service/catalog/meta.types";
import { Availability } from "./services/catalog/meta.types";

export type Brand = "BIODERMA" | "ESTHEDERM" | "ETATPUR";

export interface Enterprise {
  name: string;
  url: string;
}

export interface Config extends Enterprise {
  assets: string;
  sheets: {
    id: string;
    tab: string;
  };
  minio: MINIOConfig;
  database: DBConfig;
}

export interface Response {
  id: string;
  name: string;
  brand: Brand;
  availability: Availability;
  price: string;
  gender: Gender;
  age_group: Age;
  link: string;
  text1: string;
  text2: string;
  text3: string;
  text4: string;
  image: string;
  investimento_liquido_total_mes: string;
  cpl_historico: string;
  leads_previstos: string;
}