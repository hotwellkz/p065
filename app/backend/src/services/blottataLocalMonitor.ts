import * as fs from "fs/promises";
import * as path from "path";
import { Logger } from "../utils/logger";
import { processBlottataLocalFile } from "./blottataLocalFileProcessor";
import type { Channel } from "../types/channel";
import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { getUserChannelStoragePaths, ensureChannelDirectories as ensureUserChannelDirectories } from "./storage/userChannelStorage";

/**
 * Хранилище обработанных файлов для предотвращения повторной обработки
 * Ключ: `${channelId}:${fileName}`
 * Значение: timestamp обработки
 */
const processedFiles = new Map<string, number>();

/**
 * Проверяет, был ли файл уже обработан
 */
async function isFileProcessed(channelId: string, fileName: string): Promise<{ processed: boolean; source?: 'memory' | 'firestore'; processedAt?: number }> {
  const memoryKey = `${channelId}:${fileName}`;
  
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
      Logger.warn("blottataLocalMonitor: Failed to check Firestore for processed file", {
        channelId,
        fileName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { processed: false };
}

/**
 * Помечает файл как обработанный
 */
async function markFileAsProcessed(channelId: string, fileName: string): Promise<void> {
  const memoryKey = `${channelId}:${fileName}`;
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
          fileName,
          processedAt,
          processedAtISO: new Date(processedAt).toISOString()
        });
    } catch (error) {
      Logger.warn("blottataLocalMonitor: Failed to save processed file to Firestore", {
        channelId,
        fileName,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Получает список видео-файлов в папке
 */
async function getVideoFilesInDirectory(dirPath: string): Promise<Array<{ fileName: string; filePath: string; stats: any }>> {
  try {
    const files = await fs.readdir(dirPath);
    const videoFiles: Array<{ fileName: string; filePath: string; stats: any }> = [];

    // Расширения видео-файлов
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv', '.wmv'];

    for (const file of files) {
      // Пропускаем lock-файлы и служебные файлы
      if (file.endsWith('.lock') || file.startsWith('.')) {
        continue;
      }

      const filePath = path.join(dirPath, file);
      
      try {
        const stats = await fs.stat(filePath);
        
        // Проверяем, что это файл (не папка)
        if (!stats.isFile()) {
          continue;
        }

        // Проверяем расширение
        const ext = path.extname(file).toLowerCase();
        if (videoExtensions.includes(ext)) {
          videoFiles.push({
            fileName: file,
            filePath,
            stats
          });
        }
      } catch (statError) {
        // Игнорируем ошибки доступа к отдельным файлам
        Logger.warn("blottataLocalMonitor: Failed to stat file", {
          filePath,
          error: statError instanceof Error ? statError.message : String(statError)
        });
      }
    }

    return videoFiles;
  } catch (error) {
    Logger.error("blottataLocalMonitor: Failed to read directory", {
      dirPath,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/**
 * Обрабатывает новые файлы для канала
 */
export async function processNewFilesForChannel(channel: Channel & { ownerId?: string }): Promise<{
  processed: number;
  skipped: number;
  errors: number;
}> {
  const result = {
    processed: 0,
    skipped: 0,
    errors: 0
  };

  if (!channel.blotataEnabled) {
    return result;
  }

  try {
    // Получаем email пользователя
    if (!channel.ownerId) {
      Logger.warn("blottataLocalMonitor: Channel has no ownerId", { channelId: channel.id });
      return result;
    }

    // Получаем email пользователя из Firebase Auth
    let userEmail = `${channel.ownerId}@unknown.local`;
    try {
      const { getAdmin } = await import("./firebaseAdmin");
      const admin = getAdmin();
      if (admin) {
        const userRecord = await admin.auth().getUser(channel.ownerId);
        userEmail = userRecord.email || userEmail;
      }
    } catch (authError: any) {
      Logger.warn("blottataLocalMonitor: Failed to get user email from Firebase Auth, using fallback", {
        userId: channel.ownerId,
        channelId: channel.id,
        error: authError?.message || String(authError)
      });
    }

    // Получаем пути к хранилищу канала пользователя
    const channelName = channel.name || `channel_${channel.id}`;
    // ownerId уже проверен выше, но TypeScript требует явного приведения
    if (!channel.ownerId) {
      Logger.warn("blottataLocalMonitor: Channel ownerId is missing after check", { channelId: channel.id });
      return result;
    }
    const paths = getUserChannelStoragePaths({
      userId: channel.ownerId,
      userEmail,
      channelId: channel.id,
      channelName
    });
    
    // Создаём директории, если их нет
    await ensureUserChannelDirectories(paths);

    console.log('[BlotataMonitor] Scanning channel folder', {
      channelId: channel.id,
      channelName,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir
    });

    Logger.info("blottataLocalMonitor: Checking folder for new files", {
      channelId: channel.id,
      channelName,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir
    });

    // Получаем список видео-файлов в inputDir
    const files = await getVideoFilesInDirectory(paths.inputDir);

    if (files.length === 0) {
      Logger.info("blottataLocalMonitor: No files to publish for channel", {
        channelId: channel.id,
        channelName,
        inputDir: paths.inputDir
      });
      return result;
    }

    Logger.info("blottataLocalMonitor: Found files in folder", {
      channelId: channel.id,
      channelName,
      filesCount: files.length,
      files: files.map(f => f.fileName)
    });

    // Обрабатываем каждый файл
    for (const file of files) {
      const lockFilePath = path.join(paths.inputDir, `${file.fileName}.lock`);
      
      // Проверяем наличие lock-файла (файл обрабатывается)
      try {
        await fs.access(lockFilePath);
        Logger.info("blottataLocalMonitor: File is being processed (lock exists), skipping", {
          channelId: channel.id,
          fileName: file.fileName
        });
        result.skipped++;
        continue;
      } catch {
        // Lock-файла нет, продолжаем
      }

      // Проверяем, был ли файл уже обработан
      const processedCheck = await isFileProcessed(channel.id, file.fileName);
      if (processedCheck.processed) {
        const processedDate = processedCheck.processedAt 
          ? new Date(processedCheck.processedAt).toISOString() 
          : 'unknown';
        Logger.info("blottataLocalMonitor: File already processed, skipping", {
          channelId: channel.id,
          fileName: file.fileName,
          source: processedCheck.source,
          processedAt: processedDate
        });
        result.skipped++;
        continue;
      }

      // Создаём lock-файл
      try {
        await fs.writeFile(lockFilePath, JSON.stringify({
          channelId: channel.id,
          fileName: file.fileName,
          startedAt: new Date().toISOString()
        }), 'utf-8');
      } catch (lockError) {
        Logger.warn("blottataLocalMonitor: Failed to create lock file", {
          channelId: channel.id,
          fileName: file.fileName,
          error: lockError instanceof Error ? lockError.message : String(lockError)
        });
        // Продолжаем обработку даже если lock не создан
      }

      try {
        // Обрабатываем файл
        const processResult = await processBlottataLocalFile(channel, file.fileName, paths);

        if (processResult.success) {
          // Помечаем файл как обработанный
          await markFileAsProcessed(channel.id, file.fileName);
          result.processed++;

          Logger.info("blottataLocalMonitor: File processed successfully", {
            channelId: channel.id,
            fileName: file.fileName,
            publishedPlatforms: processResult.publishedPlatforms
          });
        } else {
          result.errors++;
          Logger.error("blottataLocalMonitor: File processing failed", {
            channelId: channel.id,
            fileName: file.fileName,
            errors: processResult.errors
          });
        }
      } catch (error: any) {
        result.errors++;
        Logger.error("blottataLocalMonitor: Error processing file", {
          channelId: channel.id,
          fileName: file.fileName,
          error: error?.message || String(error)
        });
      } finally {
        // Удаляем lock-файл в любом случае
        try {
          await fs.unlink(lockFilePath).catch(() => {
            // Игнорируем ошибки удаления lock-файла
          });
        } catch {
          // Игнорируем
        }
      }
    }

    return result;
  } catch (error: any) {
    Logger.error("blottataLocalMonitor: Error checking folder", {
      channelId: channel.id,
      channelName: channel.name,
      error: error?.message || String(error),
      errorStack: error?.stack
    });
    result.errors++;
    return result;
  }
}

/**
 * Получает настройки расписания для пользователя (проверка паузы автоматизации)
 */
async function getScheduleSettingsForUser(userId: string): Promise<{ isAutomationPaused: boolean } | null> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("blottataLocalMonitor: Firestore is not available, cannot check automation pause status", { userId });
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
      return { isAutomationPaused: false };
    }

    const data = settingsSnap.data();
    return {
      isAutomationPaused: typeof data?.isAutomationPaused === "boolean" 
        ? data.isAutomationPaused 
        : false
    };
  } catch (error: any) {
    Logger.error("blottataLocalMonitor: Failed to get schedule settings for user", {
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
    Logger.warn("blottataLocalMonitor: Firestore is not available");
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
        Logger.warn("blottataLocalMonitor: Could not extract userId from channel path", {
          channelId: doc.id,
          path: doc.ref.path
        });
        continue;
      }
      
      // Проверяем, включена ли Blottata автоматизация
      // Теперь не требуем driveInputFolderId, так как используем локальное хранилище
      if (data.blotataEnabled === true) {
        // Проверяем наличие необходимых настроек Blotato
        const hasApiKey = !!(data.blotataApiKey || process.env.BLOTATA_API_KEY);
        const hasAtLeastOneAccount = !!(
          data.blotataYoutubeId || 
          data.blotataTiktokId || 
          data.blotataInstagramId ||
          data.blotataFacebookId ||
          data.blotataThreadsId ||
          data.blotataTwitterId ||
          data.blotataLinkedinId ||
          data.blotataPinterestId ||
          data.blotataBlueskyId
        );

        if (!hasApiKey || !hasAtLeastOneAccount) {
          Logger.warn("blottataLocalMonitor: Channel has Blotato enabled but missing config", {
            channelId: doc.id,
            ownerId,
            hasApiKey,
            hasAtLeastOneAccount,
            hasYoutube: !!data.blotataYoutubeId,
            hasTiktok: !!data.blotataTiktokId,
            hasInstagram: !!data.blotataInstagramId
          });
          // Не добавляем канал в список, но логируем для отладки
          continue;
        }

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

    Logger.info("blottataLocalMonitor: Found channels with Blottata enabled", {
      count: channels.length,
      channelIds: channels.map((c) => c.id)
    });

    return channels;
  } catch (error: any) {
    Logger.error("blottataLocalMonitor: Failed to get channels", {
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
  Logger.info("blottataLocalMonitor: Starting Blottata monitoring tick", {
    timestamp: new Date().toISOString()
  });

  try {
    // Получаем все каналы с включенной Blottata
    const channels = await getChannelsWithBlottataEnabled();

    if (channels.length === 0) {
      Logger.info("blottataLocalMonitor: No channels with Blottata enabled");
      return;
    }

    Logger.info("blottataLocalMonitor: Processing channels", {
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
        Logger.info("blottataLocalMonitor: Automation is paused for user", {
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
        Logger.info("blottataLocalMonitor: Channel skipped because automation is paused", {
          channelId: channel.id,
          channelName: channel.name,
          userId: channel.ownerId
        });
        totalSkippedDueToPause++;
        continue;
      }

      try {
        Logger.info("blottataLocalMonitor: Starting processing for channel", {
          channelId: channel.id,
          channelName: channel.name
        });

        const result = await processNewFilesForChannel(channel);
        totalProcessed += result.processed;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
        
        if (result.errors > 0) {
          Logger.warn("blottataLocalMonitor: Channel processing completed with errors", {
            channelId: channel.id,
            channelName: channel.name,
            processed: result.processed,
            skipped: result.skipped,
            errors: result.errors
          });
        } else if (result.processed > 0 || result.skipped > 0) {
          Logger.info("blottataLocalMonitor: Channel processing completed successfully", {
            channelId: channel.id,
            channelName: channel.name,
            processed: result.processed,
            skipped: result.skipped
          });
        }
      } catch (error: any) {
        totalErrors++;
        Logger.error("blottataLocalMonitor: Error processing channel (exception caught)", {
          channelId: channel.id,
          channelName: channel.name,
          ownerId: channel.ownerId,
          error: error?.message || String(error),
          errorCode: error?.code,
          errorName: error?.name,
          errorStack: error?.stack?.substring(0, 500) // Ограничиваем длину stack trace
        });
      }
    }

    const duration = Date.now() - startTime;
    Logger.info("blottataLocalMonitor: Monitoring tick completed", {
      duration,
      channelsProcessed: channels.length,
      channelsSkippedDueToPause: totalSkippedDueToPause,
      totalProcessed,
      totalSkipped,
      totalErrors
    });
  } catch (error: any) {
    Logger.error("blottataLocalMonitor: Error in monitoring tick", {
      error: error?.message || String(error),
      stack: error?.stack
    });
  }
}

