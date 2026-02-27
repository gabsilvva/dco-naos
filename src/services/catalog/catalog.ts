import { create } from "xmlbuilder2";
import { parse } from "json2csv";
import { config, enterprise } from "@/ecosystem.config";
import { GET } from "@action/database/database";
import { uploadCatalog } from "@action/minio/minio";
import { ProductMeta } from "./meta.types";
import { ProductGoogle } from "./google.types";
import { ProductTikTok } from "./tiktok.types";
import { Brand } from "@/types";

function ghostMeta(ghost: { id: string; name: string; brand: Brand; url: string }): ProductMeta {
  return {
    id: ghost.id,
    title: ghost.name,
    description: ghost.name,
    price: "0.00 BRL",
    link: ghost.url,
    availability: "out of stock",
    condition: "used",
    image_link: "https://clientfiles.l0gik.com.br/dco/outofstock.webp",
    brand: ghost.brand,
    inventory: 0,
  };
}

function ghostTikTok(ghost: { id: string; name: string; brand: Brand; url: string }) {
  return {
    sku_id: ghost.id,
    title: ghost.name,
    description: ghost.name,
    availability: "OUT OF STOCK",
    condition: "USED",
    price: "0.00 BRL",
    sale_price: "",
    link: ghost.url,
    image_link: "https://clientfiles.l0gik.com.br/dco/outofstock.webp",
    video_link: "",
    brand: ghost.brand,
    google_product_category: "Beauty > Ecommerce",
    additional_image_link: "https://clientfiles.l0gik.com.br/dco/outofstock.webp",
    age_group: "",
    gender: "",
    item_group_id: "",
    custom_label_0: "",
    custom_label_1: "",
    custom_label_2: "",
    custom_label_3: "",
    custom_label_4: "",
  };
}

export async function catalog() {
  const records = await GET(config.database.products, {
    where: { products: { not: null } },
    orderBy: { updated: "desc" },
  });

  if (!records.data) {
    console.log("⚠️ catalog: sem registros");
    return;
  }

  const data = Array.isArray(records.data) ? records.data : [records.data];

  const ghostResult = await GET("ids");
  const ghostRaw = ghostResult.data
    ? Array.isArray(ghostResult.data) ? ghostResult.data : [ghostResult.data]
    : [];

  const activeIds = new Set(data.map((r: any) => r.crm));
  const ghosts = ghostRaw.filter((g) => !activeIds.has(g.id));

  console.log(`👻 Ghost products: ${ghosts.length} (de ${ghostRaw.length} ids)`);

  await Promise.all([
    meta(data, ghosts),
    google(data),
    tiktok(data, ghosts),
  ]);
}

async function meta(data: any[], ghosts: { id: string; name: string; brand: Brand; url: string }[]) {
  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("listings");

  root.ele("title").txt(enterprise.name);
  root.ele("link").txt(`${config.url}/${config.minio.folder}/meta.xml`);
  root.ele("description").txt(enterprise.name);

  for (const record of data) {
    const meta: ProductMeta = record.products.meta;
    const medias = record.medias;

    const listing = root.ele("listing");

    listing.ele("id").txt(meta.id);
    listing.ele("title").txt(meta.title);
    listing.ele("description").txt(meta.description);
    listing.ele("availability").txt(meta.availability);
    listing.ele("condition").txt(meta.condition);
    listing.ele("price").txt(meta.price);
    listing.ele("link").txt(meta.link);
    listing.ele("brand").txt(meta.brand);

    if (meta.sale_price) listing.ele("sale_price").txt(meta.sale_price);
    if (meta.gender) listing.ele("gender").txt(meta.gender);
    if (meta.age_group) listing.ele("age_group").txt(meta.age_group);

    for (let i = 0; i <= 4; i++) {
      const label = meta[`custom_label_${i}` as keyof ProductMeta];
      if (label) listing.ele(`custom_label_${i}`).txt(String(label));
    }

    const sizes = ["1080x1080", "1080x1350", "1080x1920"];

    for (const img of medias.images) {
      if (!img.tag.some((tag: string) => sizes.includes(tag))) continue;
      const el = listing.ele("image");
      el.ele("url").txt(img.url);
      img.tag.forEach((t: string) => el.ele("tag").txt(t));
    }

    for (const vid of medias.videos) {
      if (!vid.tag.some((tag: string) => sizes.includes(tag))) continue;
      const el = listing.ele("video");
      el.ele("url").txt(vid.url);
      vid.tag.forEach((t: string) => el.ele("tag").txt(t));
    }
  }

  for (const ghost of ghosts) {
    const g = ghostMeta(ghost);
    const listing = root.ele("listing");

    listing.ele("id").txt(g.id);
    listing.ele("title").txt(g.title);
    listing.ele("description").txt(g.description);
    listing.ele("availability").txt(g.availability);
    listing.ele("condition").txt(g.condition);
    listing.ele("price").txt(g.price);
    listing.ele("link").txt(g.link);
    listing.ele("brand").txt(g.brand);
  }

  const xml = root.end({ prettyPrint: true });
  const url = await uploadCatalog(xml, `${config.minio.folder}/meta.xml`, "xml");

  console.log("📘 Meta XML:", url);
}

async function google(data: any[]) {
  const rows: ProductGoogle[] = data.map((r) => r.products.google);
  const fields = Object.keys(rows[0]);
  const csv = parse(rows, { fields });

  const url = await uploadCatalog(csv, `${config.minio.folder}/google.csv`, "csv");

  console.log("📗 Google CSV:", url);
}

async function tiktok(data: any[], ghosts: { id: string; name: string; brand: Brand; url: string }[]) {
  const realRows = data.map((record) => {
    const tiktok: ProductTikTok = record.products.tiktok;

    return {
      sku_id: tiktok.sku_id,
      title: tiktok.title,
      description: tiktok.description,
      availability: tiktok.availability.replace("_", " "),
      condition: tiktok.condition,
      price: `${tiktok.price} BRL`,
      sale_price: tiktok.sale_price ? `${tiktok.sale_price} BRL` : "",
      link: tiktok.link,
      image_link: tiktok.image_link,
      video_link: tiktok.video_link || "",
      brand: tiktok.brand,
      google_product_category: tiktok.google_product_category || "",
      additional_image_link: tiktok.additional_image_link || "",
      age_group: tiktok.age_group || "",
      gender: tiktok.gender || "",
      item_group_id: tiktok.item_group_id || "",
      custom_label_0: tiktok.custom_label_0 || "",
      custom_label_1: tiktok.custom_label_1 || "",
      custom_label_2: tiktok.custom_label_2 || "",
      custom_label_3: tiktok.custom_label_3 || "",
      custom_label_4: tiktok.custom_label_4 || "",
    };
  });

  const ghostRows = ghosts.map(ghostTikTok);
  const rows = [...realRows, ...ghostRows];

  const fields = Object.keys(rows[0]);
  const csv = parse(rows, { fields });

  const url = await uploadCatalog(csv, `${config.minio.folder}/tiktok.csv`, "csv");

  console.log("📕 TikTok CSV:", url);
}