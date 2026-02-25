import { Enterprise, Config } from "./types";

export const enterprise: Enterprise = {
  name: "NAOS",
  url: "https://naos.com/pt-BR",
};

export const config: Config = {
  ...enterprise,
  assets: "src/assets",
  sheets: {
    id: process.env.GOOGLE_SHEETS_ID || "",
    tab: process.env.GOOGLE_SHEETS_TAB || "",
  },
  minio: {
    folder: `${enterprise.name}`,
    host: process.env.MINIO_HOST || "localhost",
    endpoint: process.env.MINIO_ENDPOINT || "",
    port: parseInt(process.env.MINIO_PORT || "9000"),
    ssl: process.env.MINIO_USE_SSL == "true",
    bucket: process.env.MINIO_BUCKET || "dco",
    access_key: process.env.MINIO_ACCESS_KEY || "",
    secret_key: process.env.MINIO_SECRET_KEY || "",
  },
  database: {
    products: "products",
    leads: "leads",
  }
};