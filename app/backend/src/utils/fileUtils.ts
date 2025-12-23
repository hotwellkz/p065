/**
 * Утилиты для работы с именами файлов
 */

/**
 * Очищает название файла от недопустимых символов
 * @param title - Название ролика/файла
 * @returns Очищенное имя файла
 */
export function sanitizeFileName(title: string): string {
  if (!title || typeof title !== "string") {
    return "video";
  }

  return title
    .trim()
    // Удаляем недопустимые символы для файловых систем
    .replace(/[\\/:*?"<>|]/g, "_")
    // Заменяем пробелы и множественные подчёркивания на одно
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    // Удаляем подчёркивания в начале и конце
    .replace(/^_+|_+$/g, "")
    // Ограничиваем длину (120 символов для безопасности)
    .slice(0, 120)
    // Если после очистки строка пустая, используем дефолтное имя
    || "video";
}

/**
 * Формирует полное имя файла с расширением
 * @param title - Название ролика/файла
 * @param extension - Расширение файла (по умолчанию .mp4)
 * @returns Имя файла с расширением
 */
export function formatFileName(title: string, extension: string = ".mp4"): string {
  const sanitized = sanitizeFileName(title);
  
  // Убираем расширение, если оно уже есть
  const withoutExt = sanitized.replace(/\.(mp4|avi|mov|mkv|webm)$/i, "");
  
  // Добавляем расширение
  return `${withoutExt}${extension}`;
}

/**
 * Генерирует осмысленное имя файла для видео на основе сгенерированного названия ролика
 * @param params - Параметры для генерации имени
 * @returns Нормализованное имя файла с расширением .mp4
 */
export function generateVideoFileName(params: {
  title?: string;      // сгенерированное название ролика
  prompt?: string;     // текст промпта (на случай, если title нет)
  channelName?: string;
  createdAt?: Date;
}): string {
  const { title, prompt, channelName, createdAt } = params;
  
  let name: string;
  
  // Приоритет: title > первые 60-80 символов промпта > название канала > fallback
  if (title && title.trim().length > 0) {
    name = title.trim();
  } else if (prompt && prompt.trim().length > 0) {
    // Берём первые 60-80 символов промпта
    name = prompt.trim().slice(0, 80);
  } else if (channelName && channelName.trim().length > 0) {
    name = channelName.trim();
  } else {
    // Fallback: используем дату и время
    const date = createdAt || new Date();
    const dateStr = date.toISOString().slice(0, 19).replace(/[:-]/g, "").replace("T", "_");
    return `video_${dateStr}.mp4`;
  }
  
  // Нормализация строки
  name = name.trim();
  
  // Удаление/замена запрещённых символов
  name = name
    .replace(/[\/\\\?\%\*\:"<>\|]/g, "")  // убрать опасные символы
    .replace(/!/g, "")                     // убрать восклицательные
    .replace(/:/g, "")                      // убрать двоеточия
    .replace(/\s+/g, " ");                  // схлопнуть повторные пробелы
  
  // Убираем пробелы в начале и конце
  name = name.trim();
  
  // Обрезка длины (80-100 символов)
  const MAX_LEN = 100;
  if (name.length > MAX_LEN) {
    name = name.slice(0, MAX_LEN).trim();
  }
  
  // Если после всех преобразований строка пустая, используем fallback
  if (name.length === 0) {
    const date = createdAt || new Date();
    const dateStr = date.toISOString().slice(0, 19).replace(/[:-]/g, "").replace("T", "_");
    return `video_${dateStr}.mp4`;
  }
  
  // Убираем расширение, если оно уже есть
  const withoutExt = name.replace(/\.(mp4|avi|mov|mkv|webm)$/i, "");
  
  // Добавляем расширение .mp4
  return `${withoutExt}.mp4`;
}





