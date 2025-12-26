/**
 * Клиент для работы с Suno API
 * Генерирует музыку по промпту
 * 
 * Особенности:
 * - Retry с exponential backoff для 503/502/504/429
 * - Подробное логирование ошибок (без ключей)
 * - Настраиваемые таймауты
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { Logger } from "../utils/logger";
import * as fs from "fs/promises";
import * as path from "path";

export interface SunoTrackResult {
  audioUrl: string;
  title?: string;
  duration?: number;
  metadata?: any;
}

export interface SunoGenerateOptions {
  prompt: string;
  customMode?: boolean;
  style?: string;
  title?: string;
  instrumental?: boolean;
  model?: string;
  callBackUrl?: string;
}

export interface SunoGenerateResponse {
  taskId: string;
  code: number;
  msg: string;
  data?: any;
}

export interface SunoRecordInfo {
  status: "PENDING" | "GENERATING" | "SUCCESS" | "FAILED";
  audioUrl?: string;
  title?: string;
  duration?: number;
  id?: string;
  errorMessage?: string;
  tracks?: Array<{
    audio_url?: string;
    audioUrl?: string;
    id?: string;
    title?: string;
    duration?: number;
  }>;
  metadata?: any;
}

export interface SunoCreditsResponse {
  credits: number;
  code: number;
  msg: string;
}

export interface SunoJobResult {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  audioUrl?: string;
  title?: string;
  duration?: number;
  error?: string;
  metadata?: any;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

export class SunoClient {
  private apiKey: string;
  private apiBaseUrl: string;
  private client: AxiosInstance;
  private requestTimeout: number;
  private retryConfig: RetryConfig;

  constructor() {
    this.apiKey = process.env.SUNO_API_KEY || "";
    // По умолчанию используем https://api.sunoapi.org согласно документации
    this.apiBaseUrl = process.env.SUNO_API_BASE_URL || "https://api.sunoapi.org";
    // Таймаут для запроса к Suno (60-90 секунд, по умолчанию 90)
    this.requestTimeout = Number(process.env.SUNO_REQUEST_TIMEOUT_MS) || 90000;

    if (!this.apiKey) {
      Logger.warn("[MusicClips][Suno] SUNO_API_KEY not set, music generation will fail");
    }

    this.client = axios.create({
      baseURL: this.apiBaseUrl,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: this.requestTimeout
    });

    // Конфигурация retry
    this.retryConfig = {
      maxRetries: 5,
      baseDelayMs: 1000, // 1 секунда
      maxDelayMs: 30000, // 30 секунд максимум
      retryableStatuses: [503, 502, 504, 429] // Retry для этих статусов
    };

    Logger.info("[MusicClips][Suno] SunoClient initialized", {
      apiBaseUrl: this.apiBaseUrl,
      hasApiKey: !!this.apiKey,
      requestTimeout: this.requestTimeout
    });
  }

  /**
   * Проверить, настроен ли API ключ
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  /**
   * Вычислить задержку для retry с exponential backoff + jitter
   */
  private calculateRetryDelay(attempt: number, retryAfter?: number): number {
    if (retryAfter) {
      // Если Suno вернул Retry-After, используем его (но не больше maxDelayMs)
      return Math.min(retryAfter * 1000, this.retryConfig.maxDelayMs);
    }

    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    
    // Добавляем jitter (случайное значение от 0 до 20% задержки)
    const jitter = Math.random() * exponentialDelay * 0.2;
    
    // Ограничиваем максимумом
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs);
  }

  /**
   * Проверить, нужно ли делать retry для данного статуса
   */
  private shouldRetry(status: number | undefined, attempt: number): boolean {
    if (attempt >= this.retryConfig.maxRetries) {
      return false;
    }

    if (!status) {
      // Сетевые ошибки - делаем retry
      return true;
    }

    // Retry для 503, 502, 504, 429
    if (this.retryConfig.retryableStatuses.includes(status)) {
      return true;
    }

    // Не делаем retry для 4xx (кроме 429)
    if (status >= 400 && status < 500 && status !== 429) {
      return false;
    }

    // Для остальных ошибок не делаем retry
    return false;
  }

  /**
   * Логировать ошибку Suno API (без ключей)
   */
  private logSunoError(error: AxiosError, context: string): void {
    const response = error.response;
    const status = response?.status;
    const statusText = response?.statusText;
    const data = response?.data;
    const headers = response?.headers;
    const config = error.config;

    // Формируем финальный URL
    const finalUrl = config?.url 
      ? `${this.apiBaseUrl}${config.url.startsWith("/") ? config.url : "/" + config.url}`
      : `${this.apiBaseUrl}${config?.url || ""}`;

    // Безопасное логирование заголовков (исключаем Authorization)
    const safeHeaders: Record<string, string> = {};
    if (headers) {
      Object.keys(headers).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (lowerKey !== "authorization" && lowerKey !== "x-api-key") {
          safeHeaders[key] = String(headers[key]);
        }
      });
    }

    // Логируем response body (до 4KB)
    let responseBodyStr: string | undefined;
    if (data) {
      if (typeof data === "object") {
        responseBodyStr = JSON.stringify(data).substring(0, 4096);
      } else {
        responseBodyStr = String(data).substring(0, 4096);
      }
    }

    Logger.error(`[MusicClips][Suno] ${context}`, {
      error: error.message,
      status,
      statusText,
      finalUrl,
      method: config?.method?.toUpperCase() || "POST",
      responseBody: responseBodyStr,
      headers: Object.keys(safeHeaders).length > 0 ? safeHeaders : undefined,
      baseURL: this.apiBaseUrl,
      endpoint: config?.url
    });
  }

  /**
   * Извлечь jobId из ответа Suno (поддержка различных форматов)
   */
  private extractJobId(data: any): string | null {
    if (!data) return null;
    
    return data.jobId || 
           data.job_id || 
           data.data?.jobId || 
           data.data?.job_id ||
           null;
  }

  /**
   * Извлечь audioUrl из ответа Suno (поддержка различных форматов)
   */
  private extractAudioUrl(data: any): string | null {
    if (!data) return null;

    // Прямые поля
    if (data.audio_url) return data.audio_url;
    if (data.audioUrl) return data.audioUrl;
    if (data.url) return data.url;
    if (data.audio) return data.audio;

    // В массиве clips
    if (Array.isArray(data.clips) && data.clips.length > 0) {
      const clip = data.clips[0];
      return clip.audio_url || clip.audioUrl || clip.url || null;
    }

    // В массиве data
    if (Array.isArray(data.data) && data.data.length > 0) {
      const item = data.data[0];
      return item.audio_url || item.audioUrl || item.url || null;
    }

    // В объекте result
    if (data.result?.audio_url) return data.result.audio_url;
    if (data.result?.audioUrl) return data.result.audioUrl;

    // В объекте assets
    if (data.assets?.audio) return data.assets.audio;

    return null;
  }

  /**
   * Получить количество кредитов Suno
   */
  async getCredits(): Promise<SunoCreditsResponse> {
    if (!this.isConfigured()) {
      throw new Error("SUNO_API_KEY is not configured");
    }

    const endpoint = "/api/v1/get-credits";
    const finalUrl = `${this.apiBaseUrl}${endpoint}`;

    Logger.info("[MusicClips][Suno] Getting credits", {
      finalUrl
    });

    try {
      const response = await this.client.get(endpoint);

      // Безопасное логирование ответа
      const responseBodyStr = typeof response.data === "object" 
        ? JSON.stringify(response.data, null, 2).substring(0, 4096)
        : String(response.data).substring(0, 4096);

      Logger.info("[MusicClips][Suno] Credits response", {
        status: response.status,
        responseBody: responseBodyStr
      });

      return {
        credits: response.data?.credits || response.data?.data?.credits || 0,
        code: response.data?.code || response.status,
        msg: response.data?.msg || response.data?.message || "success"
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;
      this.logSunoError(axiosError, "Failed to get credits");

      const finalError = new Error(`Failed to get credits: ${error?.message || "Unknown error"}`) as Error & { code?: string };
      finalError.code = "SUNO_ERROR";
      throw finalError;
    }
  }

  /**
   * Создать задачу генерации музыки (возвращает taskId)
   */
  async generate(options: SunoGenerateOptions): Promise<SunoGenerateResponse> {
    if (!this.isConfigured()) {
      const error = new Error("SUNO_API_KEY is not configured") as Error & { code?: string };
      error.code = "SUNO_API_KEY_NOT_CONFIGURED";
      throw error;
    }

    const endpoint = "/api/v1/generate";
    const finalUrl = `${this.apiBaseUrl}${endpoint}`;

    Logger.info("[MusicClips][Suno] Generating track", {
      promptLength: options.prompt.length,
      promptPreview: options.prompt.substring(0, 100) + "...",
      customMode: options.customMode,
      style: options.style,
      model: options.model,
      finalUrl
    });

    try {
      const payload: any = {
        prompt: options.prompt,
        customMode: options.customMode ?? false,
        instrumental: options.instrumental ?? false,
        model: options.model || "V4_5ALL"
      };

      if (options.style) {
        payload.style = options.style;
      }
      if (options.title) {
        payload.title = options.title;
      }
      if (options.callBackUrl) {
        payload.callBackUrl = options.callBackUrl;
      }

      const response = await this.client.post(endpoint, payload);

      // Безопасное логирование ответа
      const responseBodyStr = typeof response.data === "object" 
        ? JSON.stringify(response.data, null, 2).substring(0, 4096)
        : String(response.data).substring(0, 4096);

      Logger.info("[MusicClips][Suno] Generate response", {
        status: response.status,
        responseBody: responseBodyStr
      });

      // Извлекаем taskId из ответа
      const taskId = response.data?.data?.taskId || 
                     response.data?.taskId || 
                     response.data?.data?.task_id ||
                     response.data?.task_id ||
                     null;

      if (!taskId) {
        Logger.error("[MusicClips][Suno] No taskId in response", {
          responseBody: responseBodyStr,
          responseKeys: typeof response.data === "object" ? Object.keys(response.data) : []
        });

        const error = new Error("Suno API did not return taskId") as Error & { code?: string; responseData?: any };
        error.code = "SUNO_NO_TASK_ID";
        error.responseData = response.data;
        throw error;
      }

      return {
        taskId,
        code: response.data?.code || response.status,
        msg: response.data?.msg || response.data?.message || "success",
        data: response.data?.data
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;
      
      // Если это уже наша ошибка (SUNO_NO_TASK_ID), пробрасываем дальше
      if (error?.code === "SUNO_NO_TASK_ID") {
        throw error;
      }

      this.logSunoError(axiosError, "Failed to generate track");

      const finalStatus = axiosError.response?.status;
      const finalError = new Error(`Failed to generate track: ${error?.message || "Unknown error"}`) as Error & { 
        code?: string;
        status?: number;
      };

      if (finalStatus === 404) {
        finalError.code = "SUNO_ENDPOINT_NOT_FOUND";
        finalError.status = 404;
      } else if (finalStatus === 401 || finalStatus === 403) {
        finalError.code = "SUNO_AUTH_ERROR";
        finalError.status = finalStatus;
      } else if (finalStatus === 503 || finalStatus === 502 || finalStatus === 504) {
        finalError.code = "SUNO_UNAVAILABLE";
        finalError.status = finalStatus;
      } else if (finalStatus === 429) {
        finalError.code = "SUNO_RATE_LIMITED";
        finalError.status = 429;
      } else if (finalStatus && finalStatus >= 400 && finalStatus < 500) {
        finalError.code = "SUNO_CLIENT_ERROR";
        finalError.status = finalStatus;
      } else {
        finalError.code = "SUNO_ERROR";
        finalError.status = finalStatus;
      }

      throw finalError;
    }
  }

  /**
   * Получить информацию о записи по taskId
   */
  async getRecordInfo(taskId: string): Promise<SunoRecordInfo> {
    if (!this.isConfigured()) {
      throw new Error("SUNO_API_KEY is not configured");
    }

    const endpoint = `/api/v1/generate/record-info?taskId=${taskId}`;
    const finalUrl = `${this.apiBaseUrl}${endpoint}`;

    Logger.info("[MusicClips][Suno] Getting record info", {
      taskId,
      finalUrl
    });

    try {
      const response = await this.client.get(endpoint);

      // Безопасное логирование ответа
      const responseBodyStr = typeof response.data === "object" 
        ? JSON.stringify(response.data, null, 2).substring(0, 4096)
        : String(response.data).substring(0, 4096);

      Logger.info("[MusicClips][Suno] Record info response", {
        taskId,
        status: response.status,
        responseBody: responseBodyStr
      });

      // Поддержка различных форматов ответа Suno
      // Формат 1: { code: 200, msg: "success", data: { status: "SUCCESS", response: { data: [{ audio_url: "..." }] } } }
      // Формат 2: { status: "SUCCESS", data: [{ audio_url: "..." }] }
      // Формат 3: { data: { status: "SUCCESS", tracks: [{ audio_url: "..." }] } }
      const data = response.data?.data || response.data;
      const status = data?.status || 
                     (data?.response?.status) ||
                     response.data?.status ||
                     "PENDING";

      // Извлекаем audioUrl из различных мест
      let audioUrl: string | undefined;
      let title: string | undefined;
      let duration: number | undefined;
      let id: string | undefined;

      if (status === "SUCCESS") {
        // Пробуем разные пути к данным трека
        const tracks = data?.response?.data || 
                       data?.data || 
                       data?.tracks || 
                       response.data?.data?.response?.data ||
                       response.data?.response?.data ||
                       [];

        if (Array.isArray(tracks) && tracks.length > 0) {
          const track = tracks[0];
          // Поддержка snake_case и camelCase
          audioUrl = track?.audio_url || track?.audioUrl || track?.url || track?.audio;
          title = track?.title;
          duration = track?.duration;
          id = track?.id;
        } else if (data?.response && !Array.isArray(data.response)) {
          // Если response - объект, а не массив
          const track = data.response;
          audioUrl = track?.audio_url || track?.audioUrl || track?.url || track?.audio;
          title = track?.title;
          duration = track?.duration;
          id = track?.id;
        }

        // Логируем структуру ответа для отладки
        if (!audioUrl) {
          Logger.warn("[MusicClips][Suno] No audioUrl found in SUCCESS response", {
            taskId,
            status,
            responseKeys: typeof response.data === "object" ? Object.keys(response.data) : [],
            dataKeys: typeof data === "object" ? Object.keys(data) : [],
            hasResponse: !!data?.response,
            responseDataKeys: typeof data?.response === "object" ? Object.keys(data.response) : [],
            tracksLength: Array.isArray(tracks) ? tracks.length : 0
          });
        }
      }

      if (status === "FAILED") {
        const errorMessage = data?.msg || 
                             data?.message || 
                             data?.error || 
                             data?.response?.msg ||
                             "Unknown error";
        
        return {
          status: "FAILED",
          errorMessage,
          metadata: data
        };
      }

      return {
        status: status as "PENDING" | "GENERATING" | "SUCCESS" | "FAILED",
        audioUrl,
        title,
        duration,
        id,
        tracks: data?.response?.data || data?.data || [],
        metadata: data
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;
      this.logSunoError(axiosError, `Failed to get record info for ${taskId}`);

      const errorCode = axiosError.response?.status === 404 
        ? "SUNO_TASK_NOT_FOUND"
        : "SUNO_ERROR";

      const finalError = new Error(`Failed to get record info: ${error?.message || "Unknown error"}`) as Error & { code?: string };
      finalError.code = errorCode;
      throw finalError;
    }
  }

  /**
   * Ожидание результата генерации с polling
   */
  async waitForResult(
    taskId: string, 
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
    }
  ): Promise<SunoRecordInfo> {
    const pollIntervalMs = options?.pollIntervalMs || 3000; // 3 секунды по умолчанию
    const timeoutMs = options?.timeoutMs || 300000; // 5 минут по умолчанию
    const startTime = Date.now();

    Logger.info("[MusicClips][Suno] Starting polling for result", {
      taskId,
      pollIntervalMs,
      timeoutMs
    });

    while (Date.now() - startTime < timeoutMs) {
      const recordInfo = await this.getRecordInfo(taskId);

      if (recordInfo.status === "SUCCESS") {
        Logger.info("[MusicClips][Suno] Generation completed", {
          taskId,
          audioUrl: recordInfo.audioUrl?.substring(0, 100) + "...",
          elapsedMs: Date.now() - startTime
        });
        return recordInfo;
      }

      if (recordInfo.status === "FAILED") {
        Logger.error("[MusicClips][Suno] Generation failed", {
          taskId,
          errorMessage: recordInfo.errorMessage,
          elapsedMs: Date.now() - startTime
        });
        return recordInfo;
      }

      // PENDING или GENERATING - продолжаем polling
      Logger.debug("[MusicClips][Suno] Still processing", {
        taskId,
        status: recordInfo.status,
        elapsedMs: Date.now() - startTime
      });

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout
    Logger.warn("[MusicClips][Suno] Polling timeout", {
      taskId,
      elapsedMs: Date.now() - startTime
    });

    const timeoutError = new Error("Polling timeout") as Error & { code?: string; taskId?: string };
    timeoutError.code = "SUNO_POLLING_TIMEOUT";
    timeoutError.taskId = taskId;
    throw timeoutError;
  }

  /**
   * Создать трек через Suno API (legacy метод, использует новый generate API)
   * @param prompt - Промпт для генерации музыки
   * @param styleTags - Опциональные теги стиля
   * @returns URL аудио файла и метаданные
   * @deprecated Используйте generate() + waitForResult() или getRecordInfo()
   */
  async createTrack(prompt: string, styleTags?: string[]): Promise<SunoTrackResult> {
    // Формируем полный промпт с тегами стиля
    let fullPrompt = prompt;
    if (styleTags && styleTags.length > 0) {
      const tagsStr = styleTags.join(", ");
      fullPrompt = `${prompt} [${tagsStr}]`;
    }

    // Используем новый API
    const generateResult = await this.generate({
      prompt: fullPrompt,
      customMode: false,
      instrumental: false,
      model: "V4_5ALL"
    });

    // Пытаемся дождаться результата (короткий таймаут)
    try {
      const recordInfo = await this.waitForResult(generateResult.taskId, {
        pollIntervalMs: 3000,
        timeoutMs: 40000 // 40 секунд
      });

      if (recordInfo.status === "SUCCESS" && recordInfo.audioUrl) {
        return {
          audioUrl: recordInfo.audioUrl,
          title: recordInfo.title,
          duration: recordInfo.duration,
          metadata: recordInfo.metadata
        };
      }

      if (recordInfo.status === "FAILED") {
        const error = new Error(`Suno generation failed: ${recordInfo.errorMessage || "Unknown error"}`) as Error & { code?: string };
        error.code = "SUNO_FAILED";
        throw error;
      }

      // Timeout или не готово - возвращаем taskId в metadata
      return {
        audioUrl: "", // Пусто, будет получено позже
        title: recordInfo.title,
        duration: recordInfo.duration,
        metadata: {
          taskId: generateResult.taskId,
          status: recordInfo.status
        }
      } as SunoTrackResult & { taskId: string; status: string };
    } catch (error: any) {
      if (error?.code === "SUNO_POLLING_TIMEOUT") {
        // Возвращаем taskId для последующего polling
        return {
          audioUrl: "",
          metadata: {
            taskId: generateResult.taskId,
            status: "PROCESSING"
          }
        } as SunoTrackResult & { taskId: string; status: string };
      }
      throw error;
    }
  }

  /**
   * Создать трек через Suno API (legacy метод, использует новый generate API)
   * @param prompt - Промпт для генерации музыки
   * @param styleTags - Опциональные теги стиля
   * @returns URL аудио файла и метаданные
   * @deprecated Используйте generate() + waitForResult() или getRecordInfo()
   */
  async createTrackOld(prompt: string, styleTags?: string[]): Promise<SunoTrackResult> {
    if (!this.isConfigured()) {
      const error = new Error("SUNO_API_KEY is not configured") as Error & { code?: string };
      error.code = "SUNO_API_KEY_NOT_CONFIGURED";
      throw error;
    }

    Logger.info("[MusicClips][Suno] Creating track", {
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 100) + "...",
      styleTags: styleTags || [],
      baseURL: this.apiBaseUrl,
      endpoint: "/api/v1/generate"
    });

    // Формируем полный промпт с тегами стиля
    let fullPrompt = prompt;
    if (styleTags && styleTags.length > 0) {
      const tagsStr = styleTags.join(", ");
      fullPrompt = `${prompt} [${tagsStr}]`;
    }

    let lastError: AxiosError | Error | null = null;
    let lastStatus: number | undefined;

    // Retry loop
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const retryAfter = lastError instanceof AxiosError 
            ? lastError.response?.headers?.["retry-after"] 
            : undefined;
          const retryAfterSec = retryAfter ? parseInt(String(retryAfter), 10) : undefined;
          
          const delay = this.calculateRetryDelay(attempt - 1, retryAfterSec);
          
          Logger.info("[MusicClips][Suno] Retrying createTrack", {
            attempt,
            maxRetries: this.retryConfig.maxRetries,
            delayMs: Math.round(delay),
            retryAfterSec,
            previousStatus: lastStatus
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Вызываем API для создания трека
        // Endpoint согласно документации sunoapi.org: /api/v1/generate
        const endpoint = "/api/v1/generate";
        const finalUrl = `${this.apiBaseUrl}${endpoint}`;
        
        Logger.info("[MusicClips][Suno] Sending request to Suno API", {
          method: "POST",
          url: finalUrl,
          endpoint,
          payloadPreview: {
            promptLength: fullPrompt.length,
            make_instrumental: false,
            wait_audio: true
          }
        });

        const response = await this.client.post(endpoint, {
          prompt: fullPrompt,
          make_instrumental: false,
          wait_audio: true
        });

        // Безопасное логирование ответа (до 4KB)
        const responseBodyStr = typeof response.data === "object" 
          ? JSON.stringify(response.data, null, 2).substring(0, 4096)
          : String(response.data).substring(0, 4096);

        Logger.info("[MusicClips][Suno] Suno API response received", {
          status: response.status,
          statusText: response.statusText,
          responseBody: responseBodyStr,
          responseKeys: typeof response.data === "object" ? Object.keys(response.data) : [],
          attempt: attempt + 1
        });

        // Парсим ответ: проверяем наличие jobId или audioUrl
        const jobId = this.extractJobId(response.data);
        const audioUrl = this.extractAudioUrl(response.data);

        // Если есть jobId и нет audioUrl - это асинхронный job
        if (jobId && !audioUrl) {
          Logger.info("[MusicClips][Suno] Job created (async)", {
            jobId,
            status: response.data.status || "queued"
          });

          return {
            audioUrl: "", // Пусто, будет получено позже
            title: response.data.title,
            duration: response.data.duration,
            metadata: {
              ...response.data,
              jobId,
              status: response.data.status || "queued"
            }
          } as SunoTrackResult & { jobId: string; status: string };
        }

        // Если есть audioUrl - синхронный ответ
        if (audioUrl) {
          Logger.info("[MusicClips][Suno] Track created successfully (sync)", {
            audioUrl: audioUrl.substring(0, 100) + "...",
            title: response.data.title,
            duration: response.data.duration,
            attempt: attempt + 1,
            status: response.status
          });

          return {
            audioUrl,
            title: response.data.title,
            duration: response.data.duration,
            metadata: response.data
          };
        }

        // Если нет ни jobId, ни audioUrl - это ошибка формата
        Logger.error("[MusicClips][Suno] Unexpected response format", {
          responseBody: responseBodyStr,
          responseKeys: typeof response.data === "object" ? Object.keys(response.data) : []
        });

        const error = new Error("Suno API did not return audio URL or job ID") as Error & { 
          code?: string;
          responseData?: any;
        };
        error.code = "SUNO_UNEXPECTED_RESPONSE";
        error.responseData = response.data;
        throw error;
      } catch (error: any) {
        lastError = error;
        const axiosError = error as AxiosError;
        lastStatus = axiosError.response?.status;

        // Логируем ошибку
        if (axiosError.isAxiosError) {
          this.logSunoError(axiosError, `Failed to create track (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`);
        } else {
          Logger.error("[MusicClips][Suno] Failed to create track", {
            error: error?.message || String(error),
            attempt: attempt + 1
          });
        }

        // Проверяем, нужно ли делать retry
        if (!this.shouldRetry(lastStatus, attempt)) {
          break;
        }
      }
    }

    // Все попытки исчерпаны или ошибка не retryable
    const finalError = lastError as AxiosError;
    const finalStatus = finalError?.response?.status;

    // Создаём понятную ошибку с кодом
    const errorMessage = finalError?.message || "Unknown error";
    const error = new Error(`Suno API error: ${errorMessage}`) as Error & { 
      code?: string; 
      status?: number;
      retryAfterSec?: number;
    };

    // Специальная обработка для 404 - неверный endpoint
    if (finalStatus === 404) {
      error.code = "SUNO_ENDPOINT_NOT_FOUND";
      error.status = 404;
      Logger.error("[MusicClips][Suno] Endpoint not found (404)", {
        baseURL: this.apiBaseUrl,
        endpoint: "/api/v1/generate",
        finalUrl: `${this.apiBaseUrl}/api/v1/generate`,
        message: "Проверьте SUNO_API_BASE_URL и путь endpoint в коде"
      });
    } else if (finalStatus === 503 || finalStatus === 502 || finalStatus === 504) {
      error.code = "SUNO_UNAVAILABLE";
      error.status = finalStatus;
      const retryAfter = finalError?.response?.headers?.["retry-after"];
      error.retryAfterSec = retryAfter ? parseInt(String(retryAfter), 10) : 30;
    } else if (finalStatus === 429) {
      error.code = "SUNO_RATE_LIMITED";
      error.status = 429;
      const retryAfter = finalError?.response?.headers?.["retry-after"];
      error.retryAfterSec = retryAfter ? parseInt(String(retryAfter), 10) : 60;
    } else if (finalStatus === 401 || finalStatus === 403) {
      error.code = "SUNO_AUTH_ERROR";
      error.status = finalStatus;
    } else if (finalStatus && finalStatus >= 400 && finalStatus < 500) {
      error.code = "SUNO_CLIENT_ERROR";
      error.status = finalStatus;
    } else {
      error.code = "SUNO_ERROR";
      error.status = finalStatus;
    }

    throw error;
  }

  /**
   * Получить статус job по jobId
   */
  async getJobStatus(jobId: string): Promise<SunoJobResult> {
    if (!this.isConfigured()) {
      throw new Error("SUNO_API_KEY is not configured");
    }

    const endpoint = `/api/v1/jobs/${jobId}`;
    const finalUrl = `${this.apiBaseUrl}${endpoint}`;

    Logger.info("[MusicClips][Suno] Getting job status", {
      jobId,
      finalUrl
    });

    try {
      const response = await this.client.get(endpoint);

      // Безопасное логирование ответа
      const responseBodyStr = typeof response.data === "object" 
        ? JSON.stringify(response.data, null, 2).substring(0, 4096)
        : String(response.data).substring(0, 4096);

      Logger.info("[MusicClips][Suno] Job status response", {
        jobId,
        status: response.status,
        responseBody: responseBodyStr
      });

      const audioUrl = this.extractAudioUrl(response.data);
      const status = response.data.status || 
                     (audioUrl ? "completed" : "processing");

      if (status === "failed" || response.data.error) {
        return {
          jobId,
          status: "failed",
          error: response.data.error || response.data.message || "Unknown error",
          metadata: response.data
        };
      }

      if (status === "completed" && audioUrl) {
        return {
          jobId,
          status: "completed",
          audioUrl,
          title: response.data.title,
          duration: response.data.duration,
          metadata: response.data
        };
      }

      // processing или queued
      return {
        jobId,
        status: status as "queued" | "processing",
        metadata: response.data
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;
      this.logSunoError(axiosError, `Failed to get job status for ${jobId}`);

      const errorCode = axiosError.response?.status === 404 
        ? "SUNO_JOB_NOT_FOUND"
        : "SUNO_ERROR";

      const finalError = new Error(`Failed to get job status: ${error?.message || "Unknown error"}`) as Error & { code?: string };
      finalError.code = errorCode;
      throw finalError;
    }
  }

  /**
   * Скачать аудио файл по URL
   * @param audioUrl - URL аудио файла
   * @param destPath - Путь для сохранения
   * @returns Путь к сохраненному файлу
   */
  async downloadAudio(audioUrl: string, destPath: string): Promise<string> {
    Logger.info("[MusicClips][Suno] Downloading audio", {
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

      Logger.info("[MusicClips][Suno] Audio downloaded", {
        destPath,
        fileSize: (await fs.stat(destPath)).size
      });

      return destPath;
    } catch (error: any) {
      Logger.error("[MusicClips][Suno] Failed to download audio", {
        audioUrl: audioUrl.substring(0, 100) + "...",
        destPath,
        error: error?.message || String(error)
      });
      throw new Error(`Failed to download audio: ${error?.message || "Unknown error"}`);
    }
  }

  /**
   * Проверить доступность Suno API (диагностический ping)
   * Не тратит кредиты, только проверяет DNS/TLS/доступность
   */
  async ping(): Promise<{ ok: boolean; latency?: number; error?: string; status?: number }> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        error: "SUNO_API_KEY is not configured"
      };
    }

    const startTime = Date.now();

    try {
      // Делаем лёгкий HEAD запрос к базовому URL для проверки доступности
      const response = await axios.head(this.apiBaseUrl, {
        timeout: 5000, // Короткий таймаут для ping
        headers: {
          "Authorization": `Bearer ${this.apiKey}`
        }
      });

      const latency = Date.now() - startTime;

      return {
        ok: true,
        latency,
        status: response.status
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      const axiosError = error as AxiosError;

      // Если получили ответ (даже с ошибкой), значит API доступен
      if (axiosError.response) {
        return {
          ok: true, // API доступен, даже если вернул ошибку
          latency,
          status: axiosError.response.status,
          error: axiosError.message
        };
      }

      // Сетевая ошибка или таймаут
      return {
        ok: false,
        latency,
        error: axiosError.message || "Network error"
      };
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

