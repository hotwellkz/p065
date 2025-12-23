import { sendPromptToSyntax, type TelegramMessageInfo } from "./sendPromptFromUserToSyntx";
import { scheduleAutoDownload } from "./scheduledTasks";
import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { getAutoDownloadDelayMinutesForChannel } from "./autoSendScheduler";
import type { Channel } from "../types/channel";
import { generateVideoTitleFromPrompt, type TitleSource } from "./titleGenerator";

export type VideoGenerationSource = "schedule" | "custom_prompt";

export interface VideoGenerationOptions {
  channelId: string;
  userId: string;
  prompt: string;
  source: VideoGenerationSource;
  title?: string; // Опциональное название для кастомного промпта (из UI)
}

export interface VideoGenerationResult {
  success: boolean;
  messageId: number;
  chatId: string;
  jobId?: string; // ID запланированной задачи скачивания
  error?: string;
}

/**
 * Универсальная функция для запуска генерации видео для канала
 * Используется как для автоматизации по расписанию, так и для ручного запуска
 */
export async function runVideoGenerationForChannel(
  options: VideoGenerationOptions
): Promise<VideoGenerationResult> {
  const { channelId, userId, prompt, source, title } = options;

  Logger.info("runVideoGenerationForChannel: start", {
    channelId,
    userId,
    source,
    promptLength: prompt.length,
    hasTitle: !!title
  });

  // Валидация промпта
  if (!prompt || !prompt.trim()) {
    const error = "Промпт не может быть пустым";
    Logger.error("runVideoGenerationForChannel: validation failed", {
      channelId,
      userId,
      source,
      error
    });
    return {
      success: false,
      messageId: 0,
      chatId: "",
      error
    };
  }

  const MAX_PROMPT_LENGTH = 15000;
  if (prompt.length > MAX_PROMPT_LENGTH) {
    const error = `Промпт слишком длинный. Максимальная длина: ${MAX_PROMPT_LENGTH} символов`;
    Logger.error("runVideoGenerationForChannel: validation failed", {
      channelId,
      userId,
      source,
      promptLength: prompt.length,
      maxLength: MAX_PROMPT_LENGTH,
      error
    });
    return {
      success: false,
      messageId: 0,
      chatId: "",
      error
    };
  }

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    const error = "Firebase Admin не настроен";
    Logger.error("runVideoGenerationForChannel: Firestore not available", {
      channelId,
      userId,
      source
    });
    return {
      success: false,
      messageId: 0,
      chatId: "",
      error
    };
  }

  try {
    let effectiveTitle: string | undefined = title?.trim() || undefined;
    let titleSource: TitleSource | undefined = effectiveTitle ? "ui" : undefined;

    // Проверяем, что канал существует и принадлежит пользователю
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      const error = "Канал не найден";
      Logger.error("runVideoGenerationForChannel: channel not found", {
        channelId,
        userId,
        source
      });
      return {
        success: false,
        messageId: 0,
        chatId: "",
        error
      };
    }

    const channelData = channelSnap.data() as {
      name?: string;
      autoDownloadToDriveEnabled?: boolean;
      googleDriveFolderId?: string;
      autoDownloadDelayMinutes?: number;
      generationTransport?: "telegram_global" | "telegram_user";
      telegramSyntaxPeer?: string | null;
      language?: "ru" | "en" | "kk";
    };

    const channel = {
      id: channelId,
      name: channelData.name || "",
      platform: "YOUTUBE_SHORTS" as const,
      language: "ru" as const,
      targetDurationSec: 60,
      niche: "",
      audience: "",
      tone: "",
      blockedTopics: "",
      generationTransport: channelData.generationTransport || "telegram_global",
      telegramSyntaxPeer: channelData.telegramSyntaxPeer || null
    } as Channel;

    Logger.info("runVideoGenerationForChannel: channel validated", {
      channelId,
      userId,
      channelName: channelData.name || "not provided",
      source,
      transport: channel.generationTransport
    });

    // ИСПРАВЛЕНИЕ: Используем title из UI как есть, НЕ перезаписываем его
    // Если title приходит из UI (поле "НАЗВАНИЕ РОЛИКА / ФАЙЛА"), используем его напрямую
    // Функция buildVideoBaseName уже умеет обрезать длинные названия через sanitizeBaseName
    // Генерируем title через OpenAI ТОЛЬКО если его нет вообще
    if (!effectiveTitle) {
      try {
        const langHint = channelData.language || "ru";
        
        Logger.info("[AUTO_JOB] generating title from prompt (no UI title provided)", {
          channelId,
          userId,
          source,
          languageHint: langHint,
          promptLength: prompt.length,
          reason: "no title from UI"
        });

        const titleResult = await generateVideoTitleFromPrompt({
          promptText: prompt,
          languageHint: langHint,
          channelName: channelData.name
        });

        effectiveTitle = titleResult.title;
        titleSource = titleResult.source;

        Logger.info("[TITLE_GEN] generated for auto job (fallback)", {
          channelId,
          userId,
          source,
          title: effectiveTitle,
          titleSource,
          titleLength: effectiveTitle.length
        });
      } catch (titleError: any) {
        const msg = titleError?.message || String(titleError);
        Logger.warn("[TITLE_GEN] generation failed for auto job, proceeding without title", {
          channelId,
          userId,
          source,
          error: msg
        });
        // Если генерация не удалась, оставляем undefined
        effectiveTitle = undefined;
      }
    } else {
      // Title из UI есть - используем его как есть
      Logger.info("[AUTO_JOB] using title from UI", {
        channelId,
        userId,
        source,
        title: effectiveTitle,
        titleLength: effectiveTitle.length,
        titleSource: "ui"
      });
    }

    // Шаг 1: Отправляем промпт в Syntx
    Logger.info("runVideoGenerationForChannel: sending prompt to Syntx", {
      channelId,
      userId,
      source,
      promptLength: prompt.length,
      transport: channel.generationTransport
    });

    let messageInfo: TelegramMessageInfo;
    try {
      // Используем новую функцию, которая учитывает настройки канала
      messageInfo = await sendPromptToSyntax(channel, userId, prompt.trim());
    } catch (sendError: any) {
      const errorMessage = sendError?.message || String(sendError);
      Logger.error("runVideoGenerationForChannel: failed to send prompt to Syntx", {
        channelId,
        userId,
        source,
        transport: channel.generationTransport || "telegram_global",
        error: errorMessage,
        errorStack: sendError?.stack
      });

      // Обрабатываем специфичные ошибки Telegram
      if (errorMessage.includes("TELEGRAM_SESSION_EXPIRED") || 
          errorMessage.includes("TELEGRAM_SESSION_NOT_INITIALIZED")) {
        return {
          success: false,
          messageId: 0,
          chatId: "",
          error: "Telegram-сеанс не настроен или истёк. Запустите 'npm run dev:login' в папке backend."
        };
      }

      if (errorMessage.includes("TELEGRAM_USER_NOT_CONNECTED")) {
        return {
          success: false,
          messageId: 0,
          chatId: "",
          error: "Личный Telegram аккаунт не привязан. Привяжите Telegram в настройках профиля."
        };
      }

      return {
        success: false,
        messageId: 0,
        chatId: "",
        error: `Не удалось отправить промпт в Syntx: ${errorMessage}`
      };
    }

    Logger.info("runVideoGenerationForChannel: prompt sent to Syntx successfully", {
      channelId,
      userId,
      source,
      messageId: messageInfo.messageId,
      chatId: messageInfo.chatId
    });

    // Шаг 2: Если включено автоматическое скачивание, планируем задачу
    let jobId: string | undefined;
    if (
      channelData.autoDownloadToDriveEnabled === true &&
      channelData.googleDriveFolderId
    ) {
      // Вычисляем задержку на основе расписания каналов
      const promptSentAt = new Date();
      const delayMinutes = await getAutoDownloadDelayMinutesForChannel(userId, promptSentAt);
      
      // Определяем диапазон для логирования
      const hour = promptSentAt.getHours();
      let range: string;
      if (hour >= 0 && hour < 13) {
        range = "00-13";
      } else if (hour >= 13 && hour < 17) {
        range = "13-17";
      } else {
        range = "17-24";
      }

      Logger.info("runVideoGenerationForChannel: scheduling auto-download", {
        channelId,
        userId,
        source,
        delayMinutes,
        range,
        promptSentAt: promptSentAt.toISOString(),
        googleDriveFolderId: channelData.googleDriveFolderId,
        note: "Delay calculated from schedule settings (interval - 1)"
      });

      try {
        jobId = scheduleAutoDownload({
          channelId,
          scheduleId: source === "schedule" ? `schedule_${Date.now()}` : `custom_${Date.now()}`,
          userId,
          telegramMessageInfo: {
            messageId: messageInfo.messageId,
            chatId: messageInfo.chatId
          },
          delayMinutes,
          videoTitle: effectiveTitle,
          prompt: prompt.trim()
        });

        Logger.info("runVideoGenerationForChannel: auto-download scheduled", {
          channelId,
          userId,
          source,
          jobId,
          willRunInMinutes: delayMinutes
        });
      } catch (scheduleError: any) {
        Logger.error("runVideoGenerationForChannel: failed to schedule auto-download", {
          channelId,
          userId,
          source,
          error: scheduleError?.message || String(scheduleError),
          errorStack: scheduleError?.stack
        });
        // Не прерываем выполнение, так как промпт уже отправлен
      }
    } else {
      Logger.info("runVideoGenerationForChannel: auto-download not enabled or folder not configured", {
        channelId,
        userId,
        source,
        autoDownloadToDriveEnabled: channelData.autoDownloadToDriveEnabled,
        hasGoogleDriveFolder: !!channelData.googleDriveFolderId
      });
    }

    // Шаг 3: Сохраняем запись о запуске в историю канала
    try {
      await channelRef.collection("videoGenerations").add({
        source,
        prompt: prompt.trim(),
        title: effectiveTitle || null,
        videoTitle: effectiveTitle || null,
        titleSource: titleSource || (title ? "ui" : null),
        promptText: prompt.trim(),
        messageId: messageInfo.messageId,
        chatId: messageInfo.chatId,
        status: "queued",
        createdAt: new Date(),
        scheduledDownloadJobId: jobId || null
      });

      Logger.info("runVideoGenerationForChannel: generation record saved to history", {
        channelId,
        userId,
        source,
        messageId: messageInfo.messageId
      });
    } catch (historyError) {
      Logger.warn("runVideoGenerationForChannel: failed to save generation record", {
        channelId,
        userId,
        source,
        error: String(historyError)
      });
      // Не прерываем выполнение, так как основная операция выполнена
    }

    return {
      success: true,
      messageId: messageInfo.messageId,
      chatId: messageInfo.chatId,
      jobId
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    Logger.error("runVideoGenerationForChannel: unexpected error", {
      channelId,
      userId,
      source,
      error: errorMessage,
      errorStack: error?.stack
    });

    return {
      success: false,
      messageId: 0,
      chatId: "",
      error: `Ошибка при запуске генерации: ${errorMessage}`
    };
  }
}


