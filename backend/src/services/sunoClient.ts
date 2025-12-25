/**
 * Клиент для работы с Suno API
 * Генерирует музыку по промпту
 */

import axios, { AxiosInstance } from "axios";
import { Logger } from "../utils/logger";
import * as fs from "fs/promises";
import * as path from "path";

export interface SunoTrackResult {
  audioUrl: string;
  title?: string;
  duration?: number;
  metadata?: any;
}

export class SunoClient {
  private apiKey: string;
  private apiBaseUrl: string;
  private client: AxiosInstance;

  constructor() {
    this.apiKey = process.env.SUNO_API_KEY || "";
    this.apiBaseUrl = process.env.SUNO_API_BASE_URL || "https://api.suno.ai";

    if (!this.apiKey) {
      Logger.warn("[SunoClient] SUNO_API_KEY not set, music generation will fail");
    }

    this.client = axios.create({
      baseURL: this.apiBaseUrl,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 300000 // 5 минут для генерации музыки
    });

    Logger.info("[SunoClient] Initialized", {
      apiBaseUrl: this.apiBaseUrl,
      hasApiKey: !!this.apiKey
    });
  }

  /**
   * Создать трек через Suno API
   * @param prompt - Промпт для генерации музыки
   * @param styleTags - Опциональные теги стиля
   * @returns URL аудио файла и метаданные
   */
  async createTrack(prompt: string, styleTags?: string[]): Promise<SunoTrackResult> {
    if (!this.apiKey) {
      throw new Error("SUNO_API_KEY is not configured");
    }

    Logger.info("[SunoClient] Creating track", {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + "...",
      styleTags: styleTags || []
    });

    try {
      // Формируем полный промпт с тегами стиля
      let fullPrompt = prompt;
      if (styleTags && styleTags.length > 0) {
        const tagsStr = styleTags.join(", ");
        fullPrompt = `${prompt} [${tagsStr}]`;
      }

      // Вызываем API для создания трека
      // Примечание: структура API может отличаться, нужно адаптировать под реальный API Suno
      const response = await this.client.post("/v1/generate", {
        prompt: fullPrompt,
        make_instrumental: false,
        wait_audio: true
      });

      const audioUrl = response.data.audio_url || response.data.url;
      if (!audioUrl) {
        throw new Error("Suno API did not return audio URL");
      }

      Logger.info("[SunoClient] Track created successfully", {
        audioUrl: audioUrl.substring(0, 100) + "...",
        title: response.data.title,
        duration: response.data.duration
      });

      return {
        audioUrl,
        title: response.data.title,
        duration: response.data.duration,
        metadata: response.data
      };
    } catch (error: any) {
      Logger.error("[SunoClient] Failed to create track", {
        error: error?.message || String(error),
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data
      });
      throw new Error(`Suno API error: ${error?.message || "Unknown error"}`);
    }
  }

  /**
   * Скачать аудио файл по URL
   * @param audioUrl - URL аудио файла
   * @param destPath - Путь для сохранения
   * @returns Путь к сохраненному файлу
   */
  async downloadAudio(audioUrl: string, destPath: string): Promise<string> {
    Logger.info("[SunoClient] Downloading audio", {
      audioUrl: audioUrl.substring(0, 100) + "...",
      destPath
    });

    try {
      // Создаём директорию если нужно
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Скачиваем файл
      const response = await axios({
        method: "GET",
        url: audioUrl,
        responseType: "stream",
        timeout: 300000 // 5 минут
      });

      const writer = (await import("fs")).createWriteStream(destPath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      Logger.info("[SunoClient] Audio downloaded", {
        destPath,
        fileSize: (await fs.stat(destPath)).size
      });

      return destPath;
    } catch (error: any) {
      Logger.error("[SunoClient] Failed to download audio", {
        audioUrl: audioUrl.substring(0, 100) + "...",
        destPath,
        error: error?.message || String(error)
      });
      throw new Error(`Failed to download audio: ${error?.message || "Unknown error"}`);
    }
  }
}

// Singleton instance
let sunoClientInstance: SunoClient | null = null;

export function getSunoClient(): SunoClient {
  if (!sunoClientInstance) {
    sunoClientInstance = new SunoClient();
  }
  return sunoClientInstance;
}

