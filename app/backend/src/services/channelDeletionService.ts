import * as fs from "fs/promises";
import * as path from "path";
import * as admin from "firebase-admin";
import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable, getAdmin } from "./firebaseAdmin";
import { getUserChannelStoragePaths } from "./storage/userChannelStorage";

/**
 * Сервис для полного каскадного удаления канала
 */
export class ChannelDeletionService {
  /**
   * Полностью удаляет канал и все связанные данные
   * @param userId - ID пользователя
   * @param channelId - ID канала
   * @throws Error если канал не принадлежит пользователю или произошла критическая ошибка
   */
  async deleteChannelCompletely(userId: string, channelId: string): Promise<void> {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }

    Logger.info("ChannelDeletionService: Starting channel deletion", {
      userId,
      channelId
    });

    // 1. Получаем данные канала и проверяем права
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelDoc = await channelRef.get();

    if (!channelDoc.exists) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const channelData = channelDoc.data();
    if (!channelData) {
      throw new Error(`Channel ${channelId} has no data`);
    }

    const channelName = channelData.name || `channel_${channelId}`;

    // 2. Получаем email пользователя
    let userEmail = `${userId}@unknown.local`;
    try {
      const admin = getAdmin();
      if (admin) {
        const userRecord = await admin.auth().getUser(userId);
        userEmail = userRecord.email || userEmail;
      }
    } catch (authError: any) {
      Logger.warn("ChannelDeletionService: Failed to get user email, using fallback", {
        userId,
        error: authError?.message || String(authError)
      });
    }

    Logger.info("ChannelDeletionService: Channel data retrieved", {
      userId,
      channelId,
      channelName,
      userEmail
    });

    // 3. Удаляем все связанные данные из Firestore
    await this.deleteChannelFirestoreData(channelId, userId);

    // 4. Удаляем локальное хранилище
    await this.deleteChannelStorage(userId, userEmail, channelId, channelName);

    Logger.info("ChannelDeletionService: Channel deletion completed", {
      userId,
      channelId,
      channelName
    });
  }

  /**
   * Удаляет все связанные данные канала из Firestore
   */
  private async deleteChannelFirestoreData(channelId: string, userId: string): Promise<void> {
    if (!isFirestoreAvailable() || !db) {
      Logger.warn("ChannelDeletionService: Firestore not available, skipping Firestore deletion");
      return;
    }

    Logger.info("ChannelDeletionService: Starting Firestore data deletion", {
      channelId,
      userId
    });

    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    
    // Используем массив батчей для обработки большого количества операций
    // Firestore batch имеет лимит 500 операций
    const batches: admin.firestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    let currentBatchOps = 0;
    const MAX_BATCH_OPS = 450; // Оставляем запас от лимита 500

    const addToBatch = (ref: admin.firestore.DocumentReference) => {
      if (!db) {
        throw new Error("Firestore database not initialized");
      }
      if (currentBatchOps >= MAX_BATCH_OPS) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        currentBatchOps = 0;
      }
      currentBatch.delete(ref);
      currentBatchOps++;
    };

    try {
      // 1. Удаляем подколлекции канала
      const subcollections = [
        "autoSendSchedules",
        "generatedVideos",
        "scripts",
        "preferences",
        "aiPromptsHistory",
        "debugLogs"
      ];

      for (const subcollectionName of subcollections) {
        try {
          const subcollectionRef = channelRef.collection(subcollectionName);
          const subcollectionSnapshot = await subcollectionRef.get();
          
          if (!subcollectionSnapshot.empty) {
            Logger.info(`ChannelDeletionService: Deleting subcollection ${subcollectionName}`, {
              channelId,
              count: subcollectionSnapshot.size
            });

            subcollectionSnapshot.docs.forEach((doc) => {
              addToBatch(doc.ref);
            });
          }
        } catch (subcollectionError: any) {
          Logger.warn(`ChannelDeletionService: Error deleting subcollection ${subcollectionName}`, {
            channelId,
            error: subcollectionError?.message || String(subcollectionError)
          });
          // Продолжаем удаление других подколлекций
        }
      }

      // 2. Удаляем записи из error_logs (фильтруем по userId и channelId)
      try {
        const errorLogsSnapshot = await db.collection("error_logs")
          .where("userId", "==", userId)
          .where("channelId", "==", channelId)
          .get();

        if (!errorLogsSnapshot.empty) {
          Logger.info("ChannelDeletionService: Deleting error logs", {
            channelId,
            count: errorLogsSnapshot.size
          });

          errorLogsSnapshot.docs.forEach((doc) => {
            addToBatch(doc.ref);
          });
        }
      } catch (errorLogsError: any) {
        Logger.warn("ChannelDeletionService: Error deleting error logs", {
          channelId,
          error: errorLogsError?.message || String(errorLogsError)
        });
      }

      // 3. Удаляем уведомления, связанные с каналом
      try {
        const notificationsSnapshot = await db.collection("notifications")
          .where("userId", "==", userId)
          .where("channelId", "==", channelId)
          .get();

        if (!notificationsSnapshot.empty) {
          Logger.info("ChannelDeletionService: Deleting notifications", {
            channelId,
            count: notificationsSnapshot.size
          });

          notificationsSnapshot.docs.forEach((doc) => {
            addToBatch(doc.ref);
          });
        }
      } catch (notificationsError: any) {
        Logger.warn("ChannelDeletionService: Error deleting notifications", {
          channelId,
          error: notificationsError?.message || String(notificationsError)
        });
      }

      // 4. Удаляем записи из blottataProcessedFiles (если есть)
      try {
        const processedFilesSnapshot = await db.collection("blottataProcessedFiles")
          .where("channelId", "==", channelId)
          .get();

        if (!processedFilesSnapshot.empty) {
          Logger.info("ChannelDeletionService: Deleting processed files records", {
            channelId,
            count: processedFilesSnapshot.size
          });

          processedFilesSnapshot.docs.forEach((doc) => {
            addToBatch(doc.ref);
          });
        }
      } catch (processedFilesError: any) {
        Logger.warn("ChannelDeletionService: Error deleting processed files records", {
          channelId,
          error: processedFilesError?.message || String(processedFilesError)
        });
      }

      // 5. Удаляем основной документ канала
      addToBatch(channelRef);

      // Добавляем последний батч
      if (currentBatchOps > 0) {
        batches.push(currentBatch);
      }

      // Выполняем все батчи
      if (batches.length > 0) {
        Logger.info("ChannelDeletionService: Committing batches", {
          channelId,
          batchesCount: batches.length
        });

        await Promise.all(batches.map(batch => batch.commit()));

        Logger.info("ChannelDeletionService: All batches committed", {
          channelId,
          batchesCount: batches.length
        });
      } else {
        Logger.warn("ChannelDeletionService: No operations to commit", {
          channelId
        });
      }

      Logger.info("ChannelDeletionService: Firestore data deletion completed", {
        channelId,
        userId
      });
    } catch (error: any) {
      Logger.error("ChannelDeletionService: Error deleting Firestore data", {
        channelId,
        userId,
        error: error?.message || String(error),
        stack: error?.stack
      });
      throw new Error(`Failed to delete Firestore data: ${error?.message || String(error)}`);
    }
  }

  /**
   * Удаляет локальное хранилище канала (папки с видео)
   */
  private async deleteChannelStorage(
    userId: string,
    userEmail: string,
    channelId: string,
    channelName: string
  ): Promise<void> {
    try {
      const paths = getUserChannelStoragePaths({
        userId,
        userEmail,
        channelId,
        channelName
      });

      // channelDir = inputDir (это корневая папка канала)
      // Структура: STORAGE_ROOT/userSlug/channelSlug/
      const channelDir = paths.inputDir;

      Logger.info("ChannelDeletionService: Starting storage deletion", {
        channelId,
        channelName,
        channelDir
      });

      // Проверяем существование папки
      try {
        await fs.access(channelDir);
      } catch {
        // Папка не существует, это нормально
        Logger.info("ChannelDeletionService: Channel directory does not exist, skipping", {
          channelId,
          channelDir
        });
        return;
      }

      // Рекурсивно удаляем папку канала
      await fs.rm(channelDir, { recursive: true, force: true });

      Logger.info("ChannelDeletionService: Storage deletion completed", {
        channelId,
        channelName,
        channelDir
      });

      // Опционально: проверяем, пуста ли папка пользователя, и удаляем её, если пуста
      try {
        const userDir = paths.userDir;
        const userDirContents = await fs.readdir(userDir);
        
        if (userDirContents.length === 0) {
          Logger.info("ChannelDeletionService: User directory is empty, removing it", {
            userId,
            userDir
          });
          await fs.rmdir(userDir);
        }
      } catch (userDirError: any) {
        // Игнорируем ошибки при удалении папки пользователя
        Logger.warn("ChannelDeletionService: Could not remove user directory", {
          userId,
          error: userDirError?.message || String(userDirError)
        });
      }
    } catch (error: any) {
      Logger.error("ChannelDeletionService: Error deleting storage", {
        channelId,
        channelName,
        error: error?.message || String(error),
        stack: error?.stack
      });
      // Не бросаем ошибку, так как БД уже может быть очищена
      // Логируем, но продолжаем
    }
  }
}

export const channelDeletionService = new ChannelDeletionService();

