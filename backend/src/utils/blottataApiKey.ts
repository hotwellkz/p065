import { Logger } from "./logger";
import { getDefaultBlottataApiKey } from "../routes/userSettingsRoutes";
import type { Channel } from "../types/channel";

/**
 * Маскирует API ключ для логирования (показывает первые 4 и последние 4 символа)
 */
function maskApiKey(key: string): string {
  if (!key || key.length < 8) {
    return "****";
  }
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

/**
 * Получает Blotato API key с приоритетом:
 * 1. channel.blotataApiKey (channel override)
 * 2. account default (user-settings/defaultBlottataApiKeyEncrypted)
 * 3. process.env.BLOTATA_API_KEY (env fallback)
 * 
 * @param channel - Канал (может содержать blotataApiKey)
 * @param userId - ID пользователя (для получения account default)
 * @returns API key или null, если не найден
 */
export async function getBlottataApiKey(
  channel: Channel,
  userId?: string
): Promise<{ apiKey: string; source: "channel" | "account" | "env" } | null> {
  const channelId = channel.id;
  
  // 1. Проверяем channel override
  if (channel.blotataApiKey && channel.blotataApiKey.trim().length > 0) {
    Logger.info("[BLOTTATA_API_KEY] Using channel override", {
      channelId,
      userId,
      source: "channel",
      keyMask: maskApiKey(channel.blotataApiKey)
    });
    return {
      apiKey: channel.blotataApiKey.trim(),
      source: "channel"
    };
  }
  
  // 2. Проверяем account default (если userId предоставлен)
  if (userId) {
    try {
      const accountKey = await getDefaultBlottataApiKey(userId);
      if (accountKey && accountKey.trim().length > 0) {
        Logger.info("[BLOTTATA_API_KEY] Using account default", {
          channelId,
          userId,
          source: "account",
          keyMask: maskApiKey(accountKey)
        });
        return {
          apiKey: accountKey.trim(),
          source: "account"
        };
      } else {
        Logger.info("[BLOTTATA_API_KEY] Account default not found", {
          channelId,
          userId,
          source: "account"
        });
      }
    } catch (error: any) {
      Logger.error("[BLOTTATA_API_KEY] Failed to get account default", {
        channelId,
        userId,
        error: error?.message || String(error)
      });
    }
  } else {
    Logger.info("[BLOTTATA_API_KEY] userId not provided, skipping account default", {
      channelId
    });
  }
  
  // 3. Проверяем env fallback
  const envKey = process.env.BLOTATA_API_KEY;
  if (envKey && envKey.trim().length > 0) {
    Logger.info("[BLOTTATA_API_KEY] Using env fallback", {
      channelId,
      userId,
      source: "env",
      keyMask: maskApiKey(envKey)
    });
    return {
      apiKey: envKey.trim(),
      source: "env"
    };
  }
  
  // Ключ не найден
  Logger.error("[BLOTTATA_API_KEY] API key not found", {
    channelId,
    userId,
    hasChannelKey: !!channel.blotataApiKey,
    hasAccountKey: userId ? "not_checked" : "userId_missing",
    hasEnvKey: !!envKey,
    error: "BLOTTATA_API_KEY_MISSING"
  });
  
  return null;
}

/**
 * Проверяет наличие Blotato API key и выбрасывает ошибку, если не найден
 * Используется для fail-fast проверки перед запросами к Blotato
 */
export async function requireBlottataApiKey(
  channel: Channel,
  userId?: string
): Promise<{ apiKey: string; source: "channel" | "account" | "env" }> {
  const result = await getBlottataApiKey(channel, userId);
  
  if (!result) {
    const error = new Error("BLOTTATA_API_KEY_MISSING: Blottata API key is required but not found. Please set it in channel settings, account settings, or environment variable.");
    Logger.error("[BLOTTATA_API_KEY] API key required but not found", {
      channelId: channel.id,
      userId,
      error: error.message
    });
    throw error;
  }
  
  return result;
}

