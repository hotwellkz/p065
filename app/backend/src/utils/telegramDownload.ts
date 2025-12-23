import * as fs from "fs/promises";
import * as path from "path";
import { randomUUID } from "crypto";
import type { TelegramClient } from "telegram";
import type { Api } from "telegram";
import { Logger } from "./logger";

// Используем process.cwd() для определения корня проекта (backend/)
// Это работает и в dev режиме (ts-node-dev), и после компиляции (dist/)
const TMP_DIR = path.join(process.cwd(), "tmp");
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Создаёт временную директорию, если её нет
 */
async function ensureTmpDir(): Promise<void> {
  try {
    await fs.access(TMP_DIR);
    // Папка существует, не логируем (можно использовать Logger.info для отладки)
  } catch {
    await fs.mkdir(TMP_DIR, { recursive: true });
    Logger.info("Created tmp directory", { path: TMP_DIR });
  }
}

/**
 * Скачивает видео из Telegram во временную папку
 * @param client - Telegram клиент
 * @param messageId - ID сообщения с видео (опционально, если не указан - ищет последнее)
 * @param chatId - ID чата (например, SYNX_CHAT_ID)
 * @returns Путь к временному файлу и имя файла
 */
export async function downloadTelegramVideoToTemp(
  client: TelegramClient,
  chatId: string | number,
  messageId?: number
): Promise<{ tempPath: string; fileName: string; messageId: number }> {
  await ensureTmpDir();

  let videoMessage: Api.Message;

  try {
    // ИСПРАВЛЕНИЕ: Если указан messageId, это обычно ID промпта (текстового сообщения),
    // а не видео. Видео приходит позже. Поэтому мы НЕ пытаемся получить сообщение с этим ID,
    // а ищем последнее видео ПОСЛЕ этого messageId.
    // Всегда ищем последнее видео в чате, но если messageId указан, фильтруем только видео после него
    
    // Ищем последнее видео в чате
    // Если messageId передан, ищем видео ПОСЛЕ этого сообщения (для автоматического скачивания)
    Logger.info("Searching for latest video in Telegram chat", {
      chatId,
      limit: messageId ? 100 : 50,
      afterMessageId: messageId || "not specified",
      note: messageId 
        ? "Will search for video after this prompt message ID" 
        : "Will search for latest video in chat"
    });

      let messages: Api.Message[];
      try {
        // Получаем больше сообщений, если нужно искать после конкретного messageId
        const limit = messageId ? 100 : 50;
        
        messages = await Promise.race([
          client.getMessages(chatId, {
            limit
          }) as Promise<Api.Message[]>,
          new Promise<Api.Message[]>((_, reject) => 
            setTimeout(() => reject(new Error("Get messages timeout after 30 seconds")), 30000)
          )
        ]);
      } catch (getMsgError: any) {
        const errorMsg = String(getMsgError?.message ?? getMsgError);
        const errorCode = getMsgError?.code;
        const errorClassName = getMsgError?.className;
        const errorErrorCode = getMsgError?.error_code;
        const errorErrorMessage = getMsgError?.error_message;
        
        // Детальное логирование реальной ошибки
        Logger.error("Error getting messages from Telegram chat - ДЕТАЛЬНАЯ ИНФОРМАЦИЯ", {
          error: errorMsg,
          errorCode,
          errorClassName,
          errorErrorCode,
          errorErrorMessage,
          chatId,
          messageId: messageId || "not specified",
          fullError: {
            message: errorMsg,
            code: errorCode,
            className: errorClassName,
            error_code: errorErrorCode,
            error_message: errorErrorMessage,
            name: getMsgError?.name,
            constructor: getMsgError?.constructor?.name
          }
        });
        
        // ТОЧНАЯ проверка на AUTH_KEY_UNREGISTERED (только настоящая ошибка сессии)
        const isAuthKeyUnregistered = 
          (errorCode === 401 && errorMsg?.includes("AUTH_KEY_UNREGISTERED")) ||
          (errorErrorCode === 401 && errorErrorMessage?.includes("AUTH_KEY_UNREGISTERED")) ||
          errorClassName === "AuthKeyUnregistered" ||
          (errorMsg?.includes("AUTH_KEY_UNREGISTERED") && 
           !errorMsg.includes("TELEGRAM_DOWNLOAD") && 
           !errorMsg.includes("TELEGRAM_TIMEOUT"));
        
        const isSessionRevoked = 
          errorClassName === "SessionRevoked" ||
          (errorMsg?.includes("SESSION_REVOKED") && 
           !errorMsg.includes("TELEGRAM_DOWNLOAD") && 
           !errorMsg.includes("TELEGRAM_TIMEOUT"));
        
        // Обработка ТОЛЬКО настоящей ошибки недействительной сессии Telegram
        if (isAuthKeyUnregistered || isSessionRevoked) {
          Logger.error("Telegram session invalid during getMessages - РЕАЛЬНАЯ ОШИБКА СЕССИИ", {
            error: errorMsg,
            errorCode,
            errorClassName,
            errorErrorCode,
            chatId,
            isAuthKeyUnregistered,
            isSessionRevoked
          });
          throw new Error(
            "TELEGRAM_SESSION_INVALID: Сессия Telegram недействительна (AUTH_KEY_UNREGISTERED). " +
            "Отвяжите и заново привяжите Telegram в настройках аккаунта."
          );
        }
        
        if (errorMsg.includes("timeout") || errorMsg.includes("TIMEOUT")) {
          throw new Error(
            "TELEGRAM_TIMEOUT: Превышено время ожидания получения сообщений. " +
            "Проверьте подключение к интернету и попробуйте ещё раз."
          );
        }
        throw getMsgError;
      }

      Logger.info(`Received ${messages.length} messages from Telegram chat`);

      // Фильтруем сообщения с видео
      // Если messageId указан, фильтруем только сообщения ПОСЛЕ него (с большим ID)
      const videoMessages = messages
        .filter((msg) => {
          // Если указан messageId, берём только сообщения после него
          if (messageId) {
            const msgId = (msg as any).id;
            if (typeof msgId === "number" && msgId <= messageId) {
              return false; // Пропускаем сообщения до или равные messageId промпта
            }
          }
          
          try {
            // Проверяем наличие video attachment
            const hasVideo =
              "video" in msg &&
              (msg as any).video != null &&
              !(msg as any).video.deleted;

            // Проверяем наличие document с видео-атрибутом
            const doc = (msg as any).document;
            const hasDocVideo =
              doc != null &&
              Array.isArray(doc.attributes) &&
              doc.attributes.some(
                (attr: any) =>
                  attr?.className === "DocumentAttributeVideo" ||
                  attr?.className === "MessageMediaDocument"
              ) &&
              // Дополнительная проверка MIME типа для документов
              (doc.mimeType?.startsWith("video/") ||
                doc.mimeType === "application/octet-stream" ||
                doc.fileName?.match(/\.(mp4|avi|mov|mkv|webm)$/i));

            return hasVideo || hasDocVideo;
          } catch (filterError) {
            Logger.warn("Error filtering video message", {
              messageId: (msg as any).id,
              error: String(filterError)
            });
            return false;
          }
        })
        .sort((a, b) => {
          // Сортируем по дате (самое свежее первым)
          let dateA = 0;
          let dateB = 0;

          try {
            const msgA = a as any;
            const msgB = b as any;

            if (msgA.date) {
              dateA =
                msgA.date instanceof Date
                  ? msgA.date.getTime()
                  : typeof msgA.date === "number"
                    ? msgA.date * 1000
                    : new Date(msgA.date).getTime();
            } else if (msgA.id) {
              dateA = msgA.id;
            }

            if (msgB.date) {
              dateB =
                msgB.date instanceof Date
                  ? msgB.date.getTime()
                  : typeof msgB.date === "number"
                    ? msgB.date * 1000
                    : new Date(msgB.date).getTime();
            } else if (msgB.id) {
              dateB = msgB.id;
            }
          } catch (sortError) {
            Logger.warn("Error sorting messages by date", {
              error: String(sortError)
            });
          }

          return dateB - dateA; // Сортируем по убыванию (новые первыми)
        });

      if (videoMessages.length === 0) {
        if (messageId) {
          throw new Error(
            `NO_VIDEO_FOUND: Видео ещё не готово в чате после сообщения ${messageId}. ` +
            `Подождите окончания генерации и попробуйте ещё раз.`
          );
        } else {
          throw new Error(
            "NO_VIDEO_FOUND: Видео ещё не готово в чате. Подождите окончания генерации и попробуйте ещё раз."
          );
        }
      }

      videoMessage = videoMessages[0];
      
      Logger.info("Found video message after filtering", {
        videoMessageId: (videoMessage as any).id,
        promptMessageId: messageId || "not specified",
        totalVideoMessages: videoMessages.length
      });

    Logger.info("Video message found, preparing to download", {
      messageId: videoMessage.id,
      hasVideo: "video" in videoMessage,
      hasDocument: "document" in videoMessage
    });

    // Определяем имя файла из сообщения или используем дефолтное
    let originalFileName = "video.mp4";
    const doc = (videoMessage as any).document;
    if (doc?.fileName) {
      originalFileName = doc.fileName;
    } else if ((videoMessage as any).video) {
      originalFileName = `video_${videoMessage.id}.mp4`;
    }

    // Генерируем уникальное имя файла для временной папки
    // Используем timestamp и UUID для уникальности
    const fileExtension = path.extname(originalFileName) || ".mp4";
    const uniqueFileName = `${Date.now()}_${randomUUID().slice(0, 8)}${fileExtension}`;
    const tempPath = path.join(TMP_DIR, uniqueFileName);
    
    // Логируем полный путь для отладки
    Logger.info("Generated temp file path", {
      tmpDir: TMP_DIR,
      uniqueFileName,
      tempPath,
      absolutePath: path.resolve(tempPath)
    });

    Logger.info("Starting video download from Telegram to temp file", {
      messageId: videoMessage.id,
      tempPath,
      originalFileName
    });

    const downloadStartTime = Date.now();

    // Скачиваем файл в Buffer, затем записываем в файл
    // Это более надёжный способ, чем прямое скачивание в файл
    Logger.info("Downloading media to buffer", {
      messageId: videoMessage.id,
      tempPath
    });

    let fileBuffer: Buffer;
    try {
      // Добавляем таймаут для скачивания (5 минут для больших файлов)
      const downloadTimeout = 5 * 60 * 1000; // 5 минут
      
      fileBuffer = await Promise.race([
        client.downloadMedia(videoMessage, {}) as Promise<Buffer>,
        new Promise<Buffer>((_, reject) => 
          setTimeout(() => reject(new Error("Download timeout after 5 minutes")), downloadTimeout)
        )
      ]);
    } catch (downloadError: any) {
      const errorMessage = String(downloadError?.message ?? downloadError);
      const errorCode = downloadError?.code;
      const errorClassName = downloadError?.className;
      const errorErrorCode = downloadError?.error_code;
      const errorErrorMessage = downloadError?.error_message;
      
      // Детальное логирование реальной ошибки
      Logger.error("Error during Telegram media download to buffer - ДЕТАЛЬНАЯ ИНФОРМАЦИЯ", {
        error: errorMessage,
        errorCode,
        errorClassName,
        errorErrorCode,
        errorErrorMessage,
        messageId: videoMessage.id,
        errorType: downloadError?.name,
        fullError: {
          message: errorMessage,
          code: errorCode,
          className: errorClassName,
          error_code: errorErrorCode,
          error_message: errorErrorMessage,
          name: downloadError?.name,
          constructor: downloadError?.constructor?.name
        }
      });
      
      // ТОЧНАЯ проверка на AUTH_KEY_UNREGISTERED (только настоящая ошибка сессии)
      const isAuthKeyUnregistered = 
        (errorCode === 401 && errorMessage?.includes("AUTH_KEY_UNREGISTERED")) ||
        (errorErrorCode === 401 && errorErrorMessage?.includes("AUTH_KEY_UNREGISTERED")) ||
        errorClassName === "AuthKeyUnregistered" ||
        (errorMessage?.includes("AUTH_KEY_UNREGISTERED") && 
         !errorMessage.includes("TELEGRAM_DOWNLOAD") && 
         !errorMessage.includes("TELEGRAM_TIMEOUT"));
      
      const isSessionRevoked = 
        errorClassName === "SessionRevoked" ||
        (errorMessage?.includes("SESSION_REVOKED") && 
         !errorMessage.includes("TELEGRAM_DOWNLOAD") && 
         !errorMessage.includes("TELEGRAM_TIMEOUT"));
      
      // Обработка ТОЛЬКО настоящей ошибки недействительной сессии Telegram
      if (isAuthKeyUnregistered || isSessionRevoked) {
        Logger.error("Telegram session invalid during video download - РЕАЛЬНАЯ ОШИБКА СЕССИИ", {
          error: errorMessage,
          errorCode,
          errorClassName,
          errorErrorCode,
          chatId,
          messageId: videoMessage.id,
          isAuthKeyUnregistered,
          isSessionRevoked
        });
        throw new Error(
          "TELEGRAM_SESSION_INVALID: Сессия Telegram недействительна (AUTH_KEY_UNREGISTERED). " +
          "Отвяжите и заново привяжите Telegram в настройках аккаунта."
        );
      }
      
      // Специальная обработка таймаутов
      if (errorMessage.includes("timeout") || errorMessage.includes("TIMEOUT")) {
        throw new Error(
          "TELEGRAM_DOWNLOAD_TIMEOUT: Превышено время ожидания скачивания видео. " +
          "Проверьте подключение к интернету и попробуйте ещё раз."
        );
      }
      
      throw new Error(
        `TELEGRAM_DOWNLOAD_ERROR: ${errorMessage || "Не удалось скачать видео из Telegram"}`
      );
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      Logger.error("Downloaded file buffer is empty", {
        messageId: videoMessage.id,
        hasVideo: "video" in videoMessage,
        hasDocument: "document" in videoMessage
      });
      throw new Error(
        "TELEGRAM_DOWNLOAD_FAILED: Скачанный файл пуст или повреждён. Возможно, видео ещё не готово."
      );
    }
    
    // Дополнительная проверка: файл должен быть больше 1KB (минимальный размер для видео)
    if (fileBuffer.length < 1024) {
      Logger.error("Downloaded file is too small (likely incomplete)", {
        messageId: videoMessage.id,
        fileSize: fileBuffer.length,
        expectedMinSize: 1024
      });
      throw new Error(
        "TELEGRAM_DOWNLOAD_FAILED: Скачанный файл слишком мал (возможно, видео ещё не готово или повреждено)."
      );
    }

    // Записываем Buffer в файл
    Logger.info("Writing buffer to file", {
      tempPath,
      bufferSize: fileBuffer.length
    });

    await fs.writeFile(tempPath, fileBuffer);

    // Проверяем, что файл был создан и не пустой
    const stats = await fs.stat(tempPath);
    if (stats.size === 0) {
      await fs.unlink(tempPath).catch(() => {});
      Logger.error("File written to disk is empty", {
        messageId: videoMessage.id,
        tempPath,
        bufferSize: fileBuffer.length
      });
      throw new Error(
        "TELEGRAM_DOWNLOAD_FAILED: Скачанный файл пуст или повреждён. Возможно, видео ещё не готово."
      );
    }
    
    // Проверяем, что размер файла на диске совпадает с размером буфера
    if (stats.size !== fileBuffer.length) {
      Logger.error("File size mismatch", {
        messageId: videoMessage.id,
        tempPath,
        bufferSize: fileBuffer.length,
        fileSize: stats.size
      });
      await fs.unlink(tempPath).catch(() => {});
      throw new Error(
        "TELEGRAM_DOWNLOAD_FAILED: Размер файла на диске не совпадает с размером буфера. Файл может быть повреждён."
      );
    }

    // Проверяем размер файла
    if (stats.size > MAX_FILE_SIZE) {
      await fs.unlink(tempPath).catch(() => {});
      throw new Error(
        `FILE_TOO_LARGE: Файл слишком большой (${(stats.size / (1024 * 1024)).toFixed(2)} MB). Максимальный размер: ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
      );
    }

    const downloadDuration = Date.now() - downloadStartTime;
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    Logger.info("Video downloaded successfully to temp file", {
      messageId: videoMessage.id,
      tempPath,
      fileSizeBytes: stats.size,
      fileSizeMB,
      downloadDurationMs: downloadDuration,
      downloadSpeedMBps: (
        (stats.size / (1024 * 1024)) /
        (downloadDuration / 1000)
      ).toFixed(2)
    });

    return {
      tempPath,
      fileName: originalFileName,
      messageId: videoMessage.id as number
    };
  } catch (error: any) {
    const errorMessage = String(error?.message ?? error);
    const errorCode = error?.code;
    const errorClassName = error?.className;

    Logger.error("Error downloading video from Telegram", {
      error: errorMessage,
      errorCode,
      errorClassName,
      chatId,
      messageId,
      fullError: error
    });

    // Пробрасываем ошибку дальше с понятным сообщением
    if (errorMessage.includes("TELEGRAM_SESSION_INVALID")) {
      throw new Error(errorMessage);
    }
    
    if (errorMessage.includes("NO_VIDEO_FOUND")) {
      throw new Error(errorMessage);
    }

    if (errorMessage.includes("not found")) {
      throw new Error(
        `TELEGRAM_MESSAGE_NOT_FOUND: Сообщение с ID ${messageId} не найдено в чате.`
      );
    }

    throw new Error(
      `TELEGRAM_DOWNLOAD_ERROR: ${errorMessage || "Не удалось скачать видео из Telegram"}`
    );
  }
}

/**
 * Удаляет временный файл
 * @param tempPath - Путь к временному файлу
 */
export async function cleanupTempFile(tempPath: string): Promise<void> {
  try {
    await fs.unlink(tempPath);
    Logger.info("Temporary file deleted", { tempPath });
  } catch (error) {
    Logger.warn("Failed to delete temporary file", {
      tempPath,
      error: String(error)
    });
    // Не пробрасываем ошибку, так как это cleanup операция
  }
}

