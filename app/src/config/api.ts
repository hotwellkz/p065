/**
 * Единый конфиг для API base URL
 * Все запросы должны использовать этот конфиг
 */
export const API_BASE_URL = 
  import.meta.env.VITE_API_BASE_URL || 
  import.meta.env.VITE_BACKEND_URL || 
  import.meta.env.VITE_API_URL || 
  "https://api.shortsai.ru";

/**
 * Проверка, что используется правильный домен
 */
if (typeof window !== "undefined") {
  const url = new URL(API_BASE_URL);
  if (url.hostname !== "api.shortsai.ru" && !url.hostname.includes("localhost")) {
    console.warn(
      `[API Config] Используется нестандартный домен: ${API_BASE_URL}. ` +
      `Ожидается: https://api.shortsai.ru`
    );
  }
}

