/**
 * Скрипт миграции папок каналов из старого формата в новый
 * Старый формат: channels/{channelId}
 * Новый формат: channels/{channelSlug__channelId}
 * 
 * Запуск: node dist/scripts/migrateChannelFolders.js
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getStorageService } from '../services/storageService';
import { getOrCreateChannelInitialName, buildChannelFolderKey } from '../utils/channelUtils';
import { Logger } from '../utils/logger';
import { db, isFirestoreAvailable } from '../services/firebaseAdmin';

interface MigrationReport {
  totalFoldersScanned: number;
  migratedFolders: { oldPath: string; newPath: string; userId: string; channelId: string; channelFolderKey: string }[];
  orphanedFolders: { oldPath: string; reason: string }[];
  errors: { path: string; error: string }[];
  timestamp: string;
}

async function migrateChannelFolders() {
  if (!isFirestoreAvailable() || !db) {
    Logger.error('[MIGRATION] Firestore is not available');
    process.exit(1);
  }

  const storage = getStorageService();
  const videosRoot = storage.getVideosRoot();
  const usersRoot = path.join(videosRoot, 'users');

  const report: MigrationReport = {
    totalFoldersScanned: 0,
    migratedFolders: [],
    orphanedFolders: [],
    errors: [],
    timestamp: new Date().toISOString(),
  };

  Logger.info('[MIGRATION] Starting channel folder migration', { usersRoot });

  try {
    // Читаем все папки пользователей
    const userDirs = await fs.readdir(usersRoot, { withFileTypes: true });

    for (const userDirEntry of userDirs) {
      if (!userDirEntry.isDirectory()) continue;
      if (userDirEntry.name === '_orphaned') continue;

      const userFolderKey = userDirEntry.name;
      const userChannelsRoot = path.join(usersRoot, userFolderKey, 'channels');

      try {
        // Проверяем существование папки channels
        await fs.access(userChannelsRoot);
      } catch {
        // Папки channels нет - пропускаем
        continue;
      }

      // Извлекаем userId из userFolderKey (формат: emailSlug__userId)
      const userIdMatch = userFolderKey.match(/__([a-zA-Z0-9]{28})$/);
      const userId = userIdMatch ? userIdMatch[1] : userFolderKey; // Fallback на старый формат

      Logger.info('[MIGRATION] Processing user channels', { userFolderKey, userId });

      try {
        const channelDirs = await fs.readdir(userChannelsRoot, { withFileTypes: true });

        for (const channelDirEntry of channelDirs) {
          if (!channelDirEntry.isDirectory()) continue;
          if (channelDirEntry.name === '_orphaned') continue;

          const oldFolderName = channelDirEntry.name;
          const oldFolderPath = path.join(userChannelsRoot, oldFolderName);
          report.totalFoldersScanned++;

          // Проверяем, является ли папка старым форматом (только channelId)
          // channelId - это обычно 28-символьная строка Firebase ID
          const isOldFormat = oldFolderName.length === 28 && /^[a-zA-Z0-9]+$/.test(oldFolderName);
          const isNewFormat = oldFolderName.includes('__') && oldFolderName.length > 28;

          if (isNewFormat) {
            Logger.info('[MIGRATION] Skipping folder, already in new format', { oldFolderName });
            continue;
          }

          if (!isOldFormat) {
            // Неизвестный формат - перемещаем в _orphaned
            const orphanedPath = path.join(userChannelsRoot, '_orphaned', oldFolderName);
            try {
              await fs.mkdir(path.dirname(orphanedPath), { recursive: true });
              await fs.rename(oldFolderPath, orphanedPath);
              Logger.warn('[MIGRATION] Unknown folder format, moved to _orphaned', {
                oldFolderPath,
                orphanedPath
              });
              report.orphanedFolders.push({
                oldPath: oldFolderPath,
                reason: 'Unknown folder format'
              });
            } catch (error) {
              Logger.error('[MIGRATION] Failed to move to _orphaned', {
                oldFolderPath,
                error: String(error)
              });
              report.errors.push({
                path: oldFolderPath,
                error: `Failed to move to _orphaned: ${String(error)}`
              });
            }
            continue;
          }

          // Старый формат - мигрируем
          const channelId = oldFolderName;
          Logger.info('[MIGRATION] Found old-format channel folder', { userId, channelId, oldFolderPath });

          try {
            // Получаем initialName канала
            const initialName = await getOrCreateChannelInitialName(userId, channelId);
            const channelFolderKey = buildChannelFolderKey(initialName, channelId);
            const newFolderPath = path.join(userChannelsRoot, channelFolderKey);

            if (oldFolderPath === newFolderPath) {
              Logger.info('[MIGRATION] Folder already in correct format', { oldFolderPath });
              continue;
            }

            // Проверяем, не существует ли уже папка с новым именем
            try {
              await fs.access(newFolderPath);
              Logger.warn('[MIGRATION] Target folder already exists, skipping', {
                oldFolderPath,
                newFolderPath
              });
              // Перемещаем старую папку в _orphaned, чтобы не потерять данные
              const orphanedPath = path.join(userChannelsRoot, '_orphaned', `${oldFolderName}_conflict_${Date.now()}`);
              await fs.mkdir(path.dirname(orphanedPath), { recursive: true });
              await fs.rename(oldFolderPath, orphanedPath);
              report.orphanedFolders.push({
                oldPath: oldFolderPath,
                reason: `Target folder already exists: ${channelFolderKey}`
              });
              continue;
            } catch {
              // Папка не существует - можно переименовывать
            }

            // Выполняем переименование
            Logger.info('[MIGRATION] Renaming channel folder', {
              oldFolderPath,
              newFolderPath,
              userId,
              channelId,
              initialName,
              channelFolderKey
            });

            await fs.rename(oldFolderPath, newFolderPath);

            report.migratedFolders.push({
              oldPath: oldFolderPath,
              newPath: newFolderPath,
              userId,
              channelId,
              channelFolderKey
            });

            Logger.info('[MIGRATION] Channel folder migrated successfully', {
              userId,
              channelId,
              channelFolderKey
            });
          } catch (error) {
            Logger.error('[MIGRATION] Error processing channel folder', {
              oldFolderPath,
              userId,
              channelId,
              error: String(error)
            });

            // В случае ошибки перемещаем в _orphaned
            const orphanedPath = path.join(userChannelsRoot, '_orphaned', oldFolderName);
            try {
              await fs.mkdir(path.dirname(orphanedPath), { recursive: true });
              await fs.rename(oldFolderPath, orphanedPath);
              report.orphanedFolders.push({
                oldPath: oldFolderPath,
                reason: `Error during migration: ${String(error)}`
              });
            } catch (renameError) {
              Logger.error('[MIGRATION] Failed to move to _orphaned after error', {
                oldFolderPath,
                orphanedPath,
                error: String(renameError)
              });
              report.errors.push({
                path: oldFolderPath,
                error: `Migration failed and failed to move to _orphaned: ${String(error)}`
              });
            }
          }
        }
      } catch (error) {
        Logger.error('[MIGRATION] Error reading user channels directory', {
          userFolderKey,
          error: String(error)
        });
        report.errors.push({
          path: userChannelsRoot,
          error: `Failed to read channels directory: ${String(error)}`
        });
      }
    }

    // Сохраняем отчёт
    const reportPath = path.join(usersRoot, 'migration-channels-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    Logger.info('[MIGRATION] Migration completed. Report generated.', {
      reportPath,
      totalScanned: report.totalFoldersScanned,
      migrated: report.migratedFolders.length,
      orphaned: report.orphanedFolders.length,
      errors: report.errors.length
    });

    console.log('\n=== MIGRATION REPORT ===');
    console.log(`Total folders scanned: ${report.totalFoldersScanned}`);
    console.log(`Migrated: ${report.migratedFolders.length}`);
    console.log(`Orphaned: ${report.orphanedFolders.length}`);
    console.log(`Errors: ${report.errors.length}`);
    console.log(`\nReport saved to: ${reportPath}`);
  } catch (error) {
    Logger.error('[MIGRATION] Script failed', {
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

if (require.main === module) {
  migrateChannelFolders().catch(error => {
    Logger.error('[MIGRATION] Script failed', {
      error: String(error),
      stack: error?.stack
    });
    process.exit(1);
  });
}

export { migrateChannelFolders };


