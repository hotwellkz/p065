import * as fs from "fs/promises";
import * as path from "path";
import { Logger } from "../utils/logger";
import { ensureChannelDirectories, getChannelStoragePaths, type ChannelStoragePaths } from "./storage/channelStorage";

/**
 * Сервис для работы с локальным хранилищем видео на сервере
 * @deprecated Используйте напрямую функции из storage/channelStorage.ts
 */
export class LocalStorageService {
  /**
   * Получает пути к папкам канала (создаёт их, если не существуют)
   */
  async getChannelDirs(channelId: string, channelName: string): Promise<{
    inputDir: string;
    archiveDir: string;
    channelSlug: string;
  }> {
    const paths = await ensureChannelDirectories(channelId, channelName);
    return {
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir,
      channelSlug: paths.channelSlug
    };
  }

  /**
   * Сохраняет файл во входную папку канала
   */
  async saveToInput(
    channelId: string,
    channelName: string,
    filename: string,
    fileBuffer: Buffer
  ): Promise<{
    inputPath: string;
    filename: string;
    channelSlug: string;
  }> {
    const { inputDir, channelSlug } = await this.getChannelDirs(channelId, channelName);

    // Очищаем имя файла от недопустимых символов
    const safeFilename = this.sanitizeFilename(filename);
    const filePath = path.join(inputDir, safeFilename);

    try {
      await fs.writeFile(filePath, fileBuffer);
      Logger.info("LocalStorageService: file saved to input directory", {
        channelId,
        channelName,
        channelSlug,
        filename: safeFilename,
        filePath,
        fileSize: fileBuffer.length
      });

      return {
        inputPath: filePath,
        filename: safeFilename,
        channelSlug
      };
    } catch (error) {
      Logger.error("LocalStorageService: failed to save file", {
        channelId,
        channelName,
        filename: safeFilename,
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Не удалось сохранить файл: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Перемещает файл из входной папки в архивную
   */
  async moveToArchive(
    channelId: string,
    channelName: string,
    filename: string
  ): Promise<{
    archivePath: string;
    channelSlug: string;
  }> {
    const { inputDir, archiveDir, channelSlug } = await this.getChannelDirs(channelId, channelName);

    const sourcePath = path.join(inputDir, filename);
    const archivePath = path.join(archiveDir, filename);

    try {
      // Проверяем, существует ли файл
      await fs.access(sourcePath);

      // Перемещаем файл
      await fs.rename(sourcePath, archivePath);

      Logger.info("LocalStorageService: file moved to archive", {
        channelId,
        channelName,
        channelSlug,
        filename,
        sourcePath,
        archivePath
      });

      return {
        archivePath,
        channelSlug
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        Logger.warn("LocalStorageService: file not found for archiving", {
          channelId,
          channelName,
          filename,
          sourcePath
        });
        throw new Error(`Файл не найден: ${filename}`);
      }
      Logger.error("LocalStorageService: failed to move file to archive", {
        channelId,
        channelName,
        filename,
        sourcePath,
        archivePath,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Не удалось переместить файл в архив: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Очищает имя файла от недопустимых символов
   */
  private sanitizeFilename(filename: string): string {
    // Удаляем или заменяем недопустимые символы для файловой системы
    return filename
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_{2,}/g, "_")
      .trim();
  }

  /**
   * Получает список файлов во входной папке канала
   */
  async listInputFiles(channelId: string, channelName: string): Promise<string[]> {
    const { inputDir } = await this.getChannelDirs(channelId, channelName);

    try {
      const files = await fs.readdir(inputDir);
      // Фильтруем только файлы (не папки)
      const fileList: string[] = [];
      for (const file of files) {
        const filePath = path.join(inputDir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          fileList.push(file);
        }
      }
      return fileList;
    } catch (error) {
      Logger.error("LocalStorageService: failed to list input files", {
        channelId,
        channelName,
        inputDir,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }
}

// Экспортируем singleton instance
export const localStorageService = new LocalStorageService();

