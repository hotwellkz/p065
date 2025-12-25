/**
 * Скрипт миграции папок пользователей из старого формата в новый
 * 
 * Старый формат: storage/videos/users/{userId}/...
 * Новый формат: storage/videos/users/{emailSlug__userId}/...
 * 
 * Запуск: node dist/scripts/migrateUserFolders.js
 */

import * as path from "path";
import * as fs from "fs/promises";
import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { getAdmin } from "../services/firebaseAdmin";
import { getUserFolderKey, getOrCreateRegistrationEmail } from "../utils/userEmailUtils";
import { StorageService } from "../services/storageService";

interface MigrationReport {
  startTime: string;
  endTime?: string;
  totalFolders: number;
  migrated: number;
  skipped: number;
  orphaned: number;
  errors: number;
  details: {
    migrated: Array<{
      oldPath: string;
      newPath: string;
      userId: string;
      userFolderKey: string;
      registrationEmail: string;
    }>;
    skipped: Array<{
      path: string;
      reason: string;
    }>;
    orphaned: Array<{
      oldPath: string;
      newPath: string;
      userId: string;
    }>;
    errors: Array<{
      path: string;
      error: string;
    }>;
  };
}

async function migrateUserFolders(): Promise<void> {
  const report: MigrationReport = {
    startTime: new Date().toISOString(),
    totalFolders: 0,
    migrated: 0,
    skipped: 0,
    orphaned: 0,
    errors: 0,
    details: {
      migrated: [],
      skipped: [],
      orphaned: [],
      errors: []
    }
  };

  Logger.info("migrateUserFolders: starting migration", {
    startTime: report.startTime
  });

  if (!isFirestoreAvailable() || !db) {
    Logger.error("migrateUserFolders: Firestore not available");
    throw new Error("Firestore is not available");
  }

  const storage = new StorageService();
  const videosRoot = storage.getVideosRoot();
  const usersDir = path.join(videosRoot, "users");

  // Проверяем существование директории users
  try {
    await fs.access(usersDir);
  } catch (error) {
    Logger.warn("migrateUserFolders: users directory does not exist", {
      usersDir,
      error: error instanceof Error ? error.message : String(error)
    });
    Logger.info("migrateUserFolders: migration completed (nothing to migrate)", report);
    return;
  }

  // Получаем список всех папок в users/
  let userFolders: string[];
  try {
    userFolders = await fs.readdir(usersDir);
  } catch (error) {
    Logger.error("migrateUserFolders: failed to read users directory", {
      usersDir,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  report.totalFolders = userFolders.length;
  Logger.info("migrateUserFolders: found user folders", {
    count: userFolders.length,
    folders: userFolders
  });

  // Создаём директорию для orphaned папок
  const orphanedDir = path.join(usersDir, "_orphaned");
  try {
    await fs.mkdir(orphanedDir, { recursive: true });
  } catch (error) {
    Logger.warn("migrateUserFolders: failed to create orphaned directory", {
      orphanedDir,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Обрабатываем каждую папку
  for (const folderName of userFolders) {
    // Пропускаем служебные папки
    if (folderName.startsWith("_") || folderName === "lost+found") {
      report.skipped++;
      report.details.skipped.push({
        path: folderName,
        reason: "system folder"
      });
      continue;
    }

    const oldPath = path.join(usersDir, folderName);

    // Проверяем, является ли это папкой
    let stat;
    try {
      stat = await fs.stat(oldPath);
      if (!stat.isDirectory()) {
        report.skipped++;
        report.details.skipped.push({
          path: folderName,
          reason: "not a directory"
        });
        continue;
      }
    } catch (error) {
      report.errors++;
      report.details.errors.push({
        path: folderName,
        error: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    // Проверяем, является ли это старым форматом (просто userId) или новым (emailSlug__userId)
    const isNewFormat = folderName.includes("__");
    
    if (isNewFormat) {
      // Уже в новом формате - пропускаем
      report.skipped++;
      report.details.skipped.push({
        path: folderName,
        reason: "already in new format"
      });
      continue;
    }

    // Это старый формат - пытаемся определить userId
    const userId = folderName; // В старом формате имя папки = userId

    Logger.info("migrateUserFolders: processing folder", {
      userId,
      oldPath
    });

    try {
      // Получаем registrationEmail (создаём если нет)
      const registrationEmail = await getOrCreateRegistrationEmail(userId);
      
      // Формируем userFolderKey
      const userFolderKey = await getUserFolderKey(userId);

      Logger.info("migrateUserFolders: got userFolderKey", {
        userId,
        registrationEmail,
        userFolderKey
      });

      // Проверяем, не существует ли уже папка с новым именем
      const newPath = path.join(usersDir, userFolderKey);
      try {
        await fs.access(newPath);
        // Папка уже существует - это конфликт
        Logger.warn("migrateUserFolders: target folder already exists", {
          userId,
          oldPath,
          newPath,
          userFolderKey
        });
        
        // Перемещаем старую папку в orphaned с timestamp
        const timestamp = Date.now();
        const orphanedPath = path.join(orphanedDir, `${folderName}_${timestamp}`);
        await fs.rename(oldPath, orphanedPath);
        
        report.orphaned++;
        report.details.orphaned.push({
          oldPath,
          newPath: orphanedPath,
          userId
        });
        
        Logger.info("migrateUserFolders: moved to orphaned (conflict)", {
          userId,
          oldPath,
          orphanedPath
        });
        continue;
      } catch (error) {
        // Папка не существует - можно мигрировать
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }

      // Выполняем миграцию (атомарный rename)
      await fs.rename(oldPath, newPath);

      report.migrated++;
      report.details.migrated.push({
        oldPath,
        newPath,
        userId,
        userFolderKey,
        registrationEmail
      });

      Logger.info("migrateUserFolders: migrated successfully", {
        userId,
        oldPath,
        newPath,
        userFolderKey,
        registrationEmail
      });
    } catch (error) {
      // Ошибка при получении данных пользователя или миграции
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      Logger.error("migrateUserFolders: migration failed", {
        userId,
        oldPath,
        error: errorMessage
      });

      // Если userId не найден в базе - перемещаем в orphaned
      if (errorMessage.includes("not found") || errorMessage.includes("does not exist")) {
        const timestamp = Date.now();
        const orphanedPath = path.join(orphanedDir, `${folderName}_${timestamp}`);
        try {
          await fs.rename(oldPath, orphanedPath);
          report.orphaned++;
          report.details.orphaned.push({
            oldPath,
            newPath: orphanedPath,
            userId
          });
          Logger.info("migrateUserFolders: moved to orphaned (user not found)", {
            userId,
            oldPath,
            orphanedPath
          });
        } catch (renameError) {
          report.errors++;
          report.details.errors.push({
            path: oldPath,
            error: `Failed to move to orphaned: ${renameError instanceof Error ? renameError.message : String(renameError)}`
          });
        }
      } else {
        report.errors++;
        report.details.errors.push({
          path: oldPath,
          error: errorMessage
        });
      }
    }
  }

  report.endTime = new Date().toISOString();

  // Сохраняем отчёт
  const reportPath = path.join(videosRoot, "migration-users-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

  Logger.info("migrateUserFolders: migration completed", report);
  console.log("\n=== Migration Report ===");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport saved to: ${reportPath}`);
}

// Запуск скрипта
if (require.main === module) {
  migrateUserFolders()
    .then(() => {
      Logger.info("migrateUserFolders: script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      Logger.error("migrateUserFolders: script failed", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      console.error("Migration failed:", error);
      process.exit(1);
    });
}

export { migrateUserFolders };



