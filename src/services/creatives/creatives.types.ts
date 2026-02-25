import { Brand } from "@/types";

export interface Identifier {
  id: string;
  timestamp: string;
  brand: Brand;
}

export interface Creative {
  text1: string;
  text2: string;
  text3: string;
  text4: string;
  image: string;
}

export interface Size {
  w: number;
  h: number;
  static: boolean;
}