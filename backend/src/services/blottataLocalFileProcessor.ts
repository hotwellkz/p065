import * as path from "path";
import * as fs from "fs/promises";
import { Logger } from "../utils/logger";
import type { Channel } from "../types/channel";
import { blottataPublisherService } from "./blottataPublisherService";
import { generateYoutubeTitleAndDescription } from "./youtubeTitleDescriptionGenerator";
import { normalizeYoutubeTitle } from "../utils/youtubeTitleNormalizer";
import { getStorageService } from "./storageService";
import { db, isFirestoreAvailable } from "./firebaseAdmin";
import axios from "axios";

interface ProcessedFile {
  fileName: string;
  success: boolean;
  publishedPlatforms: string[];
  errors: string[];
}

/**
 * Проверяет доступность mediaUrl перед отправкой в Blotato
 * Выполняет HEAD и Range запросы для проверки:
 * - Статус 200/206
 * - Content-Type = video/mp4
 * - Наличие "ftyp" в первых байтах (MP4 signature)
 */
async function validateMediaUrl(mediaUrl: string, channelId: string, fileName: string): Promise<void> {
  try {
    Logger.info("BlottataLocalFileProcessor: Validating media URL", {
      channelId,
      fileName,
      mediaUrl
    });

    // Проверка 1: HEAD запрос для проверки заголовков
    let headResponse;
    try {
      headResponse = await axios.head(mediaUrl, {
        timeout: 10000,
        validateStatus: (status: number) => status < 500, // Принимаем 200, 206, 404, но не 500
        maxRedirects: 5
      });
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      Logger.error("BlottataLocalFileProcessor: HEAD request failed", {
        channelId,
        fileName,
        mediaUrl,
        error: errorMsg,
        code: error?.code,
        status: error?.response?.status
      });
      throw new Error(`MEDIA_URL_INVALID: HEAD request failed: ${errorMsg}`);
    }

    const status = headResponse.status;
    const contentType = headResponse.headers['content-type'] || '';
    const contentLength = headResponse.headers['content-length'] || '0';
    const acceptRanges = headResponse.headers['accept-ranges'] || '';

    Logger.info("BlottataLocalFileProcessor: HEAD response received", {
      channelId,
      fileName,
      status,
      contentType,
      contentLength,
      acceptRanges
    });

    // Проверка статуса
    if (status !== 200 && status !== 206) {
      throw new Error(`MEDIA_URL_INVALID: Expected status 200/206, got ${status}`);
    }

    // Проверка Content-Type
    if (!contentType.includes('video/mp4') && !contentType.includes('video/')) {
      Logger.warn("BlottataLocalFileProcessor: Unexpected Content-Type", {
        channelId,
        fileName,
        contentType,
        mediaUrl
      });
      // Не критично, продолжаем
    }

    // Проверка 2: Range запрос для проверки первых байтов (MP4 signature)
    try {
      const rangeResponse = await axios.get(mediaUrl, {
        headers: { Range: 'bytes=0-1023' },
        responseType: 'arraybuffer',
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status: number) => status === 200 || status === 206
      });

      const buffer = Buffer.from(rangeResponse.data);
      const firstBytes = buffer.slice(0, 32).toString('hex');
      const firstBytesAscii = buffer.slice(0, 32).toString('ascii', 0, 32).replace(/[^\x20-\x7E]/g, '.');

      Logger.info("BlottataLocalFileProcessor: Range response received", {
        channelId,
        fileName,
        status: rangeResponse.status,
        bytesReceived: buffer.length,
        firstBytesHex: firstBytes.substring(0, 64),
        firstBytesAscii
      });

      // Проверка MP4 signature: должен содержать "ftyp" на позиции 4-8
      const hasFtyp = buffer.length >= 8 && buffer.slice(4, 8).toString('ascii') === 'ftyp';
      
      if (!hasFtyp) {
        Logger.error("BlottataLocalFileProcessor: MP4 signature not found", {
          channelId,
          fileName,
          mediaUrl,
          firstBytes: firstBytes.substring(0, 64),
          firstBytesAscii,
          bytesAt4_8: buffer.slice(4, 8).toString('ascii')
        });
        throw new Error(`MEDIA_URL_INVALID: MP4 signature "ftyp" not found in first bytes. Got: ${buffer.slice(4, 8).toString('ascii')}`);
      }

    Logger.info("BlottataLocalFileProcessor: Media URL validation successful", {
      channelId,
      fileName,
      status,
      contentType,
      contentLength,
      hasMp4Signature: true
    });

    // ВАЖНО: Валидация прошла успешно, но это проверка изнутри сервера.
    // Blotato должен иметь доступ извне. Если Blotato все еще падает с 500,
    // проверьте:
    // 1. Reverse proxy правильно проксирует /api/media/*
    // 2. URL доступен из интернета (не только из контейнера)
    // 3. SSL сертификат валидный для внешних сервисов
    // 4. Firewall не блокирует доступ
    Logger.warn("BlottataLocalFileProcessor: Validation passed, but Blotato may still fail if URL is not accessible from internet", {
      channelId,
      fileName,
      mediaUrl,
      note: "If Blotato returns 500, check external accessibility of the URL"
    });
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      Logger.error("BlottataLocalFileProcessor: Range request failed", {
        channelId,
        fileName,
        mediaUrl,
        error: errorMsg,
        code: error?.code,
        status: error?.response?.status
      });
      throw new Error(`MEDIA_URL_INVALID: Range request failed: ${errorMsg}`);
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    Logger.error("BlottataLocalFileProcessor: Media URL validation failed", {
      channelId,
      fileName,
      mediaUrl,
      error: errorMsg
    });
    throw error; // Пробрасываем ошибку дальше
  }
}

/**
 * Обрабатывает локальный файл: генерирует описание, публикует через Blottata, перемещает в архив
 */
export async function processBlottataLocalFile(
  channel: Channel & { ownerId?: string },
  userEmail: string,
  fileName: string,
  filePath: string // Полный путь к файлу в inbox
): Promise<ProcessedFile> {
  const result: ProcessedFile = {
    fileName,
    success: false,
    publishedPlatforms: [],
    errors: []
  };

  try {
    // Проверяем конфигурацию Blotato перед обработкой
    const userId = channel.ownerId;
    const { getBlottataApiKey } = await import("../utils/blottataApiKey");
    
    const apiKeyResult = await getBlottataApiKey(channel, userId);
    const hasApiKey = !!apiKeyResult;
    
    const hasAtLeastOneAccount = !!(
      channel.blotataYoutubeId || 
      channel.blotataTiktokId || 
      channel.blotataInstagramId ||
      channel.blotataFacebookId ||
      channel.blotataThreadsId ||
      channel.blotataTwitterId ||
      channel.blotataLinkedinId ||
      channel.blotataPinterestId ||
      channel.blotataBlueskyId
    );

    if (!hasApiKey || !hasAtLeastOneAccount) {
      const configError = `Blotato auto-publish is enabled but configuration is incomplete. API key: ${hasApiKey ? 'present' : 'missing'}, Account IDs: ${hasAtLeastOneAccount ? 'present' : 'missing'}`;
      Logger.error("BlottataLocalFileProcessor: Configuration incomplete", {
        channelId: channel.id,
        fileName,
        userId,
        hasApiKey,
        apiKeySource: apiKeyResult?.source || "none",
        hasAtLeastOneAccount
      });
      await saveErrorLog(channel.id, fileName, configError, channel.ownerId);
      throw new Error(configError);
    }

    // Получаем пути через StorageService
    if (!channel.ownerId) {
      throw new Error("Channel ownerId is required");
    }
    const storage = getStorageService();
    const userFolderKey = await storage.resolveUserFolderKey(channel.ownerId, userEmail);
    const channelFolderKey = await storage.resolveChannelFolderKey(channel.ownerId, channel.id);
    const archiveDir = storage.resolveUploadedDir(userFolderKey, channelFolderKey);
    
    Logger.info("BlottataLocalFileProcessor: Starting file processing", {
      channelId: channel.id,
      fileName,
      filePath,
      archiveDir,
      userFolderKey,
      channelFolderKey,
      userId,
      blotataEnabled: channel.blotataEnabled || false,
      hasApiKey,
      apiKeySource: apiKeyResult?.source || "none",
      hasAtLeastOneAccount
    });

    // 1. Проверяем существование файла
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    // 2. Получаем информацию о файле
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Not a file: ${filePath}`);
    }

    // Проверяем, что это видео по расширению
    const ext = path.extname(fileName).toLowerCase();
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv', '.wmv'];
    if (!videoExtensions.includes(ext)) {
      throw new Error(`File is not a video: ${ext}`);
    }

    Logger.info("BlottataLocalFileProcessor: File info retrieved", {
      channelId: channel.id,
      fileName,
      filePath,
      size: stats.size
    });

    // 3. Формируем mediaUrl для Blotato
    // Используем endpoint /api/media/:userSlug/:channelSlug/:fileName
    // ВАЖНО: Для работы с Blotato нужен публичный HTTPS URL, доступный извне!
    // Приоритет: PUBLIC_BASE_URL > BACKEND_URL > FRONTEND_ORIGIN (с заменой порта) > fallback
    // РЕКОМЕНДУЕТСЯ: PUBLIC_BASE_URL=https://api.shortsai.ru (через VDS reverse proxy)
    let publicBaseUrl = process.env.PUBLIC_BASE_URL || 
                         process.env.BACKEND_URL || 
                         process.env.FRONTEND_ORIGIN?.replace(':5173', `:${process.env.PORT || 3000}`) || 
                         null;
    
    // Если URL не HTTPS, пытаемся преобразовать HTTP в HTTPS
    if (publicBaseUrl && publicBaseUrl.startsWith('http://')) {
      // Заменяем http:// на https://
      publicBaseUrl = publicBaseUrl.replace(/^http:\/\//, 'https://');
      Logger.warn("BlottataLocalFileProcessor: Converted HTTP to HTTPS", {
        channelId: channel.id,
        originalUrl: process.env.PUBLIC_BASE_URL || process.env.BACKEND_URL,
        convertedUrl: publicBaseUrl
      });
    }
    
    if (!publicBaseUrl) {
      throw new Error("PUBLIC_BASE_URL or BACKEND_URL must be set for Blotato media upload. Blotato needs a publicly accessible HTTPS URL.");
    }

    // Убеждаемся что URL заканчивается без слеша
    const baseUrl = publicBaseUrl.replace(/\/+$/, '');
    
    // Проверка на IP адреса (не рекомендуется для публичного доступа)
    const ipPattern = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?/;
    if (ipPattern.test(baseUrl)) {
      Logger.error("BlottataLocalFileProcessor: Using IP address instead of domain - Blotato may not be able to access", {
        channelId: channel.id,
        fileName,
        baseUrl,
        warning: "IP addresses are not recommended for public access. Use a domain name with valid SSL certificate (e.g., https://api.shortsai.ru)"
      });
      // Не бросаем ошибку, но логируем критическое предупреждение
    }
    
    // Используем userFolderKey и channelFolderKey для URL
    // Endpoint автоматически ищет файл в inbox, root или legacy пути
    const mediaUrl = `${baseUrl}/api/media/${encodeURIComponent(userFolderKey)}/${encodeURIComponent(channelFolderKey)}/${encodeURIComponent(fileName)}`;

    // Предупреждение, если используется localhost или HTTP (не HTTPS)
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      Logger.warn("BlottataLocalFileProcessor: Using localhost URL - Blotato may not be able to access the file", {
        channelId: channel.id,
        fileName,
        mediaUrl,
        warning: "Set PUBLIC_BASE_URL to a public HTTPS URL (e.g., https://api.hotwell.synology.me) for Blotato to work correctly"
      });
    } else if (!baseUrl.startsWith('https://')) {
      Logger.warn("BlottataLocalFileProcessor: Using HTTP instead of HTTPS - Blotato may have issues", {
        channelId: channel.id,
        fileName,
        mediaUrl,
        warning: "Use HTTPS URL for better compatibility with Blotato"
      });
    }

    Logger.info("BlottataLocalFileProcessor: Media URL generated", {
      channelId: channel.id,
      fileName,
      mediaUrl
    });

    // 3.5. Проверяем доступность mediaUrl перед отправкой в Blotato
    await validateMediaUrl(mediaUrl, channel.id, fileName);

    // 4. Генерируем title и description через OpenAI с учетом языка канала
    const { title: generatedTitle, description } = await generateYoutubeTitleAndDescription(fileName, channel);
    
    // Нормализуем title перед публикацией
    const normalizedTitle = normalizeYoutubeTitle(generatedTitle);

    Logger.info("BlottataLocalFileProcessor: Title and description generated", {
      channelId: channel.id,
      fileName,
      titleLength: normalizedTitle.length,
      descriptionLength: description.length,
      title: normalizedTitle.substring(0, 50) + (normalizedTitle.length > 50 ? "..." : ""),
      description: description.substring(0, 50) + "..."
    });

    // 5. Публикуем на все настроенные платформы
    const publishResults = await blottataPublisherService.publishToAllPlatforms({
      channel,
      mediaUrl,
      description,
      title: normalizedTitle,
      userId
    });

    // Анализируем результаты
    const successfulPlatforms: string[] = [];
    const errors: string[] = [];
    let hasRetryableError = false;

    publishResults.forEach((publishResult) => {
      if (publishResult.success) {
        successfulPlatforms.push(publishResult.platform);
      } else {
        const errorMsg = publishResult.error || "Unknown error";
        errors.push(`${publishResult.platform}: ${errorMsg}`);
        
        // Проверяем на ошибки, которые требуют повторной попытки
        if (
          errorMsg.includes("already in progress") ||
          errorMsg.includes("please wait") ||
          errorMsg.includes("Failed to read media metadata") ||
          errorMsg.includes("timeout") ||
          errorMsg.includes("TIMEOUT")
        ) {
          hasRetryableError = true;
        }
      }
    });

    result.publishedPlatforms = successfulPlatforms;

    if (errors.length > 0) {
      result.errors = errors;
      Logger.warn("BlottataLocalFileProcessor: Some platforms failed", {
        channelId: channel.id,
        fileName,
        errors,
        hasRetryableError
      });
    }

    // Если хотя бы одна платформа успешна, считаем операцию успешной
    result.success = successfulPlatforms.length > 0;

    if (!result.success) {
      // Сохраняем ошибку в error_logs
      const errorMessage = `All platforms failed: ${errors.join("; ")}`;
      await saveErrorLog(channel.id, fileName, errorMessage, channel.ownerId);
      
      // Если это retryable ошибка, не бросаем исключение - файл останется для повторной попытки
      if (hasRetryableError) {
        Logger.info("BlottataLocalFileProcessor: Retryable error detected, file will be retried", {
          channelId: channel.id,
          fileName,
          errors
        });
        // Не перемещаем файл, он останется во входной папке для повторной попытки
        result.success = false;
        return result;
      }
      
      throw new Error(errorMessage);
    }

    // 6. Перемещаем файл из входной папки в архивную после успешной публикации
    const archivePath = path.join(archiveDir, fileName);

    try {
      await fs.rename(filePath, archivePath);

      console.log('[BlotataMonitor] Published & archived', {
        channelId: channel.id,
        fileName,
        from: filePath,
        to: archivePath
      });

      Logger.info("BlottataLocalFileProcessor: File successfully moved to archive", {
        channelId: channel.id,
        fileName,
        from: filePath,
        to: archivePath
      });
    } catch (moveError: any) {
      Logger.error("BlottataLocalFileProcessor: Failed to move file to archive", {
        channelId: channel.id,
        fileName,
        from: filePath,
        to: archivePath,
        error: moveError?.message || String(moveError)
      });
      // Не считаем это критической ошибкой, если публикация прошла успешно
      // Файл останется во входной папке и будет обработан снова при следующем цикле
      if (result.errors.length === 0) {
        result.errors.push(`Archive move failed: ${moveError?.message || "Unknown error"}`);
      }
    }

    Logger.info("BlottataLocalFileProcessor: File processing completed", {
      channelId: channel.id,
      fileName,
      success: result.success,
      publishedPlatforms: result.publishedPlatforms
    });

    return result;
  } catch (error: any) {
    Logger.error("BlottataLocalFileProcessor: File processing failed", {
      channelId: channel.id,
      fileName,
      error: error?.message || String(error)
    });

    // Сохраняем ошибку в error_logs
    const errorMessage = error?.message || String(error);
    await saveErrorLog(channel.id, fileName, errorMessage, channel.ownerId);

    result.success = false;
    result.errors.push(errorMessage);
    return result;
  }
}

/**
 * Сохраняет ошибку в error_logs
 */
async function saveErrorLog(
  channelId: string, 
  fileName: string, 
  errorMessage: string, 
  userId?: string
): Promise<void> {
  if (!isFirestoreAvailable() || !db) {
    return;
  }

  try {
    // Если userId не передан, находим его из канала
    let finalUserId = userId;
    if (!finalUserId) {
      const channelsSnapshot = await db.collectionGroup("channels")
        .where("__name__", "==", channelId)
        .limit(1)
        .get();

      if (channelsSnapshot.empty) {
        Logger.warn("BlottataLocalFileProcessor: Channel not found for error log", { channelId });
        return;
      }

      const channelDoc = channelsSnapshot.docs[0];
      const pathParts = channelDoc.ref.path.split("/");
      const userIdIndex = pathParts.indexOf("users");
      finalUserId = userIdIndex !== -1 && userIdIndex + 1 < pathParts.length 
        ? pathParts[userIdIndex + 1] 
        : undefined;

      if (!finalUserId) {
        Logger.warn("BlottataLocalFileProcessor: Could not extract userId for error log", { channelId });
        return;
      }
    }

    // Сохраняем ошибку
    await db.collection("error_logs").add({
      userId: finalUserId,
      channelId,
      source: "blotata_publish",
      fileName,
      error: errorMessage,
      createdAt: new Date(),
      createdAtISO: new Date().toISOString()
    });

    Logger.info("BlottataLocalFileProcessor: Error logged", {
      userId: finalUserId,
      channelId,
      fileName,
      error: errorMessage
    });
  } catch (logError) {
    Logger.warn("BlottataLocalFileProcessor: Failed to save error log", {
      channelId,
      fileName,
      error: logError instanceof Error ? logError.message : String(logError)
    });
  }
}

