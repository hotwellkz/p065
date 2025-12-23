import { Logger } from "../utils/logger";
import { getDriveClient } from "./googleDrive";
import { processBlottataFile } from "./blottataFileProcessor";
import type { Channel } from "../types/channel";
import { db, isFirestoreAvailable } from "./firebaseAdmin";

/**
 * Хранилище обработанных файлов для предотвращения повторной обработки
 * Ключ: `${channelId}:${fileId}`
 * Значение: timestamp обработки
 */
const processedFiles = new Map<string, number>();

/**
 * Проверяет, был ли файл уже обработан
 */
async function isFileProcessed(channelId: string, fileId: string): Promise<{ processed: boolean; source?: 'memory' | 'firestore'; processedAt?: number }> {
  const memoryKey = `${channelId}:${fileId}`;
  
  // Проверяем в памяти
  if (processedFiles.has(memoryKey)) {
    const processedAt = processedFiles.get(memoryKey);
    return { processed: true, source: 'memory', processedAt };
  }

  // Проверяем в Firestore (для персистентности между перезапусками)
  if (isFirestoreAvailable() && db) {
    try {
      const processedRef = db
        .collection("blottataProcessedFiles")
        .doc(memoryKey);

      const doc = await processedRef.get();
      if (doc.exists) {
        // Обновляем кэш в памяти
        const data = doc.data();
        if (data?.processedAt) {
          processedFiles.set(memoryKey, data.processedAt);
          return { 
            processed: true, 
            source: 'firestore', 
            processedAt: data.processedAt 
          };
        }
      }
    } catch (error) {
      Logger.warn("blottataDriveMonitor: Failed to check Firestore for processed file", {
        channelId,
        fileId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Продолжаем выполнение, если проверка не удалась
    }
  }

  return { processed: false };
}

/**
 * Помечает файл как обработанный
 */
async function markFileAsProcessed(channelId: string, fileId: string): Promise<void> {
  const memoryKey = `${channelId}:${fileId}`;
  const processedAt = Date.now();

  // Сохраняем в памяти
  processedFiles.set(memoryKey, processedAt);

  // Сохраняем в Firestore для персистентности
  if (isFirestoreAvailable() && db) {
    try {
      await db
        .collection("blottataProcessedFiles")
        .doc(memoryKey)
        .set({
          channelId,
          fileId,
          processedAt,
          processedAtISO: new Date(processedAt).toISOString()
        });
    } catch (error) {
      Logger.warn("blottataDriveMonitor: Failed to save processed file to Firestore", {
        channelId,
        fileId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Очищает ID папки Google Drive от параметров URL (например, ?hl=ru)
 */
function cleanFolderId(folderId: string): string {
  if (!folderId) return folderId;
  // Удаляем параметры URL, если они есть
  // Например: "1BBP3gnYws01siBUs0GQeIYx2j8Nm8Jvy?hl=ru" -> "1BBP3gnYws01siBUs0GQeIYx2j8Nm8Jvy"
  const questionMarkIndex = folderId.indexOf('?');
  if (questionMarkIndex !== -1) {
    return folderId.substring(0, questionMarkIndex);
  }
  return folderId;
}

/**
 * Получает список новых файлов в папке Google Drive
 */
export async function getNewFilesInFolder(
  folderId: string,
  lastCheckTime?: number
): Promise<Array<{ id: string; name: string; createdTime: string; webContentLink?: string }>> {
  const drive = getDriveClient(true);

  // Очищаем folderId от параметров URL
  const cleanId = cleanFolderId(folderId);

  try {
    // Сначала проверяем, есть ли вообще файлы в папке (для диагностики)
    const allFilesQuery = `'${cleanId}' in parents and trashed = false`;
    const allFilesResponse = await drive.files.list({
      q: allFilesQuery,
      fields: "files(id, name, mimeType, createdTime)",
      pageSize: 10
    });
    
    const allFilesCount = allFilesResponse.data.files?.length || 0;
    const allFiles = allFilesResponse.data.files || [];
    
    Logger.info("blottataDriveMonitor: Checking folder contents", {
      folderId: cleanId,
      totalFilesInFolder: allFilesCount,
      sampleFiles: allFiles.slice(0, 5).map(f => ({
        name: f.name,
        mimeType: f.mimeType,
        isVideo: f.mimeType?.includes('video/') || false
      }))
    });
    
    // Теперь ищем только видеофайлы
    const query = `'${cleanId}' in parents and trashed = false and mimeType contains 'video/'`;
    
    const response = await drive.files.list({
      q: query,
      fields: "files(id, name, createdTime, webContentLink, mimeType)",
      orderBy: "createdTime desc",
      pageSize: 50
    });

    const videoFiles = response.data.files || [];
    
    Logger.info("blottataDriveMonitor: Video files found", {
      folderId: cleanId,
      totalFilesInFolder: allFilesCount,
      videoFilesCount: videoFiles.length,
      videoFiles: videoFiles.slice(0, 5).map(f => ({
        name: f.name,
        mimeType: f.mimeType
      }))
    });

    const files = videoFiles.map((file) => ({
      id: file.id!,
      name: file.name || "unknown",
      createdTime: file.createdTime || new Date().toISOString(),
      webContentLink: file.webContentLink || undefined
    }));

    // Фильтруем по времени создания, если указано
    if (lastCheckTime) {
      return files.filter((file) => {
        const fileTime = new Date(file.createdTime).getTime();
        return fileTime > lastCheckTime;
      });
    }

    return files;
  } catch (error: any) {
    const errorCode = error?.code;
    const errorMessage = error?.message || String(error);
    
    Logger.error("blottataDriveMonitor: Failed to list files in folder", {
      folderId: cleanId,
      originalFolderId: folderId,
      error: errorMessage,
      code: errorCode,
      errorName: error?.name,
      errorStack: error?.stack
    });

    // Детализируем ошибки доступа к Google Drive
    if (errorCode === 404) {
      throw new Error(`GOOGLE_DRIVE_FOLDER_NOT_FOUND: Folder not found (ID: ${cleanId}). Check folder ID.`);
    }
    if (errorCode === 403) {
      throw new Error(`GOOGLE_DRIVE_PERMISSION_DENIED: Access denied to folder (ID: ${cleanId}). Check permissions.`);
    }
    
    throw error;
  }
}

/**
 * Обрабатывает новые файлы для канала
 */
export async function processNewFilesForChannel(channel: Channel): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  const result = {
    processed: 0,
    skipped: 0,
    errors: 0
  };

  if (!channel.blotataEnabled || !channel.driveInputFolderId) {
    return result;
  }

  try {
    // Очищаем folderId от параметров URL
    const cleanedFolderId = cleanFolderId(channel.driveInputFolderId!);
    
    Logger.info("blottataDriveMonitor: Checking folder for new files", {
      channelId: channel.id,
      folderId: cleanedFolderId,
      originalFolderId: channel.driveInputFolderId
    });

    // Получаем список файлов в папке
    const files = await getNewFilesInFolder(cleanedFolderId);

    Logger.info("blottataDriveMonitor: Found files in folder", {
      channelId: channel.id,
      folderId: channel.driveInputFolderId,
      filesCount: files.length
    });

    // Для каналов с Google Drive Folder ID всегда переобрабатываем файлы
    // даже если они уже были обработаны ранее
    const alwaysReprocessFromDrive = Boolean(channel.driveInputFolderId);

    // Обрабатываем каждый файл
    for (const file of files) {
      if (!alwaysReprocessFromDrive) {
        // Для каналов БЕЗ Google Drive Folder ID проверяем, был ли файл уже обработан
        // и пропускаем его, если он уже был обработан
        const processedCheck = await isFileProcessed(channel.id, file.id);
        if (processedCheck.processed) {
          const processedDate = processedCheck.processedAt 
            ? new Date(processedCheck.processedAt).toISOString() 
            : 'unknown';
          Logger.info("blottataDriveMonitor: File already processed, skipping", {
            channelId: channel.id,
            fileId: file.id,
            fileName: file.name,
            source: processedCheck.source,
            processedAt: processedDate,
            processedAtTimestamp: processedCheck.processedAt
          });
          result.skipped++;
          continue;
        }
      } else {
        // Для каналов С Google Drive Folder ID всегда обрабатываем файлы,
        // даже если они уже были обработаны ранее
        // Логируем информацию о повторной обработке, если файл уже был обработан
        const existingCheck = await isFileProcessed(channel.id, file.id);
        if (existingCheck.processed) {
          const processedDate = existingCheck.processedAt 
            ? new Date(existingCheck.processedAt).toISOString() 
            : 'unknown';
          Logger.info("blottataDriveMonitor: File will be reprocessed (Google Drive folder)", {
            channelId: channel.id,
            fileId: file.id,
            fileName: file.name,
            previouslyProcessedAt: processedDate,
            reason: "alwaysReprocessFromDrive enabled"
          });
        }
      }

      try {
        // Обрабатываем файл
        const processResult = await processBlottataFile(channel, file.id);

        if (processResult.success) {
          // Помечаем файл как обработанный
          await markFileAsProcessed(channel.id, file.id);
          result.processed++;

          Logger.info("blottataDriveMonitor: File processed successfully", {
            channelId: channel.id,
            fileId: file.id,
            fileName: file.name,
            publishedPlatforms: processResult.publishedPlatforms
          });
        } else {
          result.errors++;
          Logger.error("blottataDriveMonitor: File processing failed", {
            channelId: channel.id,
            fileId: file.id,
            fileName: file.name,
            errors: processResult.errors
          });
        }
      } catch (error: any) {
        result.errors++;
        Logger.error("blottataDriveMonitor: Error processing file", {
          channelId: channel.id,
          fileId: file.id,
          fileName: file.name,
          error: error?.message || String(error)
        });
      }
    }

    return result;
  } catch (error: any) {
    Logger.error("blottataDriveMonitor: Error checking folder", {
      channelId: channel.id,
      channelName: channel.name,
      folderId: channel.driveInputFolderId,
      error: error?.message || String(error),
      errorCode: error?.code,
      errorStack: error?.stack
    });
    // Не пробрасываем ошибку дальше, чтобы не блокировать обработку других каналов
    // Вместо этого возвращаем результат с ошибкой
    result.errors++;
    return result;
  }
}

/**
 * Получает настройки расписания для пользователя (проверка паузы автоматизации)
 */
async function getScheduleSettingsForUser(userId: string): Promise<{ isAutomationPaused: boolean } | null> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("blottataDriveMonitor: Firestore is not available, cannot check automation pause status", { userId });
    return null;
  }

  try {
    const settingsRef = db
      .collection("users")
      .doc(userId)
      .collection("settings")
      .doc("schedule");
    
    const settingsSnap = await settingsRef.get();
    
    if (!settingsSnap.exists) {
      // Настройки не найдены, возвращаем дефолтные (пауза выключена)
      return { isAutomationPaused: false };
    }

    const data = settingsSnap.data();
    return {
      isAutomationPaused: typeof data?.isAutomationPaused === "boolean" 
        ? data.isAutomationPaused 
        : false
    };
  } catch (error: any) {
    Logger.error("blottataDriveMonitor: Failed to get schedule settings for user", {
      userId,
      error: error?.message || String(error)
    });
    return null;
  }
}

/**
 * Получает все каналы с включенной Blottata автоматизацией
 */
export async function getChannelsWithBlottataEnabled(): Promise<Array<Channel & { ownerId: string }>> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("blottataDriveMonitor: Firestore is not available");
    return [];
  }

  const channels: Array<Channel & { ownerId: string }> = [];

  try {
    // Используем Collection Group Query для поиска всех каналов
    const channelsSnapshot = await db.collectionGroup("channels").get();

    for (const doc of channelsSnapshot.docs) {
      const data = doc.data();
      
      // Извлекаем userId из пути документа: users/{userId}/channels/{channelId}
      const pathParts = doc.ref.path.split("/");
      const userIdIndex = pathParts.indexOf("users");
      const ownerId = userIdIndex !== -1 && userIdIndex + 1 < pathParts.length 
        ? pathParts[userIdIndex + 1] 
        : null;
      
      if (!ownerId) {
        Logger.warn("blottataDriveMonitor: Could not extract userId from channel path", {
          channelId: doc.id,
          path: doc.ref.path
        });
        continue;
      }
      
      // Проверяем, включена ли Blottata автоматизация
      if (data.blotataEnabled === true && data.driveInputFolderId) {
        const channel: Channel & { ownerId: string } = {
          id: doc.id,
          ownerId,
          ...data,
          createdAt: data.createdAt || { seconds: 0, nanoseconds: 0 },
          updatedAt: data.updatedAt || { seconds: 0, nanoseconds: 0 }
        } as Channel & { ownerId: string };

        channels.push(channel);
      }
    }

    Logger.info("blottataDriveMonitor: Found channels with Blottata enabled", {
      count: channels.length,
      channelIds: channels.map((c) => c.id)
    });

    return channels;
  } catch (error: any) {
    Logger.error("blottataDriveMonitor: Failed to get channels", {
      error: error?.message || String(error)
    });
    return [];
  }
}

/**
 * Основная функция мониторинга - проверяет все каналы с Blottata и обрабатывает новые файлы
 */
export async function processBlottataTick(): Promise<void> {
  const startTime = Date.now();
  Logger.info("blottataDriveMonitor: Starting Blottata monitoring tick", {
    timestamp: new Date().toISOString()
  });

  try {
    // Получаем все каналы с включенной Blottata
    const channels = await getChannelsWithBlottataEnabled();

    if (channels.length === 0) {
      Logger.info("blottataDriveMonitor: No channels with Blottata enabled");
      return;
    }

    Logger.info("blottataDriveMonitor: Processing channels", {
      channelsCount: channels.length
    });

    // Группируем каналы по пользователям для проверки паузы
    const channelsByUser = new Map<string, Array<Channel & { ownerId: string }>>();
    for (const channel of channels) {
      if (!channelsByUser.has(channel.ownerId)) {
        channelsByUser.set(channel.ownerId, []);
      }
      channelsByUser.get(channel.ownerId)!.push(channel);
    }

    // Проверяем паузу для каждого пользователя
    const userPauseStatus = new Map<string, boolean>();
    for (const [userId, userChannels] of channelsByUser.entries()) {
      const settings = await getScheduleSettingsForUser(userId);
      const isPaused = settings?.isAutomationPaused === true;
      userPauseStatus.set(userId, isPaused);
      
      if (isPaused) {
        Logger.info("blottataDriveMonitor: Automation is paused for user", {
          userId,
          channelsCount: userChannels.length,
          channelIds: userChannels.map(c => c.id)
        });
      }
    }

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalSkippedDueToPause = 0;

    // Обрабатываем каждый канал
    for (const channel of channels) {
      // Проверяем паузу для пользователя этого канала
      const isPaused = userPauseStatus.get(channel.ownerId) === true;
      if (isPaused) {
        Logger.info("blottataDriveMonitor: Channel skipped because automation is paused", {
          channelId: channel.id,
          channelName: channel.name,
          userId: channel.ownerId,
          folderId: channel.driveInputFolderId
        });
        totalSkippedDueToPause++;
        continue;
      }

      try {
        Logger.info("blottataDriveMonitor: Starting processing for channel", {
          channelId: channel.id,
          channelName: channel.name,
          folderId: channel.driveInputFolderId
        });

        const result = await processNewFilesForChannel(channel);
        totalProcessed += result.processed;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        
        if (result.errors > 0) {
          Logger.warn("blottataDriveMonitor: Channel processing completed with errors", {
            channelId: channel.id,
            channelName: channel.name,
            folderId: channel.driveInputFolderId,
            processed: result.processed,
            skipped: result.skipped,
            errors: result.errors
          });
        } else if (result.processed > 0 || result.skipped > 0) {
          Logger.info("blottataDriveMonitor: Channel processing completed successfully", {
            channelId: channel.id,
            channelName: channel.name,
            processed: result.processed,
            skipped: result.skipped
          });
        }
      } catch (error: any) {
        totalErrors++;
        Logger.error("blottataDriveMonitor: Error processing channel (exception caught)", {
          channelId: channel.id,
          channelName: channel.name,
          folderId: channel.driveInputFolderId,
          error: error?.message || String(error),
          errorCode: error?.code,
          errorName: error?.name,
          errorStack: error?.stack
        });
      }
    }

    const duration = Date.now() - startTime;
    Logger.info("blottataDriveMonitor: Monitoring tick completed", {
      duration,
      channelsProcessed: channels.length,
      channelsSkippedDueToPause: totalSkippedDueToPause,
      totalProcessed,
      totalSkipped,
      totalErrors
    });
  } catch (error: any) {
    Logger.error("blottataDriveMonitor: Error in monitoring tick", {
      error: error?.message || String(error),
      stack: error?.stack
    });
  }
}

