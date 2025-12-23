import * as path from "path";
import * as fs from "fs/promises";
import { Logger } from "../../utils/logger";

/**
 * Пути к хранилищу для канала пользователя
 */
export interface UserChannelStoragePaths {
  userId: string;
  userEmail: string;
  userSlug: string;
  userDir: string;

  channelId: string;
  channelName: string;
  channelSlug: string;

  rootDir: string;   // STORAGE_ROOT
  inputDir: string;  // STORAGE_ROOT/userSlug/channelSlug
  archiveDir: string;// STORAGE_ROOT/userSlug/channelSlug/Загруженные - <channelName>
}

/**
 * Создаёт безопасный slug из email
 */
function makeSafeSlugFromEmail(email: string): string {
  return email
    .toLowerCase()
    .trim()
    // Заменяем @ на -at-
    .replace(/@/g, "-at-")
    // Заменяем всё кроме [a-z0-9-] на '-'
    .replace(/[^a-z0-9-]/g, "-")
    // Убираем дубликаты '-'
    .replace(/-+/g, "-")
    // Убираем ведущие и завершающие '-'
    .replace(/^-+|-+$/g, "");
}

/**
 * Создаёт безопасный slug из имени канала
 */
function makeSafeChannelSlug(name: string, channelId: string): string {
  let slug = name
    .toLowerCase()
    .trim()
    // Заменяем специальные символы на дефисы
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Если slug пустой или слишком короткий, используем channelId
  if (!slug || slug.length < 2) {
    slug = `channel-${channelId.slice(0, 8)}`;
  } else {
    // Добавляем часть channelId для уникальности
    slug = `${slug}-${channelId.slice(0, 8)}`;
  }

  return slug;
}

/**
 * Получает пути к хранилищу для канала пользователя
 * 
 * Структура:
 * - userDir: ${STORAGE_ROOT}/${userSlug}/ - папка пользователя
 * - inputDir: ${STORAGE_ROOT}/${userSlug}/${channelSlug}/ - входящие файлы для автопубликации
 * - archiveDir: ${STORAGE_ROOT}/${userSlug}/${channelSlug}/Загруженные - ${channelName}/ - архив опубликованных файлов
 * 
 * @param params - Параметры для получения путей
 * @returns Пути к хранилищу канала пользователя
 */
export function getUserChannelStoragePaths(params: {
  userId: string;
  userEmail: string;
  channelId: string;
  channelName: string;
}): UserChannelStoragePaths {
  const STORAGE_ROOT = process.env.STORAGE_ROOT || path.resolve(process.cwd(), 'storage/videos');

  const userSlug = makeSafeSlugFromEmail(params.userEmail);
  const channelSlug = makeSafeChannelSlug(params.channelName, params.channelId);

  const userDir = path.join(STORAGE_ROOT, userSlug);
  const channelBaseDir = path.join(userDir, channelSlug);

  const inputDir = channelBaseDir; // сюда кладём новые видео
  const archiveDir = path.join(channelBaseDir, `Загруженные - ${params.channelName}`);

  return {
    userId: params.userId,
    userEmail: params.userEmail,
    userSlug,
    userDir,
    channelId: params.channelId,
    channelName: params.channelName,
    channelSlug,
    rootDir: STORAGE_ROOT,
    inputDir,
    archiveDir,
  };
}

/**
 * Гарантирует, что директории для канала пользователя существуют
 * Создаёт их, если их нет
 */
export async function ensureChannelDirectories(paths: UserChannelStoragePaths): Promise<void> {
  try {
    // Создаём все директории рекурсивно
    await fs.mkdir(paths.userDir, { recursive: true });
    await fs.mkdir(paths.inputDir, { recursive: true });
    await fs.mkdir(paths.archiveDir, { recursive: true });

    console.log('[Storage] Using paths', {
      userEmail: paths.userEmail,
      userDir: paths.userDir,
      channelName: paths.channelName,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir,
    });

    Logger.info("UserChannelStorage: directories ensured", {
      userId: paths.userId,
      userEmail: paths.userEmail,
      userSlug: paths.userSlug,
      channelId: paths.channelId,
      channelName: paths.channelName,
      channelSlug: paths.channelSlug,
      userDir: paths.userDir,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir
    });
  } catch (error) {
    Logger.error("UserChannelStorage: failed to create directories", {
      userId: paths.userId,
      userEmail: paths.userEmail,
      channelId: paths.channelId,
      channelName: paths.channelName,
      userDir: paths.userDir,
      inputDir: paths.inputDir,
      archiveDir: paths.archiveDir,
      error: error instanceof Error ? error.message : String(error)
    });
    throw new Error(`Не удалось создать папки для канала: ${error instanceof Error ? error.message : String(error)}`);
  }
}



