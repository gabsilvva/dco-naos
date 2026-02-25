import { Brand } from "@/types";

export interface ProductTikTok {
  sku_id: string;
  title: string;
  description: string;
  availability:
    | "IN_STOCK"
    | "AVAILABLE_FOR_ORDER"
    | "PREORDER"
    | "OUT_OF_STOCK"
    | "DISCONTINUED";
  google_product_category: string;
  brand: Brand;
  image_url: string;
  video_url: string;
  product_detail: {
    condition: "NEW" | "REFURBISHED" | "USED";
  };
  price_info: {
    price: number;
  };
  landing_page: {
    landing_page_url: string;
  };
  custom_label_0?: string;
  custom_label_1?: string;
  custom_label_2?: string;
  custom_label_3?: string;
  custom_label_4?: string;
}