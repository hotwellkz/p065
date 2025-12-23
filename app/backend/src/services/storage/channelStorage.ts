import * as path from "path";
import * as fs from "fs/promises";
import { Logger } from "../../utils/logger";

/**
 * Пути к хранилищу для канала
 */
export interface ChannelStoragePaths {
  channelSlug: string;
  inputDir: string;       // куда попадает новое видео
  archiveDir: string;     // куда кладём после успешной публикации
}

/**
 * Получает пути к хранилищу для канала
 * 
 * Структура:
 * - inputDir: ${STORAGE_ROOT}/${channelSlug}/ - входящие файлы для автопубликации
 * - archiveDir: ${STORAGE_ROOT}/${channelSlug}/Загруженные - ${channelName}/ - архив опубликованных файлов
 * 
 * @param channelId - ID канала
 * @param channelName - Название канала
 * @returns Пути к хранилищу канала
 */
export function getChannelStoragePaths(channelId: string, channelName: string): ChannelStoragePaths {
  // 1) Делаем slug из имени канала
  //    - только a-z0-9-_ , пробелы -> '-', lower-case
  let slug = channelName
    .toLowerCase()
    .trim()
    // Заменяем специальные символы на дефисы
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  // 2) Добавляем хвост -<channelId> для уникальности
  if (!slug || slug.length < 2) {
    slug = `channel-${channelId}`;
  } else {
    slug = `${slug}-${channelId}`;
  }

  // 3) Определяем STORAGE_ROOT
  const storageRoot = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage/videos');

  // 4) Формируем пути
  const inputDir = path.join(storageRoot, slug);
  const archiveDir = path.join(inputDir, `Загруженные - ${channelName}`);

  return {
    channelSlug: slug,
    inputDir,
    archiveDir
  };
}

/**
 * Гарантирует, что директории для канала существуют
 * Создаёт их, если их нет
 */
export async function ensureChannelDirectories(channelId: string, channelName: string): Promise<ChannelStoragePaths> {
  const paths = getChannelStoragePaths(channelId, channelName);

  try {
    // Создаём обе директории рекурсивно
    await fs.mkdir(paths.inputDir, { recursive: true });
    await fs.mkdir(paths.archiveDir, { recursive: true });

    Logger.info("ChannelStorage: directories ensured", {
      channelId,
      channelName,
      channelSlug: paths.channelSlug,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir
    });
  } catch (error) {
    Logger.error("ChannelStorage: failed to create directories", {
      channelId,
      channelName,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error(`Не удалось создать папки для канала: ${error instanceof Error ? error.message : String(error)}`);
  }

  return paths;
}



