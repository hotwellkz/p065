/**
 * Единый сервис для работы с хранилищем видео
 * 
 * Структура:
 * storage/videos/users/{emailSlug__userId}/channels/{channelId}/inbox/{videoId}.mp4
 * storage/videos/users/{emailSlug__userId}/channels/{channelId}/uploaded/{platform}/{videoId}.mp4
 * storage/videos/users/{emailSlug__userId}/channels/{channelId}/failed/{videoId}.log
 * storage/videos/users/{emailSlug__userId}/channels/{channelId}/tmp/ (временные файлы)
 * 
 * userFolderKey формируется как: {emailSlug}__{userId}
 * где emailSlug - нормализованный registrationEmail (первичный email при регистрации)
 */

import * as path from "path";
import * as fs from "fs/promises";
import { Readable } from "stream";
import { Logger } from "../utils/logger";
import { pipeline } from "stream/promises";
import { getUserFolderKey } from "../utils/userEmailUtils";
import { getChannelFolderKey } from "../utils/channelUtils";

export interface VideoMeta {
  videoId: string;
  userId: string;
  channelId: string;
  sourceUrl?: string;
  title?: string;
  prompt?: string;
  provider?: string;
  createdAt: string;
  fileSize: number;
  contentType?: string;
  uploadedAt?: string;
  platform?: string;
  remoteUrl?: string;
}

export class StorageService {
  private readonly root: string;
  private readonly videosRoot: string;

  constructor() {
    // Корень хранилища внутри контейнера
    // По умолчанию /app/storage, но можно переопределить через STORAGE_ROOT
    const storageRoot = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage');
    
    // Если STORAGE_ROOT уже содержит 'videos', используем его напрямую как videosRoot
    // Иначе root = storageRoot, videosRoot = root/videos
    const normalizedRoot = storageRoot.replace(/\/+$/, ''); // Убираем завершающие слеши
    if (normalizedRoot.endsWith('videos')) {
      // STORAGE_ROOT уже указывает на папку videos (например /data/shortsai/videos)
      this.root = path.dirname(normalizedRoot); // /data/shortsai
      this.videosRoot = normalizedRoot; // /data/shortsai/videos
    } else {
      // STORAGE_ROOT указывает на корень хранилища (например /app/storage)
      this.root = normalizedRoot;
      this.videosRoot = path.join(this.root, 'videos');
    }

    // Логируем при создании
    Logger.info('[STORAGE] StorageService initialized', {
      root: this.root,
      videosRoot: this.videosRoot,
      resolvedRoot: path.resolve(this.root),
      resolvedVideosRoot: path.resolve(this.videosRoot)
    });

    console.log('[STORAGE] root=', this.root);
    console.log('[STORAGE] videosRoot=', this.videosRoot);
    console.log('[STORAGE] resolvedRoot=', path.resolve(this.root));
    console.log('[STORAGE] resolvedVideosRoot=', path.resolve(this.videosRoot));
  }

  /**
   * Получить корневой путь хранилища
   */
  getRoot(): string {
    return this.root;
  }

  /**
   * Получить путь к папке videos
   */
  getVideosRoot(): string {
    return this.videosRoot;
  }

  /**
   * Получить userFolderKey для пользователя (асинхронно)
   * Формат: {emailSlug}__{userId}
   * 
   * @param userId - ID пользователя
   * @param userEmail - Email пользователя (опционально, для оптимизации)
   * @returns userFolderKey
   */
  async resolveUserFolderKey(userId: string, userEmail?: string): Promise<string> {
    return getUserFolderKey(userId, userEmail);
  }

  /**
   * Получить путь к папке пользователя
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   */
  resolveUserDir(userFolderKey: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey);
  }

  /**
   * Получить channelFolderKey для канала (асинхронно)
   * Формат: {channelSlug}__{channelId}
   * 
   * @param userId - ID пользователя
   * @param channelId - ID канала
   * @returns channelFolderKey
   */
  async resolveChannelFolderKey(userId: string, channelId: string): Promise<string> {
    return getChannelFolderKey(userId, channelId);
  }

  /**
   * Получить путь к папке канала (синхронно, используя channelFolderKey)
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   */
  resolveChannelDir(userFolderKey: string, channelFolderKey: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey);
  }

  /**
   * Получить путь к папке канала (асинхронно, автоматически получает channelFolderKey)
   * @param userId - ID пользователя
   * @param channelId - ID канала
   * @returns Путь к папке канала
   */
  async resolveChannelDirAsync(userId: string, channelId: string): Promise<string> {
    const userFolderKey = await this.resolveUserFolderKey(userId);
    const channelFolderKey = await this.resolveChannelFolderKey(userId, channelId);
    return this.resolveChannelDir(userFolderKey, channelFolderKey);
  }

  /**
   * Получить путь к inbox (новые скачанные видео)
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param fileName - Имя файла (с расширением или без, будет добавлено .mp4)
   */
  resolveInboxPath(userFolderKey: string, channelFolderKey: string, fileName: string): string {
    // Если fileName уже содержит расширение, используем его, иначе добавляем .mp4
    const finalFileName = fileName.endsWith('.mp4') ? fileName : `${fileName}.mp4`;
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'inbox', finalFileName);
  }

  /**
   * Получить путь к inbox директории
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   */
  resolveInboxDir(userFolderKey: string, channelFolderKey: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'inbox');
  }

  /**
   * Получить путь к JSON метаданным в inbox
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param fileName - Имя файла (без расширения или с расширением, будет заменено на .json)
   */
  resolveInboxMetaPath(userFolderKey: string, channelFolderKey: string, fileName: string): string {
    // Убираем расширение, если есть, и добавляем .json
    const baseName = fileName.replace(/\.(mp4|json)$/i, '');
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'inbox', `${baseName}.json`);
  }

  /**
   * Получить путь к uploaded (опубликованные видео)
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param platform - Платформа (youtube, tiktok, etc.)
   * @param videoId - ID видео
   */
  resolveUploadedPath(userFolderKey: string, channelFolderKey: string, platform: string, videoId: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'uploaded', platform, `${videoId}.mp4`);
  }

  /**
   * Получить путь к uploaded директории для платформы
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param platform - Платформа (youtube, tiktok, etc.)
   */
  resolvePlatformUploadedDir(userFolderKey: string, channelFolderKey: string, platform: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'uploaded', platform);
  }

  /**
   * Получить путь к uploaded директории
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   */
  resolveUploadedDir(userFolderKey: string, channelFolderKey: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'uploaded');
  }

  /**
   * Получить путь к JSON метаданным в uploaded
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param platform - Платформа (youtube, tiktok, etc.)
   * @param videoId - ID видео
   */
  resolveUploadedMetaPath(userFolderKey: string, channelFolderKey: string, platform: string, videoId: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'uploaded', platform, `${videoId}.json`);
  }

  /**
   * Получить путь к failed (ошибки)
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param videoId - ID видео
   */
  resolveFailedPath(userFolderKey: string, channelFolderKey: string, videoId: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'failed', `${videoId}.log`);
  }

  /**
   * Получить путь к failed директории
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   */
  resolveFailedDir(userFolderKey: string, channelFolderKey: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'failed');
  }

  /**
   * Получить путь к tmp (временные файлы)
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param filename - Имя файла
   */
  resolveTmpPath(userFolderKey: string, channelFolderKey: string, filename: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'tmp', filename);
  }

  /**
   * Получить путь к tmp директории
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   */
  resolveTmpDir(userFolderKey: string, channelFolderKey: string): string {
    return path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelFolderKey, 'tmp');
  }

  /**
   * Гарантировать существование директорий
   */
  async ensureDirs(...dirs: string[]): Promise<void> {
    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
        Logger.info('[STORAGE] ensureDirs ok', { path: dir, resolvedPath: path.resolve(dir) });
      } catch (error) {
        Logger.error('[STORAGE] ensureDirs failed', {
          path: dir,
          resolvedPath: path.resolve(dir),
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }
  }

  /**
   * Сохранить поток в файл атомарно (через .part)
   */
  async saveStreamToFile(stream: Readable, destPath: string): Promise<{ bytes: number; finalPath: string; resolvedPath: string }> {
    const partPath = `${destPath}.part`;
    const resolvedDestPath = path.resolve(destPath);
    const resolvedPartPath = path.resolve(partPath);

    Logger.info('[STORAGE] save start', {
      dest: destPath,
      resolvedDest: resolvedDestPath,
      part: partPath,
      resolvedPart: resolvedPartPath
    });

    try {
      // Создаём директорию если нужно
      await this.ensureDirs(path.dirname(destPath));

      // Записываем во временный файл
      const writeStream = (await import('fs')).createWriteStream(partPath);
      let bytesWritten = 0;

      stream.on('data', (chunk: Buffer) => {
        bytesWritten += chunk.length;
      });

      await pipeline(stream, writeStream);

      // Проверяем минимальный размер (100KB)
      if (bytesWritten < 100 * 1024) {
        await fs.unlink(partPath);
        throw new Error(`File too small: ${bytesWritten} bytes (minimum 100KB)`);
      }

      // Атомарно переименовываем
      await fs.rename(partPath, destPath);

      Logger.info('[STORAGE] save done', {
        bytes: bytesWritten,
        dest: destPath,
        resolvedDest: resolvedDestPath
      });

      return { bytes: bytesWritten, finalPath: destPath, resolvedPath: resolvedDestPath };
    } catch (error) {
      // Удаляем .part файл при ошибке
      try {
        await fs.unlink(partPath);
      } catch (unlinkError) {
        // Игнорируем ошибку удаления
      }

      Logger.error('[STORAGE] save failed', {
        dest: destPath,
        resolvedDest: resolvedDestPath,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Сохранить Buffer в файл атомарно
   */
  async saveBufferToFile(buffer: Buffer, destPath: string): Promise<{ bytes: number; finalPath: string; resolvedPath: string }> {
    const stream = Readable.from(buffer);
    return this.saveStreamToFile(stream, destPath);
  }

  /**
   * Записать JSON метаданные
   */
  async writeJson(destPathJson: string, meta: VideoMeta): Promise<void> {
    const resolvedPath = path.resolve(destPathJson);
    Logger.info('[STORAGE] writeJson start', {
      dest: destPathJson,
      resolvedDest: resolvedPath,
      videoId: meta.videoId
    });

    try {
      await this.ensureDirs(path.dirname(destPathJson));
      await fs.writeFile(destPathJson, JSON.stringify(meta, null, 2), 'utf-8');

      Logger.info('[STORAGE] writeJson done', {
        dest: destPathJson,
        resolvedDest: resolvedPath,
        videoId: meta.videoId
      });
    } catch (error) {
      Logger.error('[STORAGE] writeJson failed', {
        dest: destPathJson,
        resolvedDest: resolvedPath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Гарантировать существование директорий для пользователя и канала
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   */
  async ensureUserChannelDirs(userFolderKey: string, channelFolderKey: string): Promise<void> {
    const userDir = this.resolveUserDir(userFolderKey);
    const channelDir = this.resolveChannelDir(userFolderKey, channelFolderKey);
    const inboxDir = this.resolveInboxDir(userFolderKey, channelFolderKey);

    await this.ensureDirs(userDir, channelDir, inboxDir);
  }

  /**
   * Гарантировать существование директорий для пользователя и канала (асинхронно, автоматически получает ключи)
   * @param userId - ID пользователя
   * @param channelId - ID канала
   */
  async ensureUserChannelDirsAsync(userId: string, channelId: string): Promise<void> {
    const userFolderKey = await this.resolveUserFolderKey(userId);
    const channelFolderKey = await this.resolveChannelFolderKey(userId, channelId);
    await this.ensureUserChannelDirs(userFolderKey, channelFolderKey);
  }

  /**
   * Переместить файл из inbox в uploaded
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param platform - Платформа (youtube, tiktok, etc.)
   * @param videoId - ID видео
   */
  async moveToUploaded(
    userFolderKey: string,
    channelFolderKey: string,
    platform: string,
    videoId: string
  ): Promise<{ videoPath: string; metaPath: string }> {
    const inboxPath = this.resolveInboxPath(userFolderKey, channelFolderKey, videoId);
    const inboxMetaPath = this.resolveInboxMetaPath(userFolderKey, channelFolderKey, videoId);
    const uploadedPath = this.resolveUploadedPath(userFolderKey, channelFolderKey, platform, videoId);
    const uploadedMetaPath = this.resolveUploadedMetaPath(userFolderKey, channelFolderKey, platform, videoId);

    Logger.info('[STORAGE] move start', {
      from: inboxPath,
      to: uploadedPath,
      resolvedFrom: path.resolve(inboxPath),
      resolvedTo: path.resolve(uploadedPath)
    });

    try {
      // Создаём директорию для uploaded
      await this.ensureDirs(path.dirname(uploadedPath));

      // Перемещаем видео
      await fs.rename(inboxPath, uploadedPath);

      // Перемещаем метаданные если есть
      try {
        await fs.rename(inboxMetaPath, uploadedMetaPath);
      } catch (metaError) {
        // Метаданные могут отсутствовать - это не критично
        Logger.warn('[STORAGE] move meta not found', {
          metaPath: inboxMetaPath,
          error: metaError instanceof Error ? metaError.message : String(metaError)
        });
      }

      Logger.info('[STORAGE] move ok', {
        from: inboxPath,
        to: uploadedPath,
        resolvedFrom: path.resolve(inboxPath),
        resolvedTo: path.resolve(uploadedPath)
      });

      return { videoPath: uploadedPath, metaPath: uploadedMetaPath };
    } catch (error) {
      Logger.error('[STORAGE] move failed', {
        from: inboxPath,
        to: uploadedPath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Удалить пользователя (рекурсивно)
   * Автоматически получает userFolderKey и удаляет папку
   * Также проверяет старый формат (fallback)
   * 
   * @param userId - ID пользователя
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      // Получаем userFolderKey
      const userFolderKey = await this.resolveUserFolderKey(userId);
      const userDir = this.resolveUserDir(userFolderKey);
      const resolvedPath = path.resolve(userDir);

      Logger.info('[STORAGE] deleteUser start', {
        userId,
        userFolderKey,
        path: userDir,
        resolvedPath
      });

      try {
        await fs.rm(userDir, { recursive: true, force: true });
        Logger.info('[STORAGE] deleteUser ok', {
          userId,
          userFolderKey,
          path: userDir,
          resolvedPath
        });
      } catch (error) {
        Logger.warn('[STORAGE] deleteUser: failed to delete new format, trying old format', {
          userId,
          userFolderKey,
          error: error instanceof Error ? error.message : String(error)
        });

        // Fallback: пробуем удалить старый формат
        const oldUserDir = path.join(this.videosRoot, 'users', userId);
        try {
          await fs.rm(oldUserDir, { recursive: true, force: true });
          Logger.info('[STORAGE] deleteUser: deleted old format', {
            userId,
            oldPath: oldUserDir
          });
        } catch (oldError) {
          // Если и старый формат не найден - это нормально
          if ((oldError as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw oldError;
          }
        }
      }
    } catch (error) {
      Logger.error('[STORAGE] deleteUser failed', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Удалить канал (рекурсивно)
   * Автоматически получает userFolderKey и channelFolderKey
   * Имеет fallback на старый формат
   * 
   * @param userId - ID пользователя
   * @param channelId - ID канала
   */
  async deleteChannel(userId: string, channelId: string): Promise<void> {
    try {
      // Получаем ключи
      const userFolderKey = await this.resolveUserFolderKey(userId);
      const channelFolderKey = await this.resolveChannelFolderKey(userId, channelId);
      const channelDir = this.resolveChannelDir(userFolderKey, channelFolderKey);
      const resolvedPath = path.resolve(channelDir);

      Logger.info('[STORAGE] deleteChannel start', {
        userId,
        userFolderKey,
        channelId,
        channelFolderKey,
        path: channelDir,
        resolvedPath
      });

      try {
        await fs.rm(channelDir, { recursive: true, force: true });
        Logger.info('[STORAGE] deleteChannel ok', {
          userId,
          userFolderKey,
          channelId,
          channelFolderKey,
          path: channelDir,
          resolvedPath
        });
      } catch (error) {
        // Fallback 1: пробуем старый формат с новым userFolderKey
        const oldChannelDir1 = path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelId);
        try {
          await fs.rm(oldChannelDir1, { recursive: true, force: true });
          Logger.info('[STORAGE] deleteChannel: deleted old format (new userFolderKey)', {
            userId,
            channelId,
            oldPath: oldChannelDir1
          });
          return;
        } catch (oldError1) {
          if ((oldError1 as NodeJS.ErrnoException).code !== 'ENOENT') {
            Logger.warn('[STORAGE] deleteChannel: old format 1 also failed', {
              userId,
              channelId,
              error: oldError1 instanceof Error ? oldError1.message : String(oldError1)
            });
          }
        }

        // Fallback 2: пробуем полностью старый формат (старый userFolderKey = userId)
        const oldChannelDir2 = path.join(this.videosRoot, 'users', userId, 'channels', channelId);
        try {
          await fs.rm(oldChannelDir2, { recursive: true, force: true });
          Logger.info('[STORAGE] deleteChannel: deleted old format (old userFolderKey)', {
            userId,
            channelId,
            oldPath: oldChannelDir2
          });
          return;
        } catch (oldError2) {
          if ((oldError2 as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw oldError2;
          }
          // Если и старый формат не найден - бросаем исходную ошибку
          throw error;
        }
      }
    } catch (error) {
      Logger.error('[STORAGE] deleteChannel failed', {
        userId,
        channelId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Список файлов в inbox канала
   * @param userFolderKey - Ключ папки пользователя (emailSlug__userId)
   * @param channelFolderKey - Ключ папки канала (channelSlug__channelId)
   * @param subdir - Поддиректория (inbox, uploaded, failed)
   */
  async listFiles(userFolderKey: string, channelFolderKey: string, subdir: 'inbox' | 'uploaded' | 'failed' = 'inbox'): Promise<string[]> {
    const dir = path.join(this.resolveChannelDir(userFolderKey, channelFolderKey), subdir);
    
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => f.endsWith('.mp4') || f.endsWith('.json'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Найти путь к каналу с fallback на старый формат
   * Используется для операций, где нужно найти существующую папку
   * 
   * @param userId - ID пользователя
   * @param channelId - ID канала
   * @returns Путь к папке канала (новый или старый формат)
   */
  async findChannelDirWithFallback(userId: string, channelId: string): Promise<{ path: string; isOldFormat: boolean }> {
    try {
      // Пробуем новый формат
      const userFolderKey = await this.resolveUserFolderKey(userId);
      const channelFolderKey = await this.resolveChannelFolderKey(userId, channelId);
      const newPath = this.resolveChannelDir(userFolderKey, channelFolderKey);

      try {
        await fs.access(newPath);
        return { path: newPath, isOldFormat: false };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Fallback 1: новый userFolderKey, старый channelId
      const fallbackPath1 = path.join(this.videosRoot, 'users', userFolderKey, 'channels', channelId);
      try {
        await fs.access(fallbackPath1);
        return { path: fallbackPath1, isOldFormat: true };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Fallback 2: старый формат полностью
      const fallbackPath2 = path.join(this.videosRoot, 'users', userId, 'channels', channelId);
      try {
        await fs.access(fallbackPath2);
        return { path: fallbackPath2, isOldFormat: true };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Если ничего не найдено, возвращаем новый путь (будет создан)
      return { path: newPath, isOldFormat: false };
    } catch (error) {
      Logger.error('[STORAGE] findChannelDirWithFallback failed', {
        userId,
        channelId,
        error: error instanceof Error ? error.message : String(error)
      });
      // В случае ошибки возвращаем путь в старом формате как fallback
      return { path: path.join(this.videosRoot, 'users', userId, 'channels', channelId), isOldFormat: true };
    }
  }
}

// Singleton instance
let storageServiceInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageServiceInstance) {
    storageServiceInstance = new StorageService();
  }
  return storageServiceInstance;
}

