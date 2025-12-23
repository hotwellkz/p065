import { createTelegramClientFromStringSession } from "../telegram/client";
import { loadSessionString } from "../telegram/sessionStore";
import { getClientForUser } from "../integrations/telegram/TelegramUserClient";
import { downloadTelegramVideoToTemp, cleanupTempFile } from "../utils/telegramDownload";
import { uploadFileToDrive } from "./googleDrive";
import { uploadFileToDriveWithOAuth } from "./googleDriveOAuth";
import { getUserOAuthTokens, updateUserAccessToken } from "../repositories/userOAuthTokensRepo";
import { uploadFileToUserDrive } from "./googleDriveUserUploadService";
import { findGoogleDriveIntegrationByUserId } from "../repositories/googleDriveIntegrationRepo";
import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { Logger } from "../utils/logger";
import { google } from "googleapis";
import { generateVideoFileName } from "../utils/fileUtils";
import { sendVideoUploadNotification } from "./notificationService";
import { notificationRepository } from "../repositories/notificationRepo";
import type { TelegramClient } from "telegram";
import * as fs from "fs/promises";
import * as path from "path";
import { getUserChannelStoragePaths, ensureChannelDirectories as ensureUserChannelDirectories } from "./storage/userChannelStorage";

const SYNX_CHAT_ID = process.env.SYNX_CHAT_ID;

export interface DownloadAndUploadOptions {
  channelId: string;
  userId: string;
  telegramMessageId?: number;
  videoTitle?: string; // сгенерированное название ролика
  prompt?: string; // текст промпта для fallback
  scheduleId?: string; // Для отслеживания автоматических загрузок
}

export interface DownloadAndUploadResult {
  success: boolean;
  driveFileId?: string;
  driveWebViewLink?: string;
  driveWebContentLink?: string;
  fileName?: string;
  error?: string;
}

/**
 * Скачивает видео из Telegram и загружает его (legacy функция, используется для старых сценариев)
 * Используется как для ручной загрузки, так и для автоматической
 */
export async function downloadAndUploadVideoToDrive(
  options: DownloadAndUploadOptions
): Promise<DownloadAndUploadResult> {
  const { channelId, userId, telegramMessageId, videoTitle, prompt, scheduleId } = options;

  // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ
  console.log("AUTO_TASK_START:", {
    channelId,
    userId,
    telegramMessageId,
    scheduleId: scheduleId || "manual",
    timestamp: new Date().toISOString(),
    callStack: new Error().stack?.split("\n").slice(1, 4).join(" | ")
  });

  // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ СРАВНЕНИЯ РУЧНОГО И АВТОМАТИЧЕСКОГО РЕЖИМА
  const mode = scheduleId ? "auto" : "manual";
  Logger.info(`downloadAndUploadVideoToDrive ${mode}: start`, {
    mode,
    channelId,
    userId,
    telegramMessageId,
    videoTitle: videoTitle || "not provided",
    scheduleId: scheduleId || "manual",
    timestamp: new Date().toISOString(),
    callStack: new Error().stack?.split("\n").slice(1, 4).join(" | ")
  });

  console.log(`DOWNLOAD_AND_UPLOAD_${mode.toUpperCase()}_START:`, {
    mode,
    channelId,
    userId,
    telegramMessageId,
    scheduleId: scheduleId || "manual",
    timestamp: new Date().toISOString()
  });

  if (!SYNX_CHAT_ID) {
    return {
      success: false,
      error: "SYNX_CHAT_ID is not configured on the server"
    };
  }

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    Logger.error("Firestore is not available in downloadAndUploadVideoToDrive");
    return {
      success: false,
      error: "Firebase Admin не настроен"
    };
  }

  let tempFilePath: string | null = null;
  let telegramClient: TelegramClient | null = null;

  try {
    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return {
        success: false,
        error: "Канал не найден"
      };
    }

    const channelData = channelSnap.data() as {
      name?: string;
      googleDriveFolderId?: string;
      uploadNotificationEnabled?: boolean;
      uploadNotificationChatId?: string;
      generationTransport?: "telegram_global" | "telegram_user";
      telegramSyntaxPeer?: string | null;
    };
    
    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ПАРАМЕТРОВ КАНАЛА
    Logger.info(`downloadAndUploadVideoToDrive ${mode}: channel data loaded`, {
      mode,
      channelId,
      userId,
      channelName: channelData.name || "not set",
      googleDriveFolderId: channelData.googleDriveFolderId || "NOT SET",
      googleDriveFolderIdType: typeof channelData.googleDriveFolderId,
      uploadNotificationEnabled: channelData.uploadNotificationEnabled,
      uploadNotificationChatId: channelData.uploadNotificationChatId || "not set",
      generationTransport: channelData.generationTransport || "telegram_global",
      telegramSyntaxPeer: channelData.telegramSyntaxPeer || "not set"
    });

    console.log(`CHANNEL_DATA_${mode.toUpperCase()}:`, {
      mode,
      channelId,
      googleDriveFolderId: channelData.googleDriveFolderId || "NOT_SET",
      hasGoogleDriveFolderId: !!channelData.googleDriveFolderId,
      generationTransport: channelData.generationTransport || "telegram_global"
    });
    
    // Определяем тип Telegram-клиента на основе настроек канала
    const transport = channelData.generationTransport || "telegram_global";
    Logger.info(`downloadAndUploadVideoToDrive ${mode}: определяем тип Telegram-клиента`, {
      mode,
      channelId,
      userId,
      transport,
      note: transport === "telegram_user" 
        ? "Будет использована личная сессия пользователя" 
        : "Будет использована глобальная сессия"
    });

    // ПРОВЕРКА 1: Проверяем, не был ли уже загружен файл с таким telegramMessageId
    if (telegramMessageId) {
      Logger.info("downloadAndUploadVideoToDrive: checking for existing upload by telegramMessageId", {
        channelId,
        userId,
        telegramMessageId,
        checkTimestamp: new Date().toISOString()
      });

      // Проверяем в коллекции generatedVideos
      const existingVideoQuery = await channelRef
        .collection("generatedVideos")
        .where("telegramMessageId", "==", telegramMessageId)
        .limit(10) // Получаем несколько записей, чтобы проверить наличие driveFileId
        .get();

      // Фильтруем в памяти, так как Firestore не поддерживает != null напрямую
      const existingVideoDoc = existingVideoQuery.docs.find(
        (doc) => {
          const data = doc.data();
          return data.driveFileId && data.driveFileId.trim() !== "";
        }
      );

      if (existingVideoDoc) {
        const existingVideo = existingVideoDoc.data();
        console.log("UPLOAD_SKIPPED_ALREADY_UPLOADED:", {
          taskId: `${channelId}_${telegramMessageId}`,
          reason: "found_in_generatedVideos",
          driveFileId: existingVideo.driveFileId,
          createdAt: existingVideo.createdAt
        });

        Logger.warn("downloadAndUploadVideoToDrive: file already uploaded (found in generatedVideos)", {
          channelId,
          userId,
          telegramMessageId,
          existingDriveFileId: existingVideo.driveFileId,
          existingWebViewLink: existingVideo.driveWebViewLink,
          existingCreatedAt: existingVideo.createdAt
        });

        return {
          success: true,
          driveFileId: existingVideo.driveFileId,
          driveWebViewLink: existingVideo.driveWebViewLink,
          driveWebContentLink: existingVideo.driveWebContentLink,
          fileName: existingVideo.fileName || "unknown"
        };
      }

      // Проверяем в коллекции videoGenerations (если там есть флаг uploadedToDrive и driveFileId)
      const existingGenerationQuery = await channelRef
        .collection("videoGenerations")
        .where("messageId", "==", telegramMessageId)
        .limit(10) // Получаем несколько записей для проверки
        .get();

      // Фильтруем в памяти: ищем запись с uploadedToDrive === true И driveFileId
      const existingGenDoc = existingGenerationQuery.docs.find(
        (doc) => {
          const data = doc.data();
          return data.uploadedToDrive === true && data.driveFileId && data.driveFileId.trim() !== "";
        }
      );

      if (existingGenDoc) {
        const existingGen = existingGenDoc.data();
        console.log("UPLOAD_SKIPPED_ALREADY_UPLOADED:", {
          taskId: `${channelId}_${telegramMessageId}`,
          reason: "found_in_videoGenerations",
          driveFileId: existingGen.driveFileId,
          uploadedToDrive: existingGen.uploadedToDrive,
          createdAt: existingGen.createdAt
        });

        Logger.warn("downloadAndUploadVideoToDrive: file already uploaded (found in videoGenerations)", {
          channelId,
          userId,
          telegramMessageId,
          existingDriveFileId: existingGen.driveFileId,
          existingCreatedAt: existingGen.createdAt
        });

        return {
          success: true,
          driveFileId: existingGen.driveFileId,
          driveWebViewLink: existingGen.driveWebViewLink,
          driveWebContentLink: existingGen.driveWebContentLink,
          fileName: existingGen.fileName || "unknown"
        };
      }

      Logger.info("downloadAndUploadVideoToDrive: no existing upload found, proceeding with download and upload", {
        channelId,
        userId,
        telegramMessageId,
        willDownload: true,
        willUpload: true
      });
    } else {
      Logger.info("downloadAndUploadVideoToDrive: no telegramMessageId provided, skipping duplicate check, proceeding with download", {
        channelId,
        userId,
        note: "Will proceed with download and upload"
      });
    }

    // Определяем папку для загрузки: сначала из канала, потом из .env
    const folderIdFromChannel = channelData.googleDriveFolderId?.trim() || undefined;
    const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT?.trim() || undefined;

    const finalFolderId = folderIdFromChannel || defaultFolderId;

    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ОПРЕДЕЛЕНИЯ ПАПКИ
    Logger.info(`downloadAndUploadVideoToDrive ${mode}: determining Google Drive folder`, {
      mode,
      channelId,
      userId,
      folderIdFromChannel: folderIdFromChannel || "not set",
      defaultFolderId: defaultFolderId || "not set",
      finalFolderId: finalFolderId || "NOT SET",
      willProceed: !!finalFolderId
    });

    console.log(`FOLDER_ID_${mode.toUpperCase()}:`, {
      mode,
      channelId,
      folderIdFromChannel: folderIdFromChannel || "NOT_SET",
      defaultFolderId: defaultFolderId || "NOT_SET",
      finalFolderId: finalFolderId || "NOT_SET",
      willProceed: !!finalFolderId
    });

    if (!finalFolderId) {
      const errorMsg = "Не указана папка для загрузки. Укажите googleDriveFolderId в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env";
      Logger.error(`downloadAndUploadVideoToDrive ${mode}: folder not specified`, {
        mode,
        channelId,
        userId,
        error: errorMsg
      });
      return {
        success: false,
        error: errorMsg
      };
    }

    // Создаём Telegram-клиент в зависимости от настроек канала
    if (transport === "telegram_user") {
      // Используем личную сессию пользователя (та же, что для отправки промпта)
      Logger.info("downloadAndUploadVideoToDrive: используем личную сессию пользователя", {
        userId,
        channelId,
        transport: "telegram_user",
        note: "Та же сессия, что используется для отправки промпта"
      });
      try {
        telegramClient = await getClientForUser(userId);
        Logger.info("downloadAndUploadVideoToDrive: личная сессия получена успешно", {
          userId,
          clientConnected: telegramClient.connected,
          sessionType: "personal"
        });
      } catch (clientError: any) {
        const clientErrorMessage = String(clientError?.message ?? clientError);
        Logger.error("downloadAndUploadVideoToDrive: ошибка получения личной сессии", {
          userId,
          error: clientErrorMessage,
          errorCode: clientError?.code,
          errorClassName: clientError?.className
        });
        
        if (
          clientErrorMessage.includes("Telegram integration not found") ||
          clientErrorMessage.includes("not active")
        ) {
          return {
            success: false,
            error: "TELEGRAM_USER_NOT_CONNECTED: Telegram не привязан. Привяжите Telegram в настройках аккаунта."
          };
        }
        
        throw clientError;
      }
    } else {
      // Используем глобальную сессию
      Logger.info("downloadAndUploadVideoToDrive: используем глобальную сессию", {
        channelId,
        transport: "telegram_global",
        note: "Глобальная системная сессия"
      });
      const stringSession = loadSessionString();
      if (!stringSession) {
        return {
          success: false,
          error: "TELEGRAM_SESSION_NOT_INITIALIZED: Telegram-сеанс не настроен. Сначала подключите SyntX на backend (npm run dev:login)."
        };
      }
      telegramClient = await createTelegramClientFromStringSession(stringSession);
      Logger.info("downloadAndUploadVideoToDrive: глобальная сессия получена успешно", {
        clientConnected: telegramClient.connected,
        sessionType: "global"
      });
    }

    try {
      // Шаг 1: Скачиваем видео во временную папку
      // ВАЖНО: При автоматическом скачивании telegramMessageId - это ID промпта (текстового сообщения),
      // а не видео. Видео приходит позже. Поэтому передаём messageId как "маркер" для поиска видео ПОСЛЕ него,
      // но не пытаемся получить само сообщение с этим ID.
      Logger.info("Step 1: Downloading video from Telegram to temp folder", {
        chatId: SYNX_CHAT_ID,
        promptMessageId: telegramMessageId || "not specified",
        note: telegramMessageId 
          ? "Will search for video after this prompt message ID" 
          : "Will search for latest video in chat"
      });

      // Передаём messageId только как маркер для поиска видео после него
      // В downloadTelegramVideoToTemp это будет использовано для фильтрации сообщений
      Logger.info("downloadAndUploadVideoToDrive: starting video download from Telegram", {
        channelId,
        userId,
        telegramMessageId,
        chatId: SYNX_CHAT_ID,
        scheduleId: scheduleId || "manual"
      });

      console.log("DOWNLOAD_START:", {
        channelId,
        telegramMessageId,
        chatId: SYNX_CHAT_ID,
        timestamp: new Date().toISOString()
      });

      let downloadResult;
      try {
        downloadResult = await downloadTelegramVideoToTemp(
          telegramClient,
          SYNX_CHAT_ID,
          telegramMessageId // Передаём как маркер, не как конкретное сообщение
        );
        
        console.log("DOWNLOAD_SUCCESS:", {
          filePath: downloadResult.tempPath,
          fileName: downloadResult.fileName,
          messageId: downloadResult.messageId,
          timestamp: new Date().toISOString()
        });
      } catch (downloadError: any) {
        const errorMessage = String(downloadError?.message ?? downloadError);
        const errorCode = downloadError?.code;
        const errorClassName = downloadError?.className;
        const errorErrorCode = downloadError?.error_code;
        const errorErrorMessage = downloadError?.error_message;
        
        // Детальное логирование реальной ошибки от Telegram
        Logger.error("downloadAndUploadVideoToDrive: video download failed - ДЕТАЛЬНАЯ ИНФОРМАЦИЯ ОБ ОШИБКЕ", {
          channelId,
          userId,
          telegramMessageId,
          transport,
          // Основные поля ошибки
          errorMessage,
          errorCode,
          errorClassName,
          errorErrorCode,
          errorErrorMessage,
          // Дополнительные поля
          errorStack: downloadError?.stack,
          errorName: downloadError?.name,
          errorType: typeof downloadError,
          // Полный объект ошибки (без чувствительных данных)
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
          Logger.error("Telegram session invalid in downloadAndUploadVideoToDrive - РЕАЛЬНАЯ ОШИБКА СЕССИИ", {
            channelId,
            userId,
            telegramMessageId,
            transport,
            error: errorMessage,
            errorCode,
            errorClassName,
            errorErrorCode,
            isAuthKeyUnregistered,
            isSessionRevoked
          });
          // Не создаем уведомление для ошибки сессии - пользователь должен перепривязать Telegram
          return {
            success: false,
            error: "TELEGRAM_SESSION_INVALID: Сессия Telegram недействительна (AUTH_KEY_UNREGISTERED). Отвяжите и заново привяжите Telegram в настройках аккаунта."
          };
        }

        // Создаём уведомление об ошибке скачивания (только для других ошибок, не связанных с сессией)
        try {
          let timeSlot: string | undefined;
          if (scheduleId) {
            try {
              const scheduleDoc = await channelRef.collection("autoSendSchedules").doc(scheduleId).get();
              if (scheduleDoc.exists) {
                const scheduleData = scheduleDoc.data();
                timeSlot = scheduleData?.time || undefined;
              }
            } catch {
              // ignore
            }
          }

          await notificationRepository.create({
            userId,
            channelId,
            type: "video_download_failed",
            title: "Ошибка скачивания видео из Telegram",
            message: `Канал: ${channelData.name || channelId}${timeSlot ? `, слот ${timeSlot}` : ""}. ${errorMessage || "Не удалось скачать видео"}`,
            status: "error",
            isRead: false,
            metadata: {
              scheduleId: scheduleId || undefined,
              timeSlot,
              errorDetails: errorMessage
            }
          });
        } catch (notificationError) {
          Logger.error("Failed to create download error notification", {
            error: notificationError instanceof Error ? notificationError.message : String(notificationError)
          });
        }

        throw new Error(`VIDEO_DOWNLOAD_FAILED: Не удалось скачать видео из Telegram. ${errorMessage}`);
      }

      tempFilePath = downloadResult.tempPath;

      Logger.info(`downloadAndUploadVideoToDrive ${mode}: video downloaded successfully`, {
        mode,
        channelId,
        userId,
        tempPath: tempFilePath,
        fileName: downloadResult.fileName,
        messageId: downloadResult.messageId
      });

      console.log(`VIDEO_DOWNLOADED_${mode.toUpperCase()}:`, {
        mode,
        channelId,
        tempPath: tempFilePath,
        fileName: downloadResult.fileName,
        messageId: downloadResult.messageId
      });

      // Шаг 2: Загружаем файл в Google Drive
      Logger.info("Step 2: Uploading file to Google Drive", {
        filePath: tempFilePath,
        folderId: finalFolderId
      });

      // Формируем имя файла для Google Drive используя общую функцию
      const driveFileName = generateVideoFileName({
        title: videoTitle,
        prompt: prompt,
        channelName: channelData.name,
        createdAt: new Date()
      });
      
      Logger.info("Generated video file name for Google Drive", {
        channelId,
        originalTitle: videoTitle || "not provided",
        promptLength: prompt?.length || 0,
        channelName: channelData.name || "not provided",
        fileName: driveFileName
      });

      // Определяем, какую интеграцию использовать: новую (googleDriveIntegrations) или старую (userOAuthTokens)
      Logger.info(`downloadAndUploadVideoToDrive ${mode}: starting Google Drive upload`, {
        mode,
        channelId,
        userId,
        fileName: driveFileName,
        folderId: finalFolderId,
        filePath: tempFilePath,
        scheduleId: scheduleId || "manual",
        timestamp: new Date().toISOString()
      });

      console.log(`UPLOAD_START_${mode.toUpperCase()}:`, {
        mode,
        channelId,
        userId,
        fileName: driveFileName,
        folderId: finalFolderId,
        filePath: tempFilePath,
        timestamp: new Date().toISOString()
      });

      console.log("UPLOAD_START:", {
        filePath: tempFilePath,
        fileName: driveFileName,
        folderId: finalFolderId,
        timestamp: new Date().toISOString()
      });

      let driveResult;
      let userTokens: any = null;
      
      try {
        // Сначала проверяем новую интеграцию через googleDriveIntegrations
        const googleDriveIntegration = await findGoogleDriveIntegrationByUserId(userId);
        
        if (googleDriveIntegration && googleDriveIntegration.status === "active") {
          // Используем новую систему интеграций
          Logger.info("downloadAndUploadVideoToDrive: using new Google Drive integration", {
            userId,
            integrationId: googleDriveIntegration.id,
            email: googleDriveIntegration.email,
            folderId: finalFolderId
          });
          
          try {
            // Читаем файл в Buffer для новой функции
            const fs = await import("fs");
            const fileBuffer = await fs.promises.readFile(tempFilePath);
            
            driveResult = await uploadFileToUserDrive({
              userId,
              fileBuffer,
              mimeType: "video/mp4",
              fileName: driveFileName,
              folderId: finalFolderId
            });
            
            Logger.info("downloadAndUploadVideoToDrive: new integration upload successful", {
              userId,
              fileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink
            });

            console.log("UPLOAD_SUCCESS:", {
              driveFileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink,
              fileName: driveFileName,
              method: "new_integration",
              timestamp: new Date().toISOString()
            });
          } catch (newIntegrationError: any) {
            const errorMessage = String(newIntegrationError?.message || newIntegrationError);
            const errorType = newIntegrationError?.errorType;
            const errorCode = newIntegrationError?.code;
            
            Logger.error("downloadAndUploadVideoToDrive: new integration upload failed", {
              userId,
              error: errorMessage,
              errorType,
              errorCode,
              folderId: finalFolderId,
              userEmail: newIntegrationError?.userEmail
            });
            
            // Проверяем, является ли это ошибкой отсутствия интеграции
            if (
              errorMessage.includes("Google Drive integration not found") ||
              errorMessage.includes("not active") ||
              errorMessage.includes("Refresh token not available")
            ) {
              // Не пробрасываем ошибку дальше, пробуем fallback
              Logger.warn("downloadAndUploadVideoToDrive: Google Drive integration not available, trying fallback", {
                userId,
                error: errorMessage
              });
              // Продолжаем выполнение, чтобы попробовать legacy OAuth или Service Account
            } else if (
              errorType === "FOLDER_ACCESS" ||
              errorType === "FOLDER_NOT_FOUND" ||
              errorType === "NOT_A_FOLDER" ||
              errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND") ||
              errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED") ||
              errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")
            ) {
              // Ошибки доступа к папке - пробрасываем с структурированной информацией
              const structuredError: any = new Error(errorMessage);
              structuredError.errorType = errorType || "FOLDER_ACCESS";
              structuredError.folderId = newIntegrationError?.folderId || finalFolderId;
              structuredError.userEmail = newIntegrationError?.userEmail;
              throw structuredError;
            } else {
              throw newIntegrationError;
            }
          }
        }
        
        // Если новая интеграция не сработала или не найдена, проверяем старую систему
        if (!driveResult) {
          // Fallback: проверяем старую систему (userOAuthTokens) для обратной совместимости
          Logger.info("downloadAndUploadVideoToDrive: checking legacy OAuth tokens", { userId });
          
          userTokens = await getUserOAuthTokens(userId);
          
          if (userTokens?.googleDriveAccessToken) {
            Logger.info("downloadAndUploadVideoToDrive: using legacy OAuth tokens", {
              userId,
              hasRefreshToken: !!userTokens.googleDriveRefreshToken,
              tokenExpiry: userTokens.googleDriveTokenExpiry 
                ? new Date(userTokens.googleDriveTokenExpiry).toISOString() 
                : "not set"
            });
            
            // Проверяем, не истёк ли токен
            const now = Date.now();
            const isExpired = userTokens.googleDriveTokenExpiry 
              ? userTokens.googleDriveTokenExpiry < now 
              : false;
            
            let accessToken = userTokens.googleDriveAccessToken;
            
            // Если токен истёк, обновляем его
            if (isExpired && userTokens.googleDriveRefreshToken) {
              Logger.info("downloadAndUploadVideoToDrive: legacy OAuth token expired, refreshing", { 
                userId,
                expiryTime: new Date(userTokens.googleDriveTokenExpiry || 0).toISOString()
              });
              
              const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
              );
              oauth2Client.setCredentials({ refresh_token: userTokens.googleDriveRefreshToken });
              
              const { credentials } = await oauth2Client.refreshAccessToken();
              accessToken = credentials.access_token!;
              
              // Сохраняем обновлённый токен
              await updateUserAccessToken(
                userId,
                accessToken,
                credentials.expiry_date || Date.now() + 3600000
              );
              
              Logger.info("downloadAndUploadVideoToDrive: legacy OAuth token refreshed", { userId });
            }
            
            // Используем OAuth токен для загрузки через старую функцию
            try {
              driveResult = await uploadFileToDriveWithOAuth({
                filePath: tempFilePath,
                fileName: driveFileName,
                mimeType: "video/mp4",
                parentFolderId: finalFolderId,
                accessToken: accessToken
              });
              
              Logger.info("downloadAndUploadVideoToDrive: legacy OAuth upload successful", {
                userId,
                fileId: driveResult.fileId,
                webViewLink: driveResult.webViewLink
              });

              console.log("UPLOAD_SUCCESS:", {
                driveFileId: driveResult.fileId,
                webViewLink: driveResult.webViewLink,
                fileName: driveFileName,
                method: "legacy_oauth",
                timestamp: new Date().toISOString()
              });
            } catch (legacyOAuthError: any) {
              Logger.error("downloadAndUploadVideoToDrive: legacy OAuth upload failed", {
                userId,
                error: legacyOAuthError?.message || String(legacyOAuthError),
                errorCode: legacyOAuthError?.code
              });
              throw legacyOAuthError;
            }
          }
        }
        
        // Если и legacy OAuth не сработал, используем Service Account
        if (!driveResult) {
          // Fallback: используем Service Account (может не работать для загрузки)
          Logger.warn("downloadAndUploadVideoToDrive: no user integration found, using Service Account", { 
            userId,
            folderId: finalFolderId
          });
          
          try {
            driveResult = await uploadFileToDrive({
              filePath: tempFilePath,
              fileName: driveFileName,
              mimeType: "video/mp4",
              parentFolderId: finalFolderId
            });
            
            Logger.info("downloadAndUploadVideoToDrive: Service Account upload successful", {
              userId,
              fileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink
            });

            console.log("UPLOAD_SUCCESS:", {
              driveFileId: driveResult.fileId,
              webViewLink: driveResult.webViewLink,
              fileName: driveFileName,
              timestamp: new Date().toISOString()
            });
          } catch (serviceAccountError: any) {
            Logger.error("downloadAndUploadVideoToDrive: Service Account upload failed", {
              userId,
              error: serviceAccountError?.message || String(serviceAccountError),
              errorStack: serviceAccountError?.stack,
              errorCode: serviceAccountError?.code,
              folderId: finalFolderId
            });
            throw serviceAccountError;
          }
        }
        
        // Если загрузка успешна, продолжаем обработку
        if (!driveResult) {
          throw new Error("GOOGLE_DRIVE_UPLOAD_FAILED: Не удалось загрузить файл в Google Drive. Все методы загрузки не сработали.");
        }
        
        Logger.info(`downloadAndUploadVideoToDrive ${mode}: File uploaded to Google Drive successfully`, {
          mode,
          channelId,
          userId,
          telegramMessageId,
          fileId: driveResult.fileId,
          fileName: driveFileName,
          webViewLink: driveResult.webViewLink,
          folderId: finalFolderId,
          scheduleId: scheduleId || "manual",
          uploadedAt: new Date().toISOString()
        });

        console.log(`UPLOAD_SUCCESS_${mode.toUpperCase()}:`, {
          mode,
          channelId,
          userId,
          driveFileId: driveResult.fileId,
          webViewLink: driveResult.webViewLink,
          fileName: driveFileName,
          folderId: finalFolderId,
          timestamp: new Date().toISOString()
        });

        // Уведомления в Telegram (если включены)
        try {
          if (channelData.uploadNotificationEnabled === true) {
          // Определяем chatId для уведомления:
          // 1. Если указан uploadNotificationChatId - используем его
          // 2. Если нет, но есть telegramSyntaxPeer - используем его (для совместимости с предыдущей логикой)
          // 3. Иначе используем SYNX_CHAT_ID из env
          const notificationChatId = channelData.uploadNotificationChatId?.trim() || 
                                     channelData.telegramSyntaxPeer?.trim() || 
                                     SYNX_CHAT_ID;

          if (notificationChatId) {
            Logger.info("Sending video upload notification", {
              channelId,
              userId,
              generationTransport: transport,
              notificationChatId,
              uploadNotificationChatId: channelData.uploadNotificationChatId,
              telegramSyntaxPeer: channelData.telegramSyntaxPeer,
              envSyntxChatId: SYNX_CHAT_ID
            });

            await sendVideoUploadNotification({
              chatId: notificationChatId,
              channelName: channelData.name || `channel_${channelId}`,
              fileName: driveFileName,
              webViewLink: driveResult.webViewLink,
              webContentLink: driveResult.webContentLink,
              sizeBytes: undefined,
              uploadedAt: new Date(),
              userId: transport === "telegram_user" ? userId : undefined,
              generationTransport: transport
            });
          } else {
            Logger.warn("Video upload notification is enabled but no chatId is available", {
              channelId,
              uploadNotificationChatId: channelData.uploadNotificationChatId,
              telegramSyntaxPeer: channelData.telegramSyntaxPeer,
              envSyntxChatIdSet: !!SYNX_CHAT_ID
            });
          }
        }
      } catch (notifyError: any) {
        // Ошибки при отправке уведомления не ломают загрузку файла
        const errorCode = notifyError?.errorCode || notifyError?.code;
        const errorMessage = String(notifyError?.message ?? notifyError);

        if (errorCode === "TELEGRAM_SESSION_INVALID" || errorMessage.includes("AUTH_KEY_UNREGISTERED")) {
          Logger.error("Error while sending video upload notification: TELEGRAM_SESSION_INVALID", {
            channelId,
            userId,
            generationTransport: transport,
            error: errorMessage,
            errorCode
          });
        } else {
          Logger.error("Error while sending video upload notification", {
            channelId,
            userId,
            generationTransport: transport,
            error: errorMessage,
            errorCode
          });
        }
      }

        // Шаг 3: Удаляем временный файл
        Logger.info("Step 3: Cleaning up temporary file", {
          tempPath: tempFilePath
        });

        await cleanupTempFile(tempFilePath);
        tempFilePath = null; // Помечаем, что файл удалён

        // Шаг 4: Сохраняем информацию о видео в Firestore
        try {
          // Сохраняем в generatedVideos
          await channelRef.collection("generatedVideos").add({
            driveFileId: driveResult.fileId,
            driveWebViewLink: driveResult.webViewLink || null,
            driveWebContentLink: driveResult.webContentLink || null,
            createdAt: new Date(),
            source: scheduleId ? "auto-scheduled" : "manual",
            telegramMessageId: downloadResult.messageId,
            scheduleId: scheduleId || null,
            fileName: driveFileName
          });

          // Обновляем videoGenerations, если есть запись с таким messageId
          // ВАЖНО: Обновляем uploadedToDrive и driveFileId для идемпотентности
          if (telegramMessageId) {
            const generationQuery = await channelRef
              .collection("videoGenerations")
              .where("messageId", "==", telegramMessageId)
              .limit(1)
              .get();

            if (!generationQuery.empty) {
              const generationDoc = generationQuery.docs[0];
              const updateData = {
                uploadedToDrive: true,
                driveFileId: driveResult.fileId,
                driveWebViewLink: driveResult.webViewLink || null,
                driveWebContentLink: driveResult.webContentLink || null,
                uploadedAt: new Date(),
                fileName: driveFileName,
                status: "completed" // Обновляем статус на completed
              };
              
              await generationDoc.ref.update(updateData);

              Logger.info("downloadAndUploadVideoToDrive: updated videoGenerations with upload info", {
                channelId,
                userId,
                telegramMessageId,
                generationId: generationDoc.id,
                driveFileId: driveResult.fileId,
                uploadedToDrive: true
              });
            } else {
              // Если записи нет, создаём новую для истории
              try {
                await channelRef.collection("videoGenerations").add({
                  messageId: telegramMessageId,
                  uploadedToDrive: true,
                  driveFileId: driveResult.fileId,
                  driveWebViewLink: driveResult.webViewLink || null,
                  driveWebContentLink: driveResult.webContentLink || null,
                  uploadedAt: new Date(),
                  fileName: driveFileName,
                  status: "completed",
                  createdAt: new Date()
                });
                
                Logger.info("downloadAndUploadVideoToDrive: created new videoGenerations record", {
                  channelId,
                  userId,
                  telegramMessageId,
                  driveFileId: driveResult.fileId
                });
              } catch (createError) {
                Logger.warn("downloadAndUploadVideoToDrive: failed to create videoGenerations record", {
                  channelId,
                  userId,
                  telegramMessageId,
                  error: String(createError)
                });
              }
            }
          }

          // Обновляем последнее видео в канале (опционально)
          await channelRef.update({
            lastVideoDriveFileId: driveResult.fileId,
            lastVideoDriveLink: driveResult.webViewLink || null,
            lastVideoUpdatedAt: new Date()
          });

          Logger.info("downloadAndUploadVideoToDrive: video info saved to Firestore", {
            channelId,
            userId,
            telegramMessageId: downloadResult.messageId,
            driveFileId: driveResult.fileId
          });
        } catch (firestoreError) {
          Logger.warn("Failed to save video info to Firestore", {
            error: String(firestoreError),
            channelId,
            userId,
            telegramMessageId: downloadResult.messageId
          });
          // Не прерываем выполнение, так как файл уже загружен
        }

        Logger.info("Video successfully processed and uploaded to Google Drive", {
          fileId: driveResult.fileId,
          webViewLink: driveResult.webViewLink,
          scheduleId: scheduleId || "manual"
        });

        // Создаём уведомление об успешной загрузке
        try {
          // Получаем информацию о времени слота, если есть scheduleId
          let timeSlot: string | undefined;
          if (scheduleId) {
            try {
              const scheduleDoc = await channelRef.collection("autoSendSchedules").doc(scheduleId).get();
              if (scheduleDoc.exists) {
                const scheduleData = scheduleDoc.data();
                timeSlot = scheduleData?.time || undefined;
              }
            } catch (scheduleError) {
              Logger.warn("Failed to fetch schedule info for notification", {
                scheduleId,
                error: String(scheduleError)
              });
            }
          }

          await notificationRepository.create({
            userId,
            channelId,
            type: "video_uploaded",
            title: "Видео загружено на Google Drive",
            message: `Канал: ${channelData.name || channelId}${timeSlot ? `, слот ${timeSlot}` : ""}, файл: ${driveFileName}`,
            status: "success",
            isRead: false,
            driveFileUrl: driveResult.webViewLink || driveResult.webContentLink,
            metadata: {
              fileName: driveFileName,
              scheduleId: scheduleId || undefined,
              timeSlot
            }
          });
        } catch (notificationError) {
          // Ошибки при создании уведомления не должны ломать процесс
          Logger.error("Failed to create success notification", {
            error: notificationError instanceof Error ? notificationError.message : String(notificationError),
            userId,
            channelId
          });
        }

        return {
          success: true,
          driveFileId: driveResult.fileId,
          driveWebViewLink: driveResult.webViewLink,
          driveWebContentLink: driveResult.webContentLink,
          fileName: driveFileName
        };
      } catch (uploadError: any) {
        // Обработка ошибок загрузки в Google Drive
        const errorMessage = String(uploadError?.message || uploadError);
        const errorType = uploadError?.errorType;
        const folderId = uploadError?.folderId || finalFolderId;
        const userEmail = uploadError?.userEmail;
        
        Logger.error(`downloadAndUploadVideoToDrive ${mode}: upload error in catch block`, {
          mode,
          channelId,
          userId,
          error: errorMessage,
          errorType,
          folderId,
          userEmail,
          errorCode: uploadError?.code,
          scheduleId: scheduleId || "manual"
        });

        console.error(`UPLOAD_ERROR_${mode.toUpperCase()}:`, {
          mode,
          channelId,
          userId,
          error: errorMessage,
          errorType,
          folderId,
          timestamp: new Date().toISOString()
        });
        
        // Проверяем, является ли это ошибкой отсутствия интеграции
        if (
          errorMessage.includes("Google Drive integration not found") ||
          errorMessage.includes("not active") ||
          errorMessage.includes("Refresh token not available") ||
          errorMessage.includes("GOOGLE_DRIVE_NOT_CONNECTED")
        ) {
          const error = new Error(
            `GOOGLE_DRIVE_NOT_CONNECTED: Google Drive не подключён. Подключите его в настройках аккаунта.`
          );
          (error as any).errorType = "NOT_CONNECTED";
          throw error;
        }
        
        // Обработка ошибок доступа к папке
        if (
          errorType === "FOLDER_ACCESS" ||
          errorType === "FOLDER_NOT_FOUND" ||
          errorType === "NOT_A_FOLDER" ||
          errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND") ||
          errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED") ||
          errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")
        ) {
          const error = new Error(errorMessage);
          (error as any).errorType = errorType || "FOLDER_ACCESS";
          (error as any).folderId = folderId;
          (error as any).userEmail = userEmail;
          throw error;
        }
        
        // Для других ошибок пробрасываем дальше
        throw uploadError;
      }
    } catch (err: any) {
      const errorMessage = String(err?.message ?? err);
      const errorStack = err?.stack;

      Logger.error(`Error in downloadAndUploadVideoToDrive ${mode}`, {
        mode,
        error: errorMessage,
        stack: errorStack,
        userId,
        channelId,
        tempFilePath,
        scheduleId: scheduleId || "manual"
      });

      console.error(`ERROR_${mode.toUpperCase()}:`, {
        mode,
        channelId,
        userId,
        error: errorMessage,
        scheduleId: scheduleId || "manual",
        timestamp: new Date().toISOString()
      });

      // Создаём уведомление об общей ошибке автоматизации (если ещё не создано)
      // Проверяем, что это не ошибка скачивания или загрузки (они уже обработаны выше)
      if (!errorMessage.includes("VIDEO_DOWNLOAD_FAILED") && !errorMessage.includes("GOOGLE_DRIVE_UPLOAD_FAILED")) {
        try {
          if (isFirestoreAvailable() && db) {
            const channelRef = db
              .collection("users")
              .doc(userId)
              .collection("channels")
              .doc(channelId);
            const channelSnap = await channelRef.get();
            const channelData = channelSnap.exists ? channelSnap.data() : null;

            let timeSlot: string | undefined;
            if (scheduleId) {
              try {
                const scheduleDoc = await channelRef.collection("autoSendSchedules").doc(scheduleId).get();
                if (scheduleDoc.exists) {
                  const scheduleData = scheduleDoc.data();
                  timeSlot = scheduleData?.time || undefined;
                }
              } catch {
                // ignore
              }
            }

            await notificationRepository.create({
              userId,
              channelId,
              type: "automation_error",
              title: "Ошибка автоматизации",
              message: `Канал: ${channelData?.name || channelId}${timeSlot ? `, слот ${timeSlot}` : ""}. ${errorMessage}`,
              status: "error",
              isRead: false,
              metadata: {
                scheduleId: scheduleId || undefined,
                timeSlot,
                errorDetails: errorMessage
              }
            });
          }
        } catch (notificationError) {
          Logger.error("Failed to create automation error notification", {
            error: notificationError instanceof Error ? notificationError.message : String(notificationError)
          });
        }
      }

      // Удаляем временный файл в случае ошибки
      if (tempFilePath) {
        Logger.warn("Cleaning up temp file after error", { tempFilePath });
        await cleanupTempFile(tempFilePath).catch((cleanupError) => {
          Logger.error("Failed to cleanup temp file after error", {
            tempPath: tempFilePath,
            error: String(cleanupError)
          });
        });
      }

      return {
        success: false,
        error: errorMessage
      };
    } finally {
      // Отключаемся от Telegram
      try {
        if (telegramClient) {
          await telegramClient.disconnect();
        }
      } catch {
        // ignore
      }
    }
  } catch (outerError: any) {
    // Обработка ошибок на верхнем уровне
    Logger.error("downloadAndUploadVideoToDrive: outer error", {
      error: String(outerError?.message ?? outerError),
      userId,
      channelId
    });
    
    // Удаляем временный файл в случае ошибки
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath).catch(() => {
        // ignore
      });
    }
    
    // Отключаемся от Telegram
    if (telegramClient) {
      try {
        await telegramClient.disconnect();
      } catch {
        // ignore
      }
    }
    
    return {
      success: false,
      error: String(outerError?.message ?? outerError)
    };
  }
}

export interface DownloadAndSaveToLocalOptions {
  channelId: string;
  userId: string;
  telegramMessageId?: number;
  videoTitle?: string;
  prompt?: string;
}

export interface DownloadAndSaveToLocalResult {
  success: boolean;
  inputPath?: string;
  filename?: string;
  channelSlug?: string;
  channelName?: string;
  storage?: {
    userEmail: string;
    userDir: string;
    inputDir: string;
    archiveDir: string;
    filePath: string;
    fileName: string;
  };
  error?: string;
}

/**
 * Скачивает видео из Telegram и сохраняет его в локальное хранилище на сервере
 * Используется для кнопки "Забрать видео из SyntX на сервер"
 */
export async function downloadAndSaveToLocal(
  options: DownloadAndSaveToLocalOptions
): Promise<DownloadAndSaveToLocalResult> {
  const { channelId, userId, telegramMessageId, videoTitle, prompt } = options;

  Logger.info("downloadAndSaveToLocal: start", {
    channelId,
    userId,
    telegramMessageId,
    videoTitle: videoTitle || "not provided"
  });

  if (!SYNX_CHAT_ID) {
    return {
      success: false,
      error: "SYNX_CHAT_ID is not configured on the server"
    };
  }

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    Logger.error("Firestore is not available in downloadAndSaveToLocal");
    return {
      success: false,
      error: "Firebase Admin не настроен"
    };
  }

  let tempFilePath: string | null = null;
  let telegramClient: TelegramClient | null = null;

  try {
    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return {
        success: false,
        error: "Канал не найден"
      };
    }

    const channelData = channelSnap.data() as {
      name?: string;
      generationTransport?: "telegram_global" | "telegram_user";
      telegramSyntaxPeer?: string | null;
    };

    // Получаем email пользователя из Firebase Auth
    let userEmail = `${userId}@unknown.local`;
    try {
      const { getAdmin } = await import("./firebaseAdmin");
      const admin = getAdmin();
      if (admin) {
        const userRecord = await admin.auth().getUser(userId);
        userEmail = userRecord.email || userEmail;
      }
    } catch (authError: any) {
      Logger.warn("Failed to get user email from Firebase Auth, using fallback", {
        userId,
        error: authError?.message || String(authError)
      });
    }

    Logger.info("downloadAndSaveToLocal: channel data loaded", {
      channelId,
      userId,
      userEmail,
      channelName: channelData.name || "not set",
      generationTransport: channelData.generationTransport || "telegram_global",
      telegramSyntaxPeer: channelData.telegramSyntaxPeer || "not set"
    });

    // Определяем тип Telegram-клиента на основе настроек канала
    const transport = channelData.generationTransport || "telegram_global";
    
    if (transport === "telegram_user") {
      Logger.info("downloadAndSaveToLocal: используем личную сессию пользователя", {
        userId,
        channelId,
        transport: "telegram_user"
      });
      try {
        telegramClient = await getClientForUser(userId);
      } catch (clientError: any) {
        const clientErrorMessage = String(clientError?.message ?? clientError);
        Logger.error("downloadAndSaveToLocal: ошибка получения личной сессии", {
          userId,
          error: clientErrorMessage
        });
        
        if (
          clientErrorMessage.includes("Telegram integration not found") ||
          clientErrorMessage.includes("not active")
        ) {
          return {
            success: false,
            error: "TELEGRAM_USER_NOT_CONNECTED: Telegram не привязан. Привяжите Telegram в настройках аккаунта."
          };
        }
        
        throw clientError;
      }
    } else {
      Logger.info("downloadAndSaveToLocal: используем глобальную сессию", {
        channelId,
        transport: "telegram_global"
      });
      const stringSession = loadSessionString();
      if (!stringSession) {
        return {
          success: false,
          error: "TELEGRAM_SESSION_NOT_INITIALIZED: Telegram-сеанс не настроен. Сначала подключите SyntX на backend (npm run dev:login)."
        };
      }
      telegramClient = await createTelegramClientFromStringSession(stringSession);
    }

    try {
      // Шаг 1: Скачиваем видео во временную папку
      Logger.info("downloadAndSaveToLocal: starting video download from Telegram", {
        channelId,
        userId,
        telegramMessageId,
        chatId: SYNX_CHAT_ID
      });

      let downloadResult;
      try {
        downloadResult = await downloadTelegramVideoToTemp(
          telegramClient,
          SYNX_CHAT_ID,
          telegramMessageId
        );
      } catch (downloadError: any) {
        const errorMessage = String(downloadError?.message ?? downloadError);
        const errorCode = downloadError?.code;
        const errorClassName = downloadError?.className;
        const errorErrorCode = downloadError?.error_code;
        const errorErrorMessage = downloadError?.error_message;

        Logger.error("downloadAndSaveToLocal: video download failed", {
          channelId,
          userId,
          telegramMessageId,
          transport,
          errorMessage,
          errorCode,
          errorClassName,
          errorErrorCode,
          errorErrorMessage
        });

        // Проверка на недействительную сессию Telegram
        const isAuthKeyUnregistered = 
          (errorCode === 401 && errorMessage?.includes("AUTH_KEY_UNREGISTERED")) ||
          (errorErrorCode === 401 && errorErrorMessage?.includes("AUTH_KEY_UNREGISTERED")) ||
          errorClassName === "AuthKeyUnregistered";

        const isSessionRevoked = 
          errorClassName === "SessionRevoked" ||
          errorMessage?.includes("SESSION_REVOKED");

        if (isAuthKeyUnregistered || isSessionRevoked) {
          Logger.error("Telegram session invalid in downloadAndSaveToLocal", {
            channelId,
            userId,
            telegramMessageId,
            transport,
            error: errorMessage
          });
          return {
            success: false,
            error: "TELEGRAM_SESSION_INVALID: Сессия Telegram недействительна (AUTH_KEY_UNREGISTERED). Отвяжите и заново привяжите Telegram в настройках аккаунта."
          };
        }

        throw new Error(`VIDEO_DOWNLOAD_FAILED: Не удалось скачать видео из Telegram. ${errorMessage}`);
      }

      tempFilePath = downloadResult.tempPath;

      Logger.info("downloadAndSaveToLocal: video downloaded successfully", {
        channelId,
        userId,
        tempPath: tempFilePath,
        fileName: downloadResult.fileName,
        messageId: downloadResult.messageId
      });

      // Шаг 2: Сохраняем файл в локальное хранилище
      Logger.info("downloadAndSaveToLocal: saving file to local storage", {
        channelId,
        userId,
        tempPath: tempFilePath
      });

      // Получаем пути к хранилищу канала пользователя
      const channelName = channelData.name || `channel_${channelId}`;
      const paths = getUserChannelStoragePaths({
        userId,
        userEmail,
        channelId,
        channelName
      });
      
      // Создаём директории, если их нет
      await ensureUserChannelDirectories(paths);

      // Формируем имя файла
      const fileName = generateVideoFileName({
        title: videoTitle,
        prompt: prompt,
        channelName: channelName,
        createdAt: new Date()
      });

      // Очищаем имя файла от недопустимых символов
      const safeFileName = fileName
        .replace(/[<>:"/\\|?*]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_{2,}/g, "_")
        .trim();

      // Читаем файл в Buffer
      const fileBuffer = await fs.readFile(tempFilePath);

      // Сохраняем файл в inputDir
      const filePath = path.join(paths.inputDir, safeFileName);
      await fs.writeFile(filePath, fileBuffer);

      console.log('[Storage] Video saved to inputDir', {
        channelId,
        channelName,
        userEmail: paths.userEmail,
        userDir: paths.userDir,
        inputDir: paths.inputDir,
        fileName: safeFileName,
        filePath
      });

      Logger.info("downloadAndSaveToLocal: file saved to local storage", {
        channelId,
        userId,
        userEmail: paths.userEmail,
        userSlug: paths.userSlug,
        inputPath: filePath,
        filename: safeFileName,
        channelSlug: paths.channelSlug
      });

      // Шаг 3: Удаляем временный файл
      await cleanupTempFile(tempFilePath);
      tempFilePath = null;

      // Шаг 4: Сохраняем информацию о видео в Firestore
      try {
        await channelRef.collection("generatedVideos").add({
          localFilePath: filePath,
          localFilename: safeFileName,
          channelSlug: paths.channelSlug,
          createdAt: new Date(),
          source: "manual",
          telegramMessageId: downloadResult.messageId,
          fileName: safeFileName
        });

        Logger.info("downloadAndSaveToLocal: video info saved to Firestore", {
          channelId,
          userId,
          telegramMessageId: downloadResult.messageId,
          inputPath: filePath
        });
      } catch (firestoreError) {
        Logger.warn("Failed to save video info to Firestore", {
          error: String(firestoreError),
          channelId,
          userId,
          telegramMessageId: downloadResult.messageId
        });
        // Не прерываем выполнение, так как файл уже сохранён
      }

      return {
        success: true,
        inputPath: filePath,
        filename: safeFileName,
        channelSlug: paths.channelSlug,
        channelName: channelName,
        storage: {
          userEmail: paths.userEmail,
          userDir: paths.userDir,
          inputDir: paths.inputDir,
          archiveDir: paths.archiveDir,
          filePath: filePath,
          fileName: safeFileName
        }
      };
    } catch (error: any) {
      const errorMessage = String(error?.message ?? error);
      Logger.error("downloadAndSaveToLocal: error", {
        channelId,
        userId,
        error: errorMessage
      });

      // Удаляем временный файл в случае ошибки
      if (tempFilePath) {
        await cleanupTempFile(tempFilePath).catch(() => {
          // ignore
        });
      }

      return {
        success: false,
        error: errorMessage
      };
    } finally {
      // Отключаемся от Telegram
      try {
        if (telegramClient) {
          await telegramClient.disconnect();
        }
      } catch {
        // ignore
      }
    }
  } catch (outerError: any) {
    Logger.error("downloadAndSaveToLocal: outer error", {
      error: String(outerError?.message ?? outerError),
      userId,
      channelId
    });
    
    // Удаляем временный файл в случае ошибки
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath).catch(() => {
        // ignore
      });
    }
    
    // Отключаемся от Telegram
    if (telegramClient) {
      try {
        await telegramClient.disconnect();
      } catch {
        // ignore
      }
    }
    
    return {
      success: false,
      error: String(outerError?.message ?? outerError)
    };
  }
}

