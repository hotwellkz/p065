/**
 * Максимальная длина title для YouTube Shorts
 * YouTube официально поддерживает до 100 символов, но для Shorts
 * фактически стабильно работают 50-60 символов.
 * Лимит 55 символов выбран как безопасный для всех случаев.
 */
export const MAX_YOUTUBE_TITLE_LENGTH = 55;

/**
 * Нормализует заголовок YouTube-ролика:
 * - Удаляет лишние пробелы
 * - Обрезает до 55 символов если превышен лимит
 * - Добавляет многоточие в конце при обрезке
 * - Сохраняет корректный UTF-8
 * 
 * @param title - Исходный заголовок
 * @returns Нормализованный заголовок (максимум 55 символов)
 */
export function normalizeYoutubeTitle(title: string): string {
  if (!title || typeof title !== "string") {
    return "";
  }

  // Удаляем лишние пробелы и нормализуем
  let clean = title.trim().replace(/\s+/g, " ");

  // Если длина в пределах лимита, возвращаем как есть
  if (clean.length <= MAX_YOUTUBE_TITLE_LENGTH) {
    return clean;
  }

  // Обрезаем до лимита и добавляем многоточие
  // Используем slice для корректной работы с UTF-8
  const truncated = clean.slice(0, MAX_YOUTUBE_TITLE_LENGTH - 1).trim();
  
  // Убираем возможные висячие знаки препинания в конце
  const final = truncated.replace(/[.,;:!?\-—–]+$/, "").trim();
  
  // Если после удаления знаков препинания осталось место, добавляем многоточие
  if (final.length <= MAX_YOUTUBE_TITLE_LENGTH - 1) {
    return final + "…";
  }
  
  // Если не поместилось, просто обрезаем до лимита
  return final.slice(0, MAX_YOUTUBE_TITLE_LENGTH - 1) + "…";
}

