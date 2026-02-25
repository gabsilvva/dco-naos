import { readFile } from "fs/promises";

import axios from "axios";
import axiosRetry from "axios-retry";
import path from "path";
import JSONbig from "json-bigint";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";

interface Config {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  params?: Record<string, string>;
  data?: any;
  maxRetries?: number;
  timeout?: number;
  auth?: {
    username: string;
    password: string;
  };
}

const JSONbigString = JSONbig({ storeAsString: true });

export async function api(options: Config) {
  const {
    url,
    method = "GET",
    headers,
    params,
    data,
    maxRetries = 3,
    timeout = 30000,
  } = options;

  try {
    const axiosInstance = axios.create({
      timeout,
      responseType: "text",
      transformResponse: (data: any) => {
        try {
          return JSONbigString.parse(data);
        } catch {
          return data;
        }
      },
    });

    axiosRetry(axiosInstance, {
      retries: maxRetries,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error) =>
        axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        (error.response?.status ?? 0) >= 500,
    });

    const response = await axiosInstance.request({
      url,
      method,
      headers,
      params,
      data,
    });

    return response.data;
  } catch (error) {
    console.error(error);
  }
}

export async function mock(url: string) {
  const filePath = path.resolve(url);
  const res = await readFile(filePath, "utf-8");
  return JSONbigString.parse(res);
}

export async function csv(
  id: string,
  gids: Record<string, string>
): Promise<Record<string, any[]>> {
  try {
    const sheets: Record<string, any[]> = {};

    await Promise.all(
      Object.entries(gids).map(async ([sheetName, gid]) => {
        try {
          const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
          const csvRes = await axios.get<Buffer>(url, {
            responseType: "arraybuffer",
          });
          const decoded = iconv.decode(Buffer.from(csvRes.data), "utf-8");
          const records = parse(decoded, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
          });
          sheets[sheetName] = records;
        } catch (error) {
          console.error(
            `Erro ao buscar aba "${sheetName}" (gid: ${gid}):`,
            error
          );
          sheets[sheetName] = [];
        }
      })
    );

    return sheets as Record<string, any[]>;
  } catch (error) {
    console.error("Erro ao buscar CSV:", error);
    throw error;
  }
}