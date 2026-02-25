import { Brand } from "@/types";

export interface ProductTikTok {
  sku_id: string;
  title: string;
  description: string;

  availability:
    | "IN_STOCK"
    | "AVAILABLE"
    | "PREORDER"
    | "OUT_OF_STOCK"
    | "DISCONTINUED";

  condition: "NEW" | "REFURBISHED" | "USED";

  price: number;
  sale_price?: number;

  link: string;
  image_link: string;
  video_link?: string;

  brand: Brand;
  google_product_category?: string;

  additional_image_link?: string;
  age_group?: string;
  gender?: string;
  item_group_id?: string;

  custom_label_0?: string;
  custom_label_1?: string;
  custom_label_2?: string;
  custom_label_3?: string;
  custom_label_4?: string;
}