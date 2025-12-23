import { generatePromptForChannel } from "./promptGenerator";
import { runVideoGenerationForChannel } from "./videoGenerationService";
import { Logger } from "../utils/logger";

export interface PromptGenerationResult {
  messageId: number;
  chatId: string;
  title?: string;
  prompt: string;
}

/**
 * Генерирует промпт для канала и отправляет его в Syntx-бот
 * Использует общую функцию runVideoGenerationForChannel для единообразия
 * @param channelId - ID канала
 * @param userId - ID владельца канала
 * @returns Информация об отправленном сообщении (messageId, chatId) и сгенерированном title
 */
export async function generateAndSendPromptForChannel(
  channelId: string,
  userId: string
): Promise<PromptGenerationResult> {
  Logger.info("generateAndSendPromptForChannel: start", {
    channelId,
    userId
  });

  try {
    // Шаг 1: Генерируем промпт
    const { prompt, title } = await generatePromptForChannel(channelId, userId);
    Logger.info("Prompt generated", { channelId, promptLength: prompt.length, title });

    // Шаг 2: Используем общую функцию для отправки и планирования скачивания
    const result = await runVideoGenerationForChannel({
      channelId,
      userId,
      prompt,
      source: "schedule",
      title
    });

    if (!result.success) {
      throw new Error(result.error || "Не удалось запустить генерацию видео");
    }

    Logger.info("Prompt sent to Syntx via runVideoGenerationForChannel", { 
      channelId,
      messageId: result.messageId,
      chatId: result.chatId,
      title: title || "not provided",
      jobId: result.jobId
    });

    return {
      messageId: result.messageId,
      chatId: result.chatId,
      title,
      prompt
    };
  } catch (error) {
    Logger.error("Failed to generate and send prompt", {
      channelId,
      userId,
      error
    });
    throw error;
  }
}

