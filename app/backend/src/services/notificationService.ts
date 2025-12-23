import { createTelegramClientFromStringSession } from "../telegram/client";
import { loadSessionString } from "../telegram/sessionStore";
import { getClientForUser } from "../integrations/telegram/TelegramUserClient";
import { Logger } from "../utils/logger";
import type { TelegramClient } from "telegram";

export interface VideoUploadNotificationParams {
  chatId: string;
  channelName: string;
  fileName: string;
  webViewLink?: string;
  webContentLink?: string;
  sizeBytes?: number;
  uploadedAt: Date;
  userId?: string;
  generationTransport?: "telegram_global" | "telegram_user";
}

/**
 * Отправляет уведомление в Telegram после успешной загрузки видео в Google Drive.
 * Выбирает правильный Telegram-клиент на основе generationTransport:
 * - telegram_user: использует личную сессию пользователя
 * - telegram_global: использует общую системную сессию
 * 
 * Ошибки логируются и не пробрасываются наверх, чтобы не ломать основную логику.
 */
export async function sendVideoUploadNotification(
  params: VideoUploadNotificationParams
): Promise<void> {
  const { 
    chatId, 
    channelName, 
    fileName, 
    webViewLink, 
    webContentLink, 
    sizeBytes, 
    uploadedAt,
    userId,
    generationTransport = "telegram_global"
  } = params;

  let client: TelegramClient | null = null;
  let shouldDisconnect = false;

  try {
    // Определяем, какой клиент использовать
    if (generationTransport === "telegram_user") {
      if (!userId) {
        Logger.error("sendVideoUploadNotification: userId is required for telegram_user mode", {
          chatId,
          channelName
        });
        return;
      }

      Logger.info("sendVideoUploadNotification: используем личную Telegram-сессию пользователя", {
        userId,
        chatId,
        channelName,
        fileName
      });

      try {
        client = await getClientForUser(userId);
        // getClientForUser возвращает кэшированный клиент, не нужно отключать
        shouldDisconnect = false;
      } catch (error: any) {
        Logger.error("sendVideoUploadNotification: не удалось получить личный Telegram-клиент", {
          userId,
          error: error?.message || String(error),
          chatId,
          channelName
        });
        return;
      }
    } else {
      // telegram_global - используем общую сессию
      Logger.info("sendVideoUploadNotification: используем общую Telegram-сессию", {
        chatId,
        channelName,
        fileName
      });

      const stringSession = loadSessionString();
      if (!stringSession) {
        Logger.error("sendVideoUploadNotification: TELEGRAM_SESSION_NOT_INITIALIZED", {
          chatId,
          channelName
        });
        return;
      }

      client = await createTelegramClientFromStringSession(stringSession);
      shouldDisconnect = true;
    }

    if (!client) {
      Logger.error("sendVideoUploadNotification: клиент не создан", {
        generationTransport,
        userId,
        chatId,
        channelName
      });
      return;
    }

    const sizeMb =
      typeof sizeBytes === "number" ? (sizeBytes / (1024 * 1024)).toFixed(1) : undefined;

    const link = webViewLink || webContentLink || "";
    const dateStr = uploadedAt.toLocaleString("ru-RU");

    let text = "✅ Видео загружено на Google Drive\n\n";
    text += `Канал: ${channelName}\n`;
    text += `Файл: ${fileName}\n`;
    if (sizeMb) text += `Размер: ~${sizeMb} МБ\n`;
    if (link) text += `Ссылка: ${link}\n`;
    text += `Время: ${dateStr}`;

    Logger.info("Sending video upload notification", {
      chatId,
      channelName,
      fileName,
      webViewLink,
      webContentLink,
      sizeBytes,
      generationTransport,
      userId: userId || "global",
      sessionType: generationTransport === "telegram_user" ? "personal" : "shared"
    });

    await client.sendMessage(chatId, { message: text });

    Logger.info("Video upload notification sent successfully", {
      chatId,
      channelName,
      fileName,
      generationTransport
    });
  } catch (error: any) {
    // Проверяем, является ли это ошибкой сессии
    const errorMessage = String(error?.message ?? error);
    const errorCode = (error as any)?.errorCode;
    const errorClassName = (error as any)?.className;

    if (
      errorMessage.includes("AUTH_KEY_UNREGISTERED") ||
      errorMessage.includes("SESSION_REVOKED") ||
      errorCode === "AUTH_KEY_UNREGISTERED" ||
      errorClassName === "AUTH_KEY_UNREGISTERED"
    ) {
      Logger.error("sendVideoUploadNotification: TELEGRAM_SESSION_INVALID", {
        chatId,
        channelName,
        generationTransport,
        userId: userId || "global",
        error: errorMessage,
        errorCode,
        errorClassName
      });
    } else {
      Logger.error("Failed to send video upload notification", {
        chatId,
        channelName,
        generationTransport,
        userId: userId || "global",
        error: errorMessage,
        errorCode,
        errorClassName
      });
    }
  } finally {
    // Отключаем клиент только если мы его создали (не кэшированный)
    if (client && shouldDisconnect) {
      try {
        await client.disconnect();
      } catch (disconnectError) {
        Logger.warn("Failed to disconnect Telegram client after notification", {
          error: String(disconnectError)
        });
      }
    }
  }
}
