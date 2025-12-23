import { createTelegramClientFromStringSession } from "../telegram/client";
import { loadSessionString } from "../telegram/sessionStore";
import { sendMessageAsUser } from "./TelegramUserService";
import type { Channel } from "../types/channel";
import { Logger } from "../utils/logger";

const SYNX_CHAT_ID = process.env.SYNX_CHAT_ID;

export class TelegramSessionExpiredError extends Error {}

export interface TelegramMessageInfo {
  messageId: number;
  chatId: string;
}

/**
 * Отправляет промпт в Syntax через глобальную Telegram сессию
 */
export async function sendPromptFromUserToSyntx(
  // userId сохранён для совместимости сигнатуры, сейчас не используется
  _userId: string,
  prompt: string
): Promise<TelegramMessageInfo> {
  if (!SYNX_CHAT_ID) {
    throw new Error("SYNX_CHAT_ID is not configured");
  }

  const stringSession = loadSessionString();
  if (!stringSession) {
    throw new Error("TELEGRAM_SESSION_NOT_INITIALIZED");
  }

  let client;
  try {
    client = await createTelegramClientFromStringSession(stringSession);
    const sentMessage = await client.sendMessage(SYNX_CHAT_ID, { message: prompt });
    
    // Извлекаем messageId из отправленного сообщения
    const messageId = (sentMessage as any).id;
    
    if (!messageId || typeof messageId !== "number") {
      throw new Error("Failed to get messageId from sent message");
    }
    
    return {
      messageId,
      chatId: SYNX_CHAT_ID
    };
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (
      message.includes("AUTH_KEY_UNREGISTERED") ||
      message.includes("SESSION_REVOKED") ||
      message.includes("USER_DEACTIVATED") ||
      message.includes("PASSWORD_HASH_INVALID")
    ) {
      throw new TelegramSessionExpiredError(
        "TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN"
      );
    }
    throw err;
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Отправляет промпт в Syntax с учетом настроек канала
 * Поддерживает telegram_global и telegram_user
 */
export async function sendPromptToSyntax(
  channel: Channel,
  userId: string,
  prompt: string
): Promise<TelegramMessageInfo> {
  const transport = channel.generationTransport || "telegram_global";
  const peer = channel.telegramSyntaxPeer || SYNX_CHAT_ID || "";

  if (!peer) {
    throw new Error("telegramSyntaxPeer or SYNX_CHAT_ID must be configured");
  }

  if (transport === "telegram_user") {
    // Отправляем через личный Telegram аккаунт пользователя
    try {
      return await sendMessageAsUser(userId, peer, prompt);
    } catch (err: any) {
      const message = String(err?.message ?? err);
      
      if (message.includes("TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN")) {
        throw new TelegramSessionExpiredError(message);
      }
      
      if (message.includes("Telegram integration not found") || 
          message.includes("not active")) {
        throw new Error("TELEGRAM_USER_NOT_CONNECTED");
      }
      
      throw err;
    }
  } else {
    // Отправляем через глобальную сессию (telegram_global)
    return await sendPromptFromUserToSyntx("", prompt);
  }
}


