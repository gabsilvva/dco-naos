import "dotenv/config";

import { randomUUID } from "crypto";
import { DateTime } from "luxon";

import { config } from "@/ecosystem.config";
import { Response } from "./types";

import { UPSERT, UPDATE, GET, DELETE } from "@action/database/database";
import { DatabaseRecord } from "@action/database/database.types";

import { catalog } from "@service/catalog/catalog";
import { ProductMeta, Medias } from "@service/catalog/meta.types";
import { ProductTikTok } from "@service/catalog/tiktok.types";
import { ProductGoogle } from "@service/catalog/google.types";

import { deleteFolder } from "@action/minio/minio";

import { fonts, bioderma, esthederm, etatpur } from "@service/creatives/creatives";
import { Identifier, Creative } from "@service/creatives/creatives.types";

import { font } from "@helper/font";
import { rules } from "@helper/rules";
import { csv } from "@helper/fetch";

export async function reset() {
  try {
    await UPDATE(config.database.products, {}, { availability: "out of stock" });
    await catalog();
    console.log("Availability resetado para 'out of stock'");
  } catch (error) {
    console.error("[RESET] Erro:", error);
  }
}

async function deletion(data: Response[]) {
  try {
    const existing = await GET(config.database.products);
    
    const ids = new Set(data.map((item) => item.id.replace(/\D/g, "")));
    
    const existingRecords = Array.isArray(existing.data)
      ? existing.data
      : [existing.data];

    for (const record of existingRecords) {
      const { crm, name } = record;
      
      const normalizedCrm = crm.replace(/\D/g, "");

      if (!ids.has(normalizedCrm)) {
        await DELETE(config.database.products, { crm });
        await deleteFolder(`${config.minio.folder}/${crm}`);
        console.log("Removido:", crm, name);
      }
    }
  } catch (error) {
    console.log("Não foi possível buscar registros no banco", error);
  }
}

export async function process() {
  console.log("🎯 Processando...", new Date());
  console.log("\n");

  const now = DateTime.now().setZone("America/Sao_Paulo");
  const hour = now.hour;
  const minute = now.minute;

  if (hour === 0 && minute <= 30) {
    await reset();
  }

  try {
    const response = await csv(config.sheets.id, { sheet: config.sheets.tab });
    const data: { sheet: Response[] } = { sheet: response[config.sheets.tab] || response.sheet || [] };

    await deletion(data.sheet);

    for (const value of data.sheet) {
      const { id: crm, leads_previstos, name, brand, gender, age_group } = value;

      if (!crm || !leads_previstos) {
        console.warn("Faltou ID ou Leads previstos na planilha.");
        continue;
      }

      const rule = await rules({ id: crm, goal: leads_previstos });
      const item = value;

      const productMeta: ProductMeta = {
        id: crm,
        title: item.name,
        description: item.name,
        price: item.price ? `${parseFloat(item.price.toString().replace(/[^\d.,]/g, "").replace(",", ".")).toFixed(2)} BRL` : "0.00 BRL",
        link: item.link || config.url,
        availability: item.availability === "out of stock"
          ? "out of stock"
          : rule.availability,
        condition: "new",
        brand,
        gender,
        age_group,
      };

      const existing = await GET(config.database.products, {
        where: { crm },
        first: true,
      });

      if (rule.availability === "out of stock") {
        console.log("\n");
        await UPDATE(
          config.database.products,
          { crm },
          { availability: rule.availability }
        );
        console.log(`${name}: Bateu a meta ${rule.type_goal}`);
        continue;
      }

      try {
        if (existing.data?.availability === "off_market") {
          console.log(`${name}: Já arquivado hoje, aguardando reset`);
          continue;
        }

        const normalizeValue = (value: any): string => {
          if (value === null || value === undefined) return "";
          return String(value).trim().toUpperCase();
        };

        const creative: Creative = {
          text1: item.text1,
          text2: item.text2,
          text3: item.text3,
          text4: item.text4,
          image: item.image,
        };

        const hasCreativeChanges =
          !existing.data ||
          !existing.data.products ||
          normalizeValue(existing.data.creative.text1) !== normalizeValue(item.text1) ||
          normalizeValue(existing.data.creative.text2) !== normalizeValue(item.text2) ||
          normalizeValue(existing.data.creative.text3) !== normalizeValue(item.text3) ||
          normalizeValue(existing.data.creative.text4) !== normalizeValue(item.text4) ||
          normalizeValue(existing.data.creative.image) !== normalizeValue(item.image);

        const priceValue = item.price ? parseFloat(item.price.toString().replace(/[^\d.,]/g, "").replace(",", ".")) : 0;
        const formattedPrice = priceValue ? `R$ ${priceValue.toFixed(2).replace(".", ",")}` : "R$ 0,00";

        // --- Geração de criativos (apenas se houver mudança no criativo) ---
        let allMedias: Medias;

        if (hasCreativeChanges) {
          console.log(`🔄 Mudança no criativo detectada: ${crm} - ${name}`);

          const init = new Date();
          const identifier: Identifier = {
            id: crm,
            timestamp: init.getTime().toString(),
            brand,
          };

          if (brand === "BIODERMA") {
            allMedias = await bioderma(identifier, creative);
          } else if (brand === "ESTHEDERM") {
            allMedias = await esthederm(identifier, creative);
          } else if (brand === "ETATPUR") {
            allMedias = await etatpur(identifier, creative);
          } else {
            console.log("Nenhum template para essa marca:", brand);
            allMedias = { images: [], videos: [] };
          }

          if (allMedias.videos.length === 0) {
            console.log("Não conseguiu gerar vídeos.");
            continue;
          }

          console.log(`✓ Criativos gerados: ${name}`, init, "-", new Date());
        } else {
          // Reutiliza as mídias já salvas no banco
          console.log(`♻️  Sem mudança no criativo, reutilizando mídias: ${crm} - ${name}`);
          allMedias = existing.data.medias ?? { images: [], videos: [] };
        }

        // --- Montagem dos produtos (sempre atualizado) ---
        const platformTags = {
          meta: ['1080x1080', '1080x1350', '1080x1920'],
          google: ['160x600', '300x250', '728x90'],
          tiktok: ['1080x1920'],
        };

        const filterAndExtract = (platform: keyof typeof platformTags) => {
          const tags = platformTags[platform];
          return {
            images: allMedias.images.filter(m => m.tag.some(t => tags.includes(t))).map(m => m.url),
            videos: allMedias.videos.filter(m => m.tag.some(t => tags.includes(t))).map(m => m.url),
          };
        };

        const metaUrls = filterAndExtract('meta');
        const googleUrls = filterAndExtract('google');
        const tiktokUrls = filterAndExtract('tiktok');

        const productGoogle: ProductGoogle = {
          ID: crm,
          ID2: crm,
          "Item title": item.name || "",
          "Final URL": item.link || config.url,
          "Image URL": googleUrls.images[0] || "",
          "Additional Image URL": googleUrls.images.slice(1).join(", ") || "",
          "Item subtitle": item.text1,
          "Item description": item.text2,
          "Item category": item.gender,
          Price: formattedPrice,
          "Sale price": formattedPrice,
          "Contextual keywords": `${item.gender || ""}, ${item.age_group || ""}, ${item.name}`,
          "Formatted price": formattedPrice,
          "Formatted sale price": formattedPrice,
        };

        const availabilityMap: Record<string, ProductTikTok["availability"]> = {
          'in stock': 'IN_STOCK',
          'available for order': 'AVAILABLE',
          'out of stock': 'OUT_OF_STOCK',
          'discontinued': 'DISCONTINUED'
        };

        const productTikTok: ProductTikTok = {
          sku_id: crm,
          title: item.name,
          description: item.name,

          availability: availabilityMap[productMeta.availability] || "IN_STOCK",
          condition: "NEW",

          price: priceValue,
          sale_price: undefined,

          link: item.link || config.url,
          image_link: tiktokUrls.images[0] || "",
          video_link: tiktokUrls.videos[0] || "",

          brand,
          google_product_category: "Beauty > Ecommerce",

          age_group: item.age_group || "",
          gender: item.gender || "",

          custom_label_0: "",
          custom_label_1: "",
          custom_label_2: "",
          custom_label_3: "",
          custom_label_4: "",
        };

        const products = {
          meta: productMeta,
          google: productGoogle,
          tiktok: productTikTok,
        };

        const mediasData = {
          images: allMedias.images,
          videos: allMedias.videos,
        };

        // --- Upsert sempre executado ---
        const record: DatabaseRecord = {
          id: existing.data?.id ?? randomUUID(),
          crm,
          name: productMeta.title,
          availability: rule.availability,
          products,
          creative,
          medias: mediasData,
        };

        const upsert = await UPSERT(
          config.database.products,
          { crm },
          record,
          record
        );

        if (upsert.data) {
          console.log(`✓ Banco atualizado: ${name}`);
          console.log(`  - Meta: ${metaUrls.videos.length} vídeos, ${metaUrls.images.length} imagens`);
          console.log(`  - Google: ${googleUrls.videos.length} vídeos, ${googleUrls.images.length} imagens`);
          console.log(`  - TikTok: ${tiktokUrls.videos.length} vídeos, ${tiktokUrls.images.length} imagens`);
          console.log("\n");
        } else {
          console.log(`✗ Falha ao atualizar banco: ${name}`);
        }

      } catch (error) {
        console.error(`Erro no processamento de ${name}:`, error);
      }
    }

    await catalog();

    console.log("✅ Processamento concluído!", new Date());
  } catch (error: any) {
    console.error("Erro no processamento:", error.message);
  }
}

(async () => {
  await font(fonts);
  await process();
})();