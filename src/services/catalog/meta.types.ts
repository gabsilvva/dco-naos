import { Brand } from "@/types";

export type Availability =
  | "in stock"
  | "out of stock"
  | "preorder"
  | "available for order"
  | "discontinued";

export type Condition =
  | "new"
  | "refurbished"
  | "used";

export type Age =
  | "adult"
  | "all ages"
  | "teen"
  | "kids"
  | "toddler"
  | "newborn"
  | "infant";

export type Gender =
  | "female"
  | "male"
  | "unisex";

export interface ProductMeta {
  id: string;
  title: string;
  description: string;
  price: string;
  link: string;
  availability: Availability;
  condition: Condition;
  sale_price?: string;
  brand: Brand;
  gender?: Gender;
  age_group?: Age;
  custom_label_0?: string;
  custom_label_1?: string;
  custom_label_2?: string;
  custom_label_3?: string;
  custom_label_4?: string;
}

export interface Media {
  url: string;
  tag: string[];
}

export interface Medias {
  images: Media[];
  videos: Media[];
}