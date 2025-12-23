import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Logger } from "../../utils/logger";
import { decrypt } from "../../crypto/aes";
import { findTelegramIntegrationByUserId } from "../../repositories/telegramUserIntegrationRepo";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

if (!apiId || !apiHash) {
  throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set");
}

// Кэш активных клиентов для переиспользования
const clientCache = new Map<string, { client: TelegramClient; lastUsed: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

/**
 * Получает или создает Telegram клиент для пользователя
 * Кэширует клиенты для переиспользования
 */
export async function getClientForUser(
  userId: string
): Promise<TelegramClient> {
  // Проверяем кэш
  const cached = clientCache.get(userId);
  if (cached && Date.now() - cached.lastUsed < CACHE_TTL) {
    // Проверяем, что клиент еще подключен
    if (cached.client.connected) {
      cached.lastUsed = Date.now();
      return cached.client;
    } else {
      // Клиент отключен, удаляем из кэша
      clientCache.delete(userId);
    }
  }

  // Загружаем интеграцию из БД
  const integration = await findTelegramIntegrationByUserId(userId);
  
  if (!integration || integration.status !== "active") {
    throw new Error("Telegram integration not found or not active");
  }

  if (!integration.sessionEncrypted) {
    throw new Error("Telegram session not found");
  }

  // Расшифровываем сессию
  let sessionString: string;
  try {
    sessionString = decrypt(integration.sessionEncrypted);
  } catch (error) {
    Logger.error("Failed to decrypt telegram session", error);
    throw new Error("Failed to decrypt telegram session");
  }

  // Создаем клиент
  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false
  });

  // Подключаемся
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout after 30 seconds")), 30000)
      )
    ]);
  } catch (error) {
    Logger.error("Failed to connect Telegram client for user", error);
    throw error;
  }

  // Сохраняем в кэш
  clientCache.set(userId, {
    client,
    lastUsed: Date.now()
  });

  return client;
}

/**
 * Очищает кэш клиента для пользователя
 */
export function clearClientCache(userId: string): void {
  const cached = clientCache.get(userId);
  if (cached) {
    try {
      void cached.client.disconnect();
    } catch (e) {
      Logger.warn("Error disconnecting cached client", e);
    }
    clientCache.delete(userId);
  }
}

/**
 * Очищает все устаревшие клиенты из кэша
 */
export function cleanupExpiredClients(): void {
  const now = Date.now();
  for (const [userId, cached] of clientCache.entries()) {
    if (now - cached.lastUsed > CACHE_TTL) {
      try {
        void cached.client.disconnect();
      } catch (e) {
        Logger.warn("Error disconnecting expired client", e);
      }
      clientCache.delete(userId);
    }
  }
}

// Периодическая очистка кэша
setInterval(cleanupExpiredClients, 60000); // каждую минуту


