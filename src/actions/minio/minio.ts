import * as Minio from "minio";
import fs from "fs";
import { stat } from 'fs/promises';
import path from "path";
import { config } from "@/ecosystem.config";

export const ENDPOINT = config.minio.endpoint;
const HOST = config.minio.host;
const PORT = config.minio.port;
const USE_SSL = config.minio.ssl;
const BUCKET_NAME = config.minio.bucket;
const ACCESS_KEY = config.minio.access_key;
const SECRET_KEY = config.minio.secret_key;
const PUBLIC = `${ENDPOINT}/${BUCKET_NAME}`;

if (!ACCESS_KEY || !SECRET_KEY || !BUCKET_NAME || !ENDPOINT) {
  throw new Error("MinIO credentials and bucket name are required");
}

const minioClient = new Minio.Client({
  endPoint: HOST,
  port: PORT,
  useSSL: USE_SSL,
  accessKey: ACCESS_KEY,
  secretKey: SECRET_KEY,
});

async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      console.warn(`Tentativa ${attempt} falhou:`, error.message);

      if (attempt < maxRetries) {
        const waitTime = delay * Math.pow(2, attempt - 1);
        console.log(`Aguardando ${waitTime}ms antes da próxima tentativa...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError;
}

function getFileUrl(key: string): string {
  return `${PUBLIC}/${key}`;
}

export async function uploadCatalog(
  content: string | Buffer,
  key: string,
  fileType: 'csv' | 'xml'
): Promise<string> {
  try {
    const buffer = Buffer.isBuffer(content) 
      ? content 
      : Buffer.from(content, "utf-8");
    
    const metaData = fileType === 'xml' 
      ? {
          "Content-Type": "application/xml",
          "Content-Disposition": "inline",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        }
      : {
          "Content-Type": "text/csv",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        };
    
    await minioClient.putObject(
      config.minio.bucket,
      key,
      buffer,
      buffer.length,
      metaData
    );
    
    const fileUrl = getFileUrl(key);
    return fileUrl;
  } catch (error: any) {
    console.error(`❌ Erro ao enviar ${fileType.toUpperCase()} para MinIO:`, error.message);
    throw error;
  }
}

export async function uploadFile(filePath: string, key: string): Promise<any> {
  try {
    return await retryOperation(async () => {
      const fileStats = await stat(filePath);
      const fileStream = fs.createReadStream(filePath);
      
      let contentType: string = "application/octet-stream";
      const extension: string = path.extname(filePath).toLowerCase();
      
      if (extension === ".png") {
        contentType = "image/png";
      } else if (extension === ".jpg" || extension === ".jpeg") {
        contentType = "image/jpeg";
      } else if (extension === ".gif") {
        contentType = "image/gif";
      } else if (extension === ".pdf") {
        contentType = "application/pdf";
      } else if (extension === ".mp4") {
        contentType = "video/mp4";
      } else if (extension === ".webp") {
        contentType = "image/webp";
      } else if (extension === ".svg") {
        contentType = "image/svg+xml";
      }
      
      const metaData = {
        "Content-Type": contentType,
      };
      
      await minioClient.putObject(
        BUCKET_NAME!,
        key,
        fileStream,
        fileStats.size,
        metaData
      );
      
      const fileUrl = getFileUrl(key);
      return fileUrl;
    });
  } catch (error: any) {
    console.error("Erro ao fazer upload para o MinIO:", error);
    throw error;
  }
}

export async function uploadVideo(filePath: string, key: string): Promise<any> {
  try {
    return await retryOperation(async () => {
      const fileStats = await stat(filePath);
      const fileStream = fs.createReadStream(filePath);
      const fileName = key.split("/").pop();
      
      const metaData = {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      };
      
      await minioClient.putObject(
        BUCKET_NAME!,
        key,
        fileStream,
        fileStats.size,
        metaData
      );
      
      const fileUrl = getFileUrl(key);
      return fileUrl;
    });
  } catch (error: any) {
    console.error("Erro ao fazer upload para o MinIO:", error);
    throw error;
  }
}

export async function deleteFile(key: string): Promise<void> {
  try {
    await retryOperation(async () => {
      await minioClient.removeObject(BUCKET_NAME!, key);
      console.log(`Arquivo "${key}" deletado com sucesso`);
    });
  } catch (error: any) {
    console.error("Erro ao deletar arquivo do MinIO:", error);
    throw error;
  }
}

export async function createFolder(folderName: string): Promise<any> {
  try {
    return await retryOperation(async () => {
      if (!folderName.endsWith("/")) {
        folderName = `${folderName}/`;
      }

      const metaData = {
        "Content-Type": "application/x-directory",
      };

      await minioClient.putObject(
        BUCKET_NAME!,
        folderName,
        Buffer.from(""),
        0,
        metaData
      );

      const folderUrl = getFileUrl(folderName);
      console.log(`Pasta "${folderName}" criada com sucesso`);
      return folderUrl;
    });
  } catch (error: any) {
    console.error("Erro ao criar pasta no MinIO:", error);
    throw error;
  }
}

export async function deleteFolder(folderName: string): Promise<void> {
  try {
    await retryOperation(async () => {
      folderName = folderName.endsWith("/") ? folderName : `${folderName}/`;

      const objectsList: string[] = [];
      const objectsStream = minioClient.listObjects(
        BUCKET_NAME!,
        folderName,
        true
      );

      for await (const obj of objectsStream) {
        if (obj.name) {
          objectsList.push(obj.name);
        }
      }

      if (objectsList.length === 0) {
        console.log(`Pasta "${folderName}" está vazia ou não existe.`);
        return;
      }

      await minioClient.removeObjects(BUCKET_NAME!, objectsList);
      console.log(
        `Pasta "${folderName}" e seu conteúdo foram deletados com sucesso.`
      );
    });
  } catch (error: any) {
    console.error("❌ Erro ao deletar pasta do MinIO:", error);
    throw error;
  }
}

export async function listFolders(folderName: string): Promise<string[]> {
  try {
    return await retryOperation(async () => {
      if (!folderName.endsWith("/")) folderName = `${folderName}/`;

      const folders: string[] = [];
      const objectsStream = minioClient.listObjects(
        BUCKET_NAME!,
        folderName,
        false,
        { IncludeVersion: false }
      );

      for await (const obj of objectsStream) {
        if (obj.prefix && obj.prefix !== folderName) {
          folders.push(obj.prefix);
        }
      }

      return folders;
    });
  } catch (error: any) {
    console.error("Erro ao listar pastas no MinIO:", error);
    return [];
  }
}

export async function listFiles(folderName: string): Promise<any> {
  try {
    return await retryOperation(async () => {
      if (!folderName.endsWith("/")) {
        folderName = `${folderName}/`;
      }

      const files: any[] = [];
      const subfolders: any[] = [];

      const objectsStream = minioClient.listObjects(
        BUCKET_NAME!,
        folderName,
        false
      );

      for await (const obj of objectsStream) {
        if (obj.prefix && obj.prefix !== folderName) {
          subfolders.push({
            key: obj.prefix,
            isFolder: true,
            url: getFileUrl(obj.prefix),
          });
        } else if (obj.name && obj.name !== folderName) {
          files.push({
            key: obj.name,
            size: obj.size,
            lastModified: obj.lastModified,
            url: getFileUrl(obj.name),
          });
        }
      }

      return [...files, ...subfolders];
    });
  } catch (error: any) {
    console.error("Erro ao listar arquivos no MinIO:", error);
    throw error;
  }
}