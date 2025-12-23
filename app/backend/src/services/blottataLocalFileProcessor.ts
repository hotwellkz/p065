import * as path from "path";
import * as fs from "fs/promises";
import { Logger } from "../utils/logger";
import type { Channel } from "../types/channel";
import { blottataPublisherService } from "./blottataPublisherService";
import { generateYoutubeTitleAndDescription } from "./youtubeTitleDescriptionGenerator";
import { normalizeYoutubeTitle } from "../utils/youtubeTitleNormalizer";
import { getUserChannelStoragePaths, type UserChannelStoragePaths } from "./storage/userChannelStorage";
import { db, isFirestoreAvailable } from "./firebaseAdmin";

interface ProcessedFile {
  fileName: string;
  success: boolean;
  publishedPlatforms: string[];
  errors: string[];
}

/**
 * Обрабатывает локальный файл: генерирует описание, публикует через Blottata, перемещает в архив
 */
export async function processBlottataLocalFile(
  channel: Channel & { ownerId?: string },
  fileName: string,
  paths: UserChannelStoragePaths
): Promise<ProcessedFile> {
  const result: ProcessedFile = {
    fileName,
    success: false,
    publishedPlatforms: [],
    errors: []
  };

  try {
    // Проверяем конфигурацию Blotato перед обработкой
    const hasApiKey = !!(channel.blotataApiKey || process.env.BLOTATA_API_KEY);
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
        hasApiKey,
        hasAtLeastOneAccount
      });
      await saveErrorLog(channel.id, fileName, configError, channel.ownerId);
      throw new Error(configError);
    }

    Logger.info("BlottataLocalFileProcessor: Starting file processing", {
      channelId: channel.id,
      fileName,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir,
      blotataEnabled: channel.blotataEnabled || false,
      hasApiKey,
      hasAtLeastOneAccount
    });

    const filePath = path.join(paths.inputDir, fileName);

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
    // ВАЖНО: Для работы с Blotato нужен публичный URL, а не localhost!
    const port = process.env.PORT || 8080;
    const backendBaseUrl = process.env.BACKEND_URL || 
                          process.env.FRONTEND_ORIGIN?.replace(':5173', `:${port}`) || 
                          `http://localhost:${port}`;
    const mediaUrl = `${backendBaseUrl}/api/media/${paths.userSlug}/${paths.channelSlug}/${encodeURIComponent(fileName)}`;

    // Предупреждение, если используется localhost (Blotato не сможет получить доступ)
    if (backendBaseUrl.includes('localhost') || backendBaseUrl.includes('127.0.0.1')) {
      Logger.warn("BlottataLocalFileProcessor: Using localhost URL - Blotato may not be able to access the file", {
        channelId: channel.id,
        fileName,
        mediaUrl,
        warning: "Set BACKEND_URL to a public URL for Blotato to work correctly"
      });
    }

    Logger.info("BlottataLocalFileProcessor: Media URL generated", {
      channelId: channel.id,
      fileName,
      mediaUrl
    });

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
      title: normalizedTitle
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
    const archivePath = path.join(paths.archiveDir, fileName);

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

