import { config } from "@/ecosystem.config";
import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";
import axios from "axios";

export interface Asset {
  key: string;
  file: string;
  type?: "image" | "video";
}

export interface Svg {
  key: string;
  base64: string;
  w: number;
  h: number;
}

export interface Video {
  key: string;
  path: string;
  url?: string;
}

function normalizeDriveUrl(url: string): string {
  const match = url.match(/\/file\/d\/([^/]+)\//);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  const alt = url.match(/[?&]id=([^&]+)/);
  if (alt && alt[1]) {
    return `https://drive.google.com/uc?export=download&id=${alt[1]}`;
  }
  return url;
}

async function downloadVideo(url: string, outputPath: string): Promise<string> {
  const normalizedUrl = normalizeDriveUrl(url);
  
  const response = await axios.get(normalizedUrl, {
    responseType: "stream",
    timeout: 60000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const writer = require("fs").createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(outputPath));
    writer.on("error", reject);
  });
}

export async function assets(
  assets: Asset[]
): Promise<Record<string, Svg | Video>> {
  const result: Record<string, Svg | Video> = {};
  
  for (const { key, file, type = "image" } of assets) {
    try {
      if (type === "video") {
        if (!file) {
          continue;
        }
        
        const isUrl = /^https?:\/\//.test(file);
        
        if (isUrl) {
          const videoDir = path.resolve("temp", "videos");
          await fs.mkdir(videoDir, { recursive: true });
          
          const videoPath = path.join(videoDir, `${key}_${Date.now()}.mp4`);
          await downloadVideo(file, videoPath);
          
          result[key] = { 
            key, 
            path: videoPath,
            url: file
          };
        } else {
          const filePath = path.join(config.assets, file);
          result[key] = { key, path: filePath };
        }
        
        continue;
      }

      let buffer: Buffer;
      
      if (/^https?:\/\//.test(file)) {
        const url = normalizeDriveUrl(file);
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          timeout: 20000,
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        buffer = Buffer.from(response.data as ArrayBuffer);
      } else {
        const filePath = path.join(config.assets, file);
        buffer = await fs.readFile(filePath);
      }

      const MAX_SIZE = 1200;
      let processedImage = sharp(buffer);
      const metadata = await processedImage.metadata();
      const { width: origWidth = 0, height: origHeight = 0 } = metadata;

      if (origWidth > MAX_SIZE || origHeight > MAX_SIZE) {
        processedImage = processedImage.resize(MAX_SIZE, MAX_SIZE, {
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      let finalBuffer: Buffer;
      let mimeType: string;

      if (/\.png$/i.test(file) || metadata.hasAlpha) {
        finalBuffer = await processedImage
          .png({
            compressionLevel: 9,
            quality: 80,
            adaptiveFiltering: true,
            palette: true,
          })
          .toBuffer();
        mimeType = "image/png";
      } else {
        finalBuffer = await processedImage
          .jpeg({
            quality: 70,
            mozjpeg: true,
            progressive: true,
          })
          .toBuffer();
        mimeType = "image/jpeg";
      }

      const finalMetadata = await sharp(finalBuffer).metadata();
      const { width: w = 0, height: h = 0 } = finalMetadata;

      const base64 = `data:${mimeType};base64,${finalBuffer.toString("base64")}`;

      result[key] = { key, base64, w, h };

    } catch (error: any) {
      console.error(`Erro ao processar "${key}": ${error.message}`);
    }
  }
  
  return result;
}