/**
 * Утилиты для вычисления путей к хранилищу канала
 * Соответствуют логике backend/src/services/storage/userChannelStorage.ts
 */

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
 * Вычисляет пути к хранилищу для канала
 * @param userEmail - Email пользователя
 * @param channelId - ID канала
 * @param channelName - Название канала
 * @returns Объект с путями
 */
export function computeChannelStoragePaths(
  userEmail: string,
  channelId: string,
  channelName: string
): {
  userSlug: string;
  channelSlug: string;
  inputDir: string;
  archiveDir: string;
  displayPath: string;
} {
  const userSlug = makeSafeSlugFromEmail(userEmail);
  const channelSlug = makeSafeChannelSlug(channelName, channelId);

  // Пути относительно STORAGE_ROOT (который обычно /app/storage/videos)
  const inputDir = `storage/videos/${userSlug}/${channelSlug}`;
  const archiveDir = `${inputDir}/uploaded`;

  // Отображаемый путь для UI
  const displayPath = `${userSlug}/${channelSlug}`;

  return {
    userSlug,
    channelSlug,
    inputDir,
    archiveDir,
    displayPath
  };
}





