import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { telegramLoginSessionRepository } from "../repositories/telegramLoginSessionRepo";
import { telegramAccountRepository } from "../repositories/telegramAccountRepo";
import {
  createTempClientState,
  getTempClientState,
  deleteTempClientState
} from "../telegram/client";
import { encrypt } from "../crypto/aes";
import {
  sendPromptFromUserToSyntx,
  TelegramSessionExpiredError
} from "../services/sendPromptFromUserToSyntx";
import { loadSessionString } from "../telegram/sessionStore";
import { createTelegramClientFromStringSession } from "../telegram/client";
import { Api } from "telegram/tl";
import { uploadVideoToDrive, uploadFileToDrive } from "../services/googleDrive";
import { uploadFileToDriveWithOAuth } from "../services/googleDriveOAuth";
import { getUserOAuthTokens, updateUserAccessToken } from "../repositories/userOAuthTokensRepo";
import { google } from "googleapis";
import {
  downloadTelegramVideoToTemp,
  cleanupTempFile
} from "../utils/telegramDownload";
import { generateVideoFileName } from "../utils/fileUtils";
import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable, getFirebaseError } from "../services/firebaseAdmin";
import { downloadAndUploadVideoToDrive, downloadAndSaveToLocal } from "../services/videoDownloadService";
import { downloadFromUrl } from "../services/urlDownloader";
import { getUserChannelStoragePaths, ensureChannelDirectories as ensureUserChannelDirectories } from "../services/storage/userChannelStorage";
import { getStorageService } from "../services/storageService";
import { generateVideoId } from "../utils/fileUtils";
import * as fs from "fs/promises";
import * as path from "path";

const router = Router();

router.post("/start", authRequired, async (req, res) => {
  try {
    const { phone } = req.body as { phone?: string };
    if (!phone) {
      return res.status(400).json({ error: "phone is required" });
    }

    const userId = req.user!.uid;
    const stateId = `${userId}_${Date.now()}`;

    await createTempClientState(stateId, phone);
    const state = getTempClientState(stateId);
    if (!state) {
      return res.status(500).json({ error: "FAILED_TO_CREATE_STATE" });
    }

    const result = await state.client.sendCode(
      {
        apiId: Number(process.env.TELEGRAM_API_ID),
        apiHash: process.env.TELEGRAM_API_HASH ?? ""
      },
      phone
    );

    const phoneCodeHash = (result as { phoneCodeHash?: string }).phoneCodeHash;
    if (!phoneCodeHash) {
      return res.status(500).json({ error: "FAILED_TO_SEND_CODE" });
    }

    await telegramLoginSessionRepository.create({
      id: stateId,
      userId,
      phone,
      mtprotoStateId: stateId,
      phoneCodeHash,
      createdAt: new Date()
    });

    return res.json({ status: "code_sent" });
  } catch (err) {
    console.error("Error in /api/telegram/start", err);
    return res.status(500).json({ error: "FAILED_TO_SEND_CODE" });
  }
});

router.post("/confirm", authRequired, async (req, res) => {
  try {
    const { phone, code, password } = req.body as {
      phone?: string;
      code?: string;
      password?: string;
    };

    if (!phone || !code) {
      return res.status(400).json({ error: "phone and code are required" });
    }

    const userId = req.user!.uid;
    const loginSession =
      await telegramLoginSessionRepository.findByUserIdAndPhone(
        userId,
        phone
      );

    if (!loginSession) {
      return res.status(400).json({ error: "NO_PENDING_LOGIN_SESSION" });
    }

    const state = getTempClientState(loginSession.mtprotoStateId);
    if (!state) {
      return res.status(400).json({ error: "MTPROTO_STATE_NOT_FOUND" });
    }

    try {
      // Используем правильные методы Telegram API
      await state.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCode: code,
          phoneCodeHash: loginSession.phoneCodeHash
        })
      );
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes("SESSION_PASSWORD_NEEDED") || err?.errorMessage?.includes("SESSION_PASSWORD_NEEDED")) {
        if (!password) {
          return res
            .status(400)
            .json({ error: "PASSWORD_REQUIRED_FOR_2FA" });
        }
        // Используем правильный метод для проверки пароля
        const pwd = await state.client.invoke(new Api.account.GetPassword());
        if (!pwd.currentAlgo) {
          return res.status(400).json({ error: "PASSWORD_ALGO_NOT_AVAILABLE" });
        }
        // Вычисляем хеш пароля вручную
        const { computeCheck } = await import("telegram/Password");
        const passwordHash = await computeCheck(pwd, password);
        await state.client.invoke(
          new Api.auth.CheckPassword({
            password: passwordHash
          })
        );
      } else {
        return res
          .status(400)
          .json({ error: "INVALID_CODE_OR_LOGIN_FAILED" });
      }
    }

    const stringSession = String(state.client.session.save());
    const encrypted = encrypt(stringSession);

    const account = await telegramAccountRepository.upsertForUser(
      userId,
      phone,
      encrypted
    );

    await telegramLoginSessionRepository.deleteById(loginSession.id);
    deleteTempClientState(loginSession.mtprotoStateId);

    const masked =
      account.phone.length > 6
        ? account.phone.slice(0, 3) + "•••" + account.phone.slice(-2)
        : "•••";

    return res.json({
      status: "authorized",
      phoneMasked: masked
    });
  } catch (err) {
    console.error("Error in /api/telegram/confirm", err);
    return res.status(500).json({ error: "FAILED_TO_CONFIRM" });
  }
});

router.post("/disconnect", authRequired, async (req, res) => {
  const userId = req.user!.uid;
  await telegramAccountRepository.deactivateForUser(userId);
  return res.json({ status: "disconnected" });
});

router.get("/status", authRequired, async (req, res) => {
  const userId = req.user!.uid;
  const acc = await telegramAccountRepository.findActiveByUserId(userId);
  if (!acc || !acc.isActive) {
    return res.json({ connected: false });
  }
  const masked =
    acc.phone.length > 6
      ? acc.phone.slice(0, 3) + "•••" + acc.phone.slice(-2)
      : "•••";
  return res.json({ connected: true, phoneMasked: masked });
});

router.post("/sendPrompt", authRequired, async (req, res) => {
  const { channelId, prompt } = req.body as {
    channelId?: string;
    prompt?: string;
  };
  if (!channelId || !prompt) {
    return res.status(400).json({ error: "channelId and prompt are required" });
  }

  const userId = req.user!.uid;

  try {
    await sendPromptFromUserToSyntx(userId, prompt);
    return res.json({ status: "sent" });
  } catch (err: any) {
    if (err instanceof TelegramSessionExpiredError) {
      return res
        .status(401)
        .json({ error: "TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN" });
    }
    if (String(err?.message ?? err) === "NO_ACTIVE_TELEGRAM_ACCOUNT") {
      return res.status(400).json({ error: "NO_ACTIVE_TELEGRAM_ACCOUNT" });
    }
    console.error("Error in /api/telegram/sendPrompt", err);
    return res.status(500).json({ error: "FAILED_TO_SEND_PROMPT" });
  }
});

// Эндпоинт для отправки промпта в SyntX с учетом настроек канала
// Поддерживает telegram_global и telegram_user
router.post("/sendPromptToSyntx", authRequired, async (req, res) => {
  const { prompt, channelId } = req.body as { prompt?: string; channelId?: string };
  const userId = req.user!.uid;
  
  Logger.info("sendPromptToSyntx: запрос получен", {
    userId,
    channelId: channelId || "не указан",
    promptLength: prompt?.length || 0,
    hasPrompt: !!prompt
  });
  
  if (!prompt) {
    return res.status(400).json({ error: "prompt is required" });
  }

  try {
    // Если указан channelId, используем функцию, которая учитывает настройки канала
    if (channelId) {
      // Проверяем доступность Firestore
      if (!isFirestoreAvailable() || !db) {
        Logger.error("sendPromptToSyntx: Firestore недоступен", { userId, channelId });
        return res.status(503).json({
          error: "FIRESTORE_UNAVAILABLE",
          message: "База данных недоступна. Попробуйте позже."
        });
      }
      
      const channelRef = db
        .collection("users")
        .doc(userId)
        .collection("channels")
        .doc(channelId);
      
      const channelSnap = await channelRef.get();
      
      if (!channelSnap.exists) {
        Logger.warn("sendPromptToSyntx: канал не найден", { userId, channelId });
        return res.status(404).json({
          error: "CHANNEL_NOT_FOUND",
          message: "Канал не найден"
        });
      }
      
      const channelData = channelSnap.data();
      const channel = {
        id: channelId,
        generationTransport: channelData?.generationTransport || "telegram_global",
        telegramSyntaxPeer: channelData?.telegramSyntaxPeer || null
      };
      
      Logger.info("sendPromptToSyntx: настройки канала", {
        userId,
        channelId,
        transport: channel.generationTransport,
        peer: channel.telegramSyntaxPeer || "не указан"
      });
      
      // Используем функцию, которая учитывает настройки канала
      const { sendPromptToSyntax } = await import("../services/sendPromptFromUserToSyntx");
      await sendPromptToSyntax(channel as any, userId, prompt);
      
      Logger.info("sendPromptToSyntx: промпт отправлен успешно", {
        userId,
        channelId,
        transport: channel.generationTransport
      });
      
      return res.json({ status: "sent" });
    } else {
      // Если channelId не указан, используем глобальную сессию (для обратной совместимости)
      Logger.info("sendPromptToSyntx: использование глобальной сессии (channelId не указан)", { userId });
      
      // Проверяем наличие SYNX_CHAT_ID перед выполнением
      if (!process.env.SYNX_CHAT_ID) {
        Logger.error("SYNX_CHAT_ID is not configured");
        return res.status(500).json({
          error: "SYNX_CHAT_ID_NOT_CONFIGURED",
          message: "SYNX_CHAT_ID не настроен на сервере. Добавьте переменную окружения в Cloud Run."
        });
      }
      
      await sendPromptFromUserToSyntx("", prompt);
      return res.json({ status: "sent" });
    }
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    
    Logger.error("sendPromptToSyntx: ошибка", {
      userId,
      channelId,
      error: errorMessage,
      errorType: err?.constructor?.name
    });
    
    // Ошибки Telegram сессии возвращаем как 400/403, а не 401
    // 401 зарезервирован для ошибок авторизации приложения
    if (err instanceof TelegramSessionExpiredError) {
      return res
        .status(403)
        .json({ 
          error: "TELEGRAM_SESSION_EXPIRED_NEED_RELOGIN",
          message: "Сессия Telegram истекла. Отвяжите Telegram в настройках и привяжите снова."
        });
    }
    
    if (errorMessage === "TELEGRAM_SESSION_NOT_INITIALIZED") {
      return res.status(400).json({
        error: "TELEGRAM_SESSION_NOT_INITIALIZED",
        message: "Telegram сессия не инициализирована. Обратитесь к администратору."
      });
    }
    
    if (errorMessage === "TELEGRAM_USER_NOT_CONNECTED") {
      return res.status(400).json({
        error: "TELEGRAM_USER_NOT_CONNECTED",
        message: "Telegram не привязан. Привяжите Telegram в настройках аккаунта."
      });
    }
    
    if (errorMessage.includes("SYNX_CHAT_ID is not configured")) {
      return res.status(500).json({
        error: "SYNX_CHAT_ID_NOT_CONFIGURED",
        message: "SYNX_CHAT_ID не настроен на сервере. Добавьте переменную окружения в Cloud Run."
      });
    }
    
    Logger.error("Error in /api/telegram/sendPromptToSyntx", err);
    return res.status(500).json({ 
      error: "FAILED_TO_SEND_PROMPT",
      message: errorMessage || "Ошибка при отправке промпта"
    });
  }
});

// Забрать последнее видео из SyntX и сохранить в Google Drive
// Поддерживает два режима:
// 1. Старый: без параметра url - скачивает из Telegram и загружает в Google Drive
// 2. Новый: с параметром url - скачивает по URL и сохраняет в локальное storage
router.post("/fetchLatestVideoToDrive", authRequired, async (req, res) => {
  const { channelId, url } = req.body as { channelId?: string; url?: string };

  if (!channelId) {
    return res.status(400).json({ error: "channelId is required" });
  }

  const userId = req.user!.uid;
  Logger.info("fetchLatestVideoToDrive: start", { userId, channelId, hasUrl: !!url });

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    Logger.error("Firestore is not available in /api/telegram/fetchLatestVideoToDrive");
    const firebaseError = getFirebaseError();
    return res.status(503).json({
      error: "FIRESTORE_NOT_AVAILABLE",
      message:
        "Firebase Admin не настроен. Добавьте в backend/.env один из вариантов:\n" +
        "1. FIREBASE_SERVICE_ACCOUNT='{\"type\":\"service_account\",...}' (полный JSON)\n" +
        "2. FIREBASE_PROJECT_ID=..., FIREBASE_CLIENT_EMAIL=..., FIREBASE_PRIVATE_KEY=\"...\" (отдельные переменные)",
      ...(firebaseError && process.env.NODE_ENV !== "production" && {
        details: firebaseError.message
      })
    });
  }

  try {
    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return res.status(404).json({ error: "CHANNEL_NOT_FOUND" });
    }

    const channelData = channelSnap.data() as {
      name?: string;
      googleDriveFolderId?: string;
    };

    // НОВАЯ ЛОГИКА: Если передан URL, скачиваем по URL и сохраняем в storage
    if (url && typeof url === "string" && url.trim().length > 0) {
      Logger.info("fetchLatestVideoToDrive: URL mode", { userId, channelId, url });

      try {
        // Получаем email пользователя
        let userEmail = `${userId}@unknown.local`;
        try {
          const { getAdmin } = await import("../services/firebaseAdmin");
          const admin = getAdmin();
          if (admin) {
            const userRecord = await admin.auth().getUser(userId);
            userEmail = userRecord.email || userEmail;
          }
        } catch (authError: any) {
          Logger.warn("Failed to get user email, using fallback", {
            userId,
            error: authError?.message
          });
        }

        // Скачиваем видео по URL
        const downloadResult = await downloadFromUrl(url.trim());

        if (!downloadResult.success || !downloadResult.filePath) {
          Logger.error("fetchLatestVideoToDrive: URL download failed", {
            userId,
            channelId,
            url,
            error: downloadResult.error
          });
          return res.status(500).json({
            error: "URL_DOWNLOAD_FAILED",
            message: downloadResult.error || "Не удалось скачать видео по URL"
          });
        }

        Logger.info("fetchLatestVideoToDrive: URL download success", {
          userId,
          channelId,
          url,
          filePath: downloadResult.filePath,
          bytes: downloadResult.bytes,
          finalUrl: downloadResult.finalUrl
        });

        // Получаем пути к хранилищу
        const channelName = channelData.name || `channel_${channelId}`;
        const paths = getUserChannelStoragePaths({
          userId,
          userEmail,
          channelId,
          channelName
        });

        // Создаём директории
        await ensureUserChannelDirectories(paths);

        // Генерируем имя файла
        const fileName = generateVideoFileName({
          title: channelName,
          channelName,
          createdAt: new Date()
        });

        // Очищаем имя файла
        const safeFileName = fileName
          .replace(/[<>:"/\\|?*]/g, "_")
          .replace(/\s+/g, "_")
          .replace(/_{2,}/g, "_")
          .trim();

        // Читаем скачанный файл
        const fileBuffer = await fs.readFile(downloadResult.filePath);

        // Сохраняем в storage
        const storagePath = path.join(paths.inputDir, safeFileName);
        await fs.writeFile(storagePath, fileBuffer);

        Logger.info("fetchLatestVideoToDrive: file saved to storage", {
          userId,
          channelId,
          storagePath,
          fileName: safeFileName,
          bytes: fileBuffer.length
        });

        // Удаляем временный файл
        try {
          await fs.unlink(downloadResult.filePath);
        } catch (unlinkError) {
          Logger.warn("Failed to delete temp file", {
            filePath: downloadResult.filePath,
            error: unlinkError
          });
        }

        // Сохраняем информацию о видео в Firestore
        await channelRef.collection("generatedVideos").add({
          localFilePath: storagePath,
          localFilename: safeFileName,
          source: "url",
          sourceUrl: downloadResult.finalUrl || url,
          createdAt: new Date(),
          fileSize: fileBuffer.length
        });

        // Возвращаем ответ в том же формате, что и раньше (для совместимости)
        return res.json({
          status: "ok",
          localFilePath: storagePath,
          fileName: safeFileName,
          fileSize: fileBuffer.length,
          source: "url",
          sourceUrl: downloadResult.finalUrl || url
        });
      } catch (urlError: any) {
        Logger.error("fetchLatestVideoToDrive: URL mode error", {
          userId,
          channelId,
          url,
          error: urlError.message,
          stack: urlError.stack
        });
        return res.status(500).json({
          error: "URL_DOWNLOAD_ERROR",
          message: `Ошибка при скачивании видео по URL: ${urlError.message}`
        });
      }
    }

    // СТАРАЯ ЛОГИКА: Скачивание из Telegram и загрузка в Google Drive
    Logger.info("fetchLatestVideoToDrive: Telegram mode", { userId, channelId });

    // Проверяем Telegram-сессию
    const stringSession = loadSessionString();
    if (!stringSession) {
      return res.status(503).json({
        error: "TELEGRAM_SESSION_NOT_INITIALIZED",
        message:
          "Telegram-сеанс не настроен. Сначала подключите SyntX на backend (npm run dev:login)."
      });
    }

    const SYNX_CHAT_ID = process.env.SYNX_CHAT_ID;
    if (!SYNX_CHAT_ID) {
      return res
        .status(500)
        .json({ error: "SYNX_CHAT_ID is not configured on the server" });
    }

    // Определяем папку: сначала из канала (с trim), потом из .env (с trim)
    const channelFolderId = channelData.googleDriveFolderId?.trim() || undefined;
    const defaultParent = process.env.GOOGLE_DRIVE_DEFAULT_PARENT?.trim() || undefined;

    // Проверка будет выполнена в uploadVideoToDrive, но для ясности логируем здесь
    Logger.info("Determining Google Drive folder", {
      channelFolderId: channelFolderId || "not set",
      defaultParent: defaultParent || "not set",
      willUse: channelFolderId || defaultParent || "none"
    });

    // Создаем Telegram-клиент
    const client = await createTelegramClientFromStringSession(stringSession);

    try {
      // TODO: Улучшенный поиск видео - получаем последние сообщения и ищем самое свежее видео
      Logger.info("Fetching latest messages from SyntX chat for video search", {
        chatId: SYNX_CHAT_ID,
        limit: 50
      });
      
      const messages = (await client.getMessages(SYNX_CHAT_ID, {
        limit: 50
      })) as Api.Message[];

      Logger.info(`Received ${messages.length} messages from SyntX chat`);

      // Фильтруем сообщения с видео и сортируем по дате (самое свежее первым)
      const videoMessages = messages
        .filter((msg) => {
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
          // В Telegram API дата может быть в разных форматах
          let dateA = 0;
          let dateB = 0;
          
          try {
            const msgA = a as any;
            const msgB = b as any;
            
            // Пробуем разные способы получить дату
            if (msgA.date) {
              dateA = msgA.date instanceof Date 
                ? msgA.date.getTime() 
                : typeof msgA.date === 'number' 
                  ? msgA.date * 1000 // Unix timestamp в секундах
                  : new Date(msgA.date).getTime();
            } else if (msgA.id) {
              // Если даты нет, используем ID как fallback (обычно ID больше = новее)
              dateA = msgA.id;
            }
            
            if (msgB.date) {
              dateB = msgB.date instanceof Date 
                ? msgB.date.getTime() 
                : typeof msgB.date === 'number' 
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
        Logger.warn("No video messages found in SyntX chat", {
          totalMessages: messages.length,
          chatId: SYNX_CHAT_ID
        });
        return res.status(404).json({
          error: "NO_VIDEO_FOUND",
          message:
            "Видео ещё не готово в чате SyntX. Подождите окончания генерации и попробуйте ещё раз."
        });
      }

      // Берём самое последнее видео
      const videoMessage = videoMessages[0];
      
      Logger.info("Video message found, preparing to download", {
        messageId: videoMessage.id,
        hasVideo: "video" in videoMessage,
        hasDocument: "document" in videoMessage,
        totalVideoMessages: videoMessages.length
      });

      // TODO: Улучшенное скачивание с проверкой размера и прогрессом
      Logger.info("Starting video download from Telegram", {
        messageId: videoMessage.id
      });

      const downloadStartTime = Date.now();
      let fileBuffer: Buffer | undefined;

      try {
        fileBuffer = (await client.downloadMedia(videoMessage, {
          // Опции для скачивания
        })) as Buffer | undefined;
      } catch (downloadError: any) {
        Logger.error("Error during Telegram media download", {
          error: String(downloadError?.message ?? downloadError),
          messageId: videoMessage.id
        });
        throw new Error(`TELEGRAM_DOWNLOAD_ERROR: ${downloadError?.message ?? "Failed to download video"}`);
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        Logger.error("Downloaded file buffer is empty or null", {
          messageId: videoMessage.id,
          bufferLength: fileBuffer?.length ?? 0
        });
        return res.status(500).json({
          error: "TELEGRAM_DOWNLOAD_FAILED",
          message: "Не удалось скачать видео из SyntX. Файл пустой или повреждён."
        });
      }

      // TODO: Проверка размера файла (максимум 100MB для безопасности)
      const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
      if (fileBuffer.length > MAX_FILE_SIZE) {
        Logger.error("Downloaded file is too large", {
          messageId: videoMessage.id,
          fileSizeBytes: fileBuffer.length,
          maxSizeBytes: MAX_FILE_SIZE
        });
        return res.status(413).json({
          error: "FILE_TOO_LARGE",
          message: `Файл слишком большой (${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB). Максимальный размер: 100 MB.`
        });
      }

      const downloadDuration = Date.now() - downloadStartTime;
      const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
      
      Logger.info("Video downloaded successfully from Telegram", {
        messageId: videoMessage.id,
        fileSizeBytes: fileBuffer.length,
        fileSizeMB,
        downloadDurationMs: downloadDuration,
        downloadSpeedMBps: ((fileBuffer.length / (1024 * 1024)) / (downloadDuration / 1000)).toFixed(2)
      });

      const mimeType = "video/mp4";
      const safeName =
        channelData.name?.replace(/[^\w\d\-]+/g, "_").slice(0, 50) ||
        `channel_${channelId}`;
      const fileName = `${safeName}_${Date.now()}.mp4`;

      // Папка будет определена в uploadVideoToDrive (channelFolderId || defaultParent)
      Logger.info("Preparing to upload video to Google Drive", {
        channelId,
        channelFolderId: channelFolderId || "not set",
        defaultParent: defaultParent || "not set",
        fileName
      });

      const driveResult = await uploadVideoToDrive(
        fileBuffer,
        mimeType,
        fileName,
        channelFolderId
      );

      // Сохраняем информацию о видео в подколлекции канала
      await channelRef.collection("generatedVideos").add({
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink || null,
        driveWebContentLink: driveResult.webContentLink || null,
        createdAt: new Date(),
        source: "syntx"
      });

      Logger.info("Video successfully saved to Google Drive", {
        fileId: driveResult.fileId
      });

      return res.json({
        status: "ok",
        driveFileId: driveResult.fileId,
        webViewLink: driveResult.webViewLink,
        webContentLink: driveResult.webContentLink
      });
    } finally {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    const errorStack = err?.stack;
    const errorCode = err?.code;
    const errorClassName = err?.className;
    const errorErrorCode = err?.error_code;
    const errorErrorMessage = err?.error_message;
    const errorType = err?.errorType;
    const folderId = err?.folderId;
    const userEmail = err?.userEmail;
    
    // Обработка ошибки требования переавторизации
    if (
      errorType === "GOOGLE_DRIVE_REAUTH_REQUIRED" ||
      errorMessage.includes("GOOGLE_DRIVE_REAUTH_REQUIRED")
    ) {
      Logger.error("Error in /api/telegram/fetchLatestVideoToDrive - REAUTH_REQUIRED", {
        userId,
        channelId,
        errorType,
        folderId,
        userEmail,
        error: errorMessage
      });
      
      return res.status(400).json({
        success: false,
        errorType: "GOOGLE_DRIVE_REAUTH_REQUIRED",
        message: errorMessage || "Необходимо заново подключить Google Drive для обновления прав доступа.",
        folderId: folderId || undefined,
        userEmail: userEmail || undefined
      });
    }
    
    // Обработка ошибок доступа к Google Drive папке
    if (
      errorType === "FOLDER_ACCESS" ||
      errorType === "FOLDER_NOT_FOUND" ||
      errorType === "NOT_A_FOLDER" ||
      errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND") ||
      errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED") ||
      errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")
    ) {
      Logger.error("Error in /api/telegram/fetchLatestVideoToDrive - FOLDER_ACCESS_ERROR", {
        userId,
        channelId,
        errorType,
        folderId,
        userEmail,
        error: errorMessage
      });
      
      return res.status(400).json({
        success: false,
        errorType: errorType || "FOLDER_ACCESS",
        message: errorMessage,
        folderId: folderId || undefined,
        userEmail: userEmail || undefined
      });
    }
    
    Logger.error("Error in /api/telegram/fetchLatestVideoToDrive - ДЕТАЛЬНАЯ ИНФОРМАЦИЯ", {
      error: errorMessage,
      errorCode,
      errorClassName,
      errorErrorCode,
      errorErrorMessage,
      stack: errorStack,
      userId,
      channelId,
      fullError: {
        message: errorMessage,
        code: errorCode,
        className: errorClassName,
        error_code: errorErrorCode,
        error_message: errorErrorMessage,
        name: err?.name,
        constructor: err?.constructor?.name
      }
    });

    // ТОЧНАЯ проверка на TELEGRAM_SESSION_INVALID (только если это реальная ошибка сессии)
    if (errorMessage.includes("TELEGRAM_SESSION_INVALID:")) {
      Logger.error("Telegram session invalid in fetchLatestVideoToDrive - РЕАЛЬНАЯ ОШИБКА СЕССИИ", {
        userId,
        channelId,
        error: errorMessage
      });
      return res.status(400).json({
        error: "TELEGRAM_SESSION_INVALID",
        code: "TELEGRAM_SESSION_INVALID",
        message: "Сессия Telegram недействительна (AUTH_KEY_UNREGISTERED). Отвяжите и заново привяжите Telegram в настройках аккаунта."
      });
    }

    // Специфичные ошибки
    if (
      errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED") ||
      errorMessage.includes("Не указана папка для загрузки")
    ) {
      return res.status(400).json({
        error: "NO_DRIVE_FOLDER_CONFIGURED",
        message:
          "Не указана папка для загрузки. Укажите Google Drive Folder ID в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_CREDENTIALS_NOT_CONFIGURED")) {
      return res.status(503).json({
        error: "GOOGLE_DRIVE_NOT_CONFIGURED",
        message:
          "Google Drive не настроен. Добавьте GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_AUTH_FAILED")) {
      return res.status(503).json({
        error: "GOOGLE_DRIVE_AUTH_FAILED",
        message:
          "Ошибка аутентификации Google Drive. Проверьте правильность GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND")) {
      // Извлекаем детали из сообщения об ошибке
      const detailsMatch = errorMessage.match(/GOOGLE_DRIVE_FOLDER_NOT_FOUND: (.+)/);
      const details = detailsMatch ? detailsMatch[1] : "Папка не найдена";
      
      return res.status(400).json({
        error: "GOOGLE_DRIVE_FOLDER_NOT_FOUND",
        message: details
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED")) {
      // Извлекаем детальное сообщение из ошибки (там уже есть email Service Account)
      const detailsMatch = errorMessage.match(/GOOGLE_DRIVE_PERMISSION_DENIED: (.+)/);
      const details = detailsMatch ? detailsMatch[1] : "Нет доступа к папке Google Drive";
      
      return res.status(403).json({
        error: "GOOGLE_DRIVE_PERMISSION_DENIED",
        message: details
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")) {
      return res.status(400).json({
        error: "GOOGLE_DRIVE_NOT_A_FOLDER",
        message: "Указанный ID не является папкой Google Drive. Проверьте правильность ID."
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_QUOTA_EXCEEDED")) {
      return res.status(429).json({
        error: "GOOGLE_DRIVE_QUOTA_EXCEEDED",
        message:
          "Превышена квота Google Drive API. Попробуйте позже."
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_FILE_TOO_LARGE")) {
      return res.status(413).json({
        error: "GOOGLE_DRIVE_FILE_TOO_LARGE",
        message:
          "Файл слишком большой для загрузки в Google Drive."
      });
    }

    if (errorMessage.includes("TELEGRAM_DOWNLOAD_ERROR")) {
      return res.status(500).json({
        error: "TELEGRAM_DOWNLOAD_FAILED",
        message:
          "Ошибка при скачивании видео из Telegram. Проверьте подключение и попробуйте позже."
      });
    }

    if (errorMessage.includes("FILE_TOO_LARGE")) {
      return res.status(413).json({
        error: "FILE_TOO_LARGE",
        message:
          "Файл слишком большой для загрузки. Максимальный размер: 100 MB."
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_UPLOAD_FAILED")) {
      // Извлекаем детали ошибки из сообщения
      const details = errorMessage.replace("GOOGLE_DRIVE_UPLOAD_FAILED: ", "");
      return res.status(500).json({
        error: "GOOGLE_DRIVE_UPLOAD_FAILED",
        message:
          `Ошибка при сохранении видео в Google Drive: ${details}. Проверьте настройки и попробуйте позже.`
      });
    }

    if (errorMessage.includes("FIRESTORE") || errorMessage.includes("Firebase")) {
      return res.status(503).json({
        error: "FIRESTORE_ERROR",
        message:
          "Ошибка доступа к базе данных. Проверьте настройки Firebase Admin."
      });
    }

    // Общая ошибка с деталями для разработки (в продакшене можно скрыть)
    return res.status(500).json({
      error: "FETCH_VIDEO_TO_DRIVE_FAILED",
      message:
        "Ошибка сервера при загрузке видео из SyntX в Google Drive. Попробуйте позже.",
      // В разработке показываем детали ошибки
      ...(process.env.NODE_ENV !== "production" && { details: errorMessage })
    });
  }
});

// Новый эндпоинт: скачать видео из Telegram во временную папку и загрузить в Google Drive
// Теперь использует общий сервис downloadAndUploadVideoToDrive
router.post("/fetchAndSaveToServer", authRequired, async (req, res) => {
  // Диагностическое логирование входа в handler
  const requestId = (req as any).requestId || "unknown";
  
  try {
    // Детальное логирование входящих данных (с маскированием токенов)
    const bodyForLog = req.body ? { ...req.body } : {};
    const urlForLog = bodyForLog.url ? String(bodyForLog.url).substring(0, 500).replace(/[?&](token|key|auth|signature|sig)=[^&]*/gi, "***") : undefined;
    if (urlForLog) {
      bodyForLog.url = urlForLog;
    }

    Logger.info("fetchAndSaveToServer: REQUEST RECEIVED", {
      requestId,
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      hasAuthHeader: !!req.headers.authorization,
      authHeaderPrefix: req.headers.authorization?.substring(0, 20) || "none",
      bodyKeys: Object.keys(req.body || {}),
      body: bodyForLog,
      urlPreview: urlForLog,
      urlLength: req.body?.url ? String(req.body.url).length : 0,
      contentType: req.headers["content-type"],
      host: req.headers.host,
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "x-real-ip": req.headers["x-real-ip"]
    });

    // Валидация body
    if (!req.body || typeof req.body !== "object") {
      Logger.warn("fetchAndSaveToServer: invalid body", { 
        requestId,
        body: req.body,
        bodyType: typeof req.body
      });
      return res.status(400).json({
        status: "error",
        error: "INVALID_BODY",
        message: "Request body must be a valid JSON object",
        requestId
      });
    }

    const {
      channelId,
      googleDriveFolderId,
      telegramMessageId,
      videoTitle,
      url
    } = req.body as {
      channelId?: string;
      googleDriveFolderId?: string;
      telegramMessageId?: number;
      videoTitle?: string;
      url?: string;
    };

    // Валидация обязательных полей
    const missingFields: string[] = [];
    if (!channelId || typeof channelId !== "string" || channelId.trim() === "") {
      missingFields.push("channelId");
    }

    if (missingFields.length > 0) {
      Logger.warn("fetchAndSaveToServer: missing required fields", { 
        requestId,
        missingFields,
        body: req.body
      });
      return res.status(400).json({
        status: "error",
        error: "MISSING_REQUIRED_FIELDS",
        message: `Missing required fields: ${missingFields.join(", ")}`,
        missingFields,
        requestId
      });
    }

    const userId = req.user!.uid;
    Logger.info("fetchAndSaveToServer: start", {
      requestId,
      userId,
      channelId,
      telegramMessageId,
      videoTitle: videoTitle || "not provided",
      hasUrl: !!url
    });

    // Проверяем доступность Firestore
    if (!isFirestoreAvailable() || !db) {
      Logger.error("Firestore is not available in /api/telegram/fetchAndSaveToServer", { requestId });
      const firebaseError = getFirebaseError();
      return res.status(503).json({
        status: "error",
        error: "FIRESTORE_NOT_AVAILABLE",
        message:
          "Firebase Admin не настроен. Добавьте в backend/.env один из вариантов:\n" +
          "1. FIREBASE_SERVICE_ACCOUNT='{\"type\":\"service_account\",...}' (полный JSON)\n" +
          "2. FIREBASE_PROJECT_ID=..., FIREBASE_CLIENT_EMAIL=..., FIREBASE_PRIVATE_KEY=\"...\" (отдельные переменные)",
        requestId,
        ...(firebaseError && process.env.NODE_ENV !== "production" && {
          details: firebaseError.message
        })
      });
    }
    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    // channelId уже проверен выше и гарантированно не undefined
    const firestorePath = `users/${userId}/channels/${channelId!}`;
    
    Logger.info("fetchAndSaveToServer: checking channel in Firestore", {
      requestId,
      userId,
      channelId: channelId!,
      firestorePath
    });

    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId!);
    const channelSnap = await channelRef.get();

    Logger.info("fetchAndSaveToServer: channel check result", {
      requestId,
      userId,
      channelId: channelId!,
      firestorePath,
      exists: channelSnap.exists,
      hasData: channelSnap.exists ? !!channelSnap.data() : false
    });

    if (!channelSnap.exists) {
      Logger.warn("fetchAndSaveToServer: CHANNEL_NOT_FOUND", {
        requestId,
        userId,
        channelId: channelId!,
        firestorePath,
        searchedPath: firestorePath
      });
      
      return res.status(404).json({
        status: "error",
        message: "CHANNEL_NOT_FOUND",
        // Диагностическая информация (только если DEBUG_DIAG включен)
        ...(process.env.DEBUG_DIAG === "true" && {
          debug: {
            userId,
            channelId: channelId!,
            firestorePath,
            searchedPath: firestorePath
          }
        })
      });
    }

    const channelData = channelSnap.data() as {
      name?: string;
      googleDriveFolderId?: string;
    };

    // НОВАЯ ЛОГИКА: Если передан URL, скачиваем по URL и сохраняем в storage
    if (url && typeof url === "string" && url.trim().length > 0) {
        Logger.info("fetchAndSaveToServer: URL mode", { userId, channelId, url });

      try {
        // Получаем email пользователя
        let userEmail = `${userId}@unknown.local`;
        try {
          const { getAdmin } = await import("../services/firebaseAdmin");
          const admin = getAdmin();
          if (admin) {
            const userRecord = await admin.auth().getUser(userId);
            userEmail = userRecord.email || userEmail;
          }
        } catch (authError: any) {
          Logger.warn("Failed to get user email, using fallback", {
            userId,
            error: authError?.message
          });
        }

        // Скачиваем видео по URL
        const downloadResult = await downloadFromUrl(url.trim());

        if (!downloadResult.success || !downloadResult.filePath) {
          Logger.error("fetchAndSaveToServer: URL download failed", {
            userId,
            channelId,
            url,
            error: downloadResult.error
          });
          return res.status(500).json({
            status: "error",
            error: "URL_DOWNLOAD_FAILED",
            message: downloadResult.error || "Не удалось скачать видео по URL"
          });
        }

        Logger.info("fetchAndSaveToServer: URL download success", {
          userId,
          channelId,
          url,
          filePath: downloadResult.filePath,
          bytes: downloadResult.bytes,
          finalUrl: downloadResult.finalUrl
        });

        // Используем новый StorageService
        const storage = getStorageService();
        const { generateUniqueVideoFileName, makeSafeBaseName } = await import("../utils/fileUtils");
        const channelName = channelData.name || `channel_${channelId}`;

        // Получаем userFolderKey и channelFolderKey
        const userFolderKey = await storage.resolveUserFolderKey(userId);
        const channelFolderKey = await storage.resolveChannelFolderKey(userId, channelId!);
        
        Logger.info("fetchAndSaveToServer: folder keys resolved", {
          userId,
          userFolderKey,
          channelId,
          channelFolderKey,
          channelName: channelData.name || "not set",
          videoTitle: videoTitle || "not provided"
        });

        // Генерируем уникальное имя файла
        // ВАЖНО: Для автоматизации используем строго video_<shortId>.mp4
        // fetchAndSaveToServer используется в автоматическом режиме, поэтому используем единый формат
        const inboxDir = storage.resolveInboxDir(userFolderKey, channelFolderKey);
        const videoId = generateVideoId(); // Для метаданных и БД
        
        // Используем единый формат для автоматизации
        const { generateVideoFilename } = await import("../utils/videoFilename");
        const fullFileName = await generateVideoFilename({
          source: "telegramRoutes_fetchAndSaveToServer",
          channelId: channelId!,
          userId,
          targetDir: inboxDir
        });
        // Убираем расширение .mp4, так как resolveInboxPath добавит его
        const fileBaseName = fullFileName.replace(/\.mp4$/i, '');
        const safeBaseName = makeSafeBaseName(videoTitle || "video");

        Logger.info("fetchAndSaveToServer: generated file name (automation format)", {
          videoTitle: videoTitle || "not provided",
          safeBaseName,
          fileBaseName,
          fullFileName,
          videoId,
          inboxDir,
          rule: "automation_requires_video_shortid_format"
        });

        // Получаем пути для inbox
        const inboxPath = storage.resolveInboxPath(userFolderKey, channelFolderKey, fileBaseName);
        const inboxMetaPath = storage.resolveInboxMetaPath(userFolderKey, channelFolderKey, fileBaseName);

        // Создаём директории
        await storage.ensureUserChannelDirs(userFolderKey, channelFolderKey);

        // Читаем скачанный файл
        const fileBuffer = await fs.readFile(downloadResult.filePath);

        // Сохраняем видео атомарно
        const saveResult = await storage.saveBufferToFile(fileBuffer, inboxPath);

        // Сохраняем метаданные
        const meta = {
          videoId,
          userId,
          channelId: channelId!,
          originalTitle: videoTitle || null,
          safeFileBase: safeBaseName,
          finalFileBase: fileBaseName,
          mp4File: `${fileBaseName}.mp4`,
          jsonFile: `${fileBaseName}.json`,
          sourceUrl: downloadResult.finalUrl || url,
          title: videoTitle || channelName,
          provider: "syntx",
          createdAt: new Date().toISOString(),
          fileSize: saveResult.bytes,
          contentType: "video/mp4"
        };
        await storage.writeJson(inboxMetaPath, meta);

        Logger.info("fetchAndSaveToServer: file saved to storage", {
          userId,
          userFolderKey,
          channelId,
          channelFolderKey,
          videoId,
          fileBaseName,
          originalTitle: videoTitle || "not provided",
          storagePath: inboxPath,
          resolvedPath: saveResult.resolvedPath || path.resolve(inboxPath),
          bytes: saveResult.bytes
        });

        // Удаляем временный файл
        try {
          await fs.unlink(downloadResult.filePath);
        } catch (unlinkError) {
          Logger.warn("Failed to delete temp file", {
            filePath: downloadResult.filePath,
            error: unlinkError
          });
        }

        // Сохраняем информацию о видео в Firestore
        await channelRef.collection("generatedVideos").add({
          videoId,
          localFilePath: inboxPath,
          localFilename: `${fileBaseName}.mp4`,
          fileName: `${fileBaseName}.mp4`,
          fileBaseName,
          originalTitle: videoTitle || null,
          source: "url",
          sourceUrl: downloadResult.finalUrl || url,
          createdAt: new Date(),
          fileSize: saveResult.bytes
        });

        // Возвращаем ответ в формате, который ожидает фронтенд
        return res.json({
          status: "ok",
          success: true,
          channelId,
          channelName: channelData.name || "unknown",
          videoId,
          storage: {
            filePath: inboxPath,
            resolvedPath: path.resolve(inboxPath),
            fileName: `${fileBaseName}.mp4`,
            bytes: saveResult.bytes
          },
          inputPath: inboxPath,
          filename: `${fileBaseName}.mp4`,
          fileName: `${fileBaseName}.mp4`,
          fileBaseName,
          originalTitle: videoTitle || null,
          message: "Видео успешно сохранено на сервер"
        });
      } catch (urlError: any) {
        Logger.error("fetchAndSaveToServer: URL mode error", {
          userId,
          channelId,
          url,
          error: urlError.message,
          stack: urlError.stack
        });
        return res.status(500).json({
          status: "error",
          error: "URL_DOWNLOAD_ERROR",
          message: `Ошибка при скачивании видео по URL: ${urlError.message}`
        });
      }
    }

    // СТАРАЯ ЛОГИКА: Скачивание из Telegram (если url не передан)
    Logger.info("fetchAndSaveToServer: Telegram mode", { 
      requestId,
      userId, 
      channelId,
      telegramMessageId: telegramMessageId || "not specified (will search latest)"
    });

    // Используем новую функцию для сохранения в локальное хранилище
    const result = await downloadAndSaveToLocal({
      channelId: channelId!,
      userId,
      telegramMessageId,
      videoTitle,
      prompt: undefined
    });

    if (result.success) {
      return res.json({
        status: "ok",
        success: true,
        channelId,
        channelName: result.channelName || "unknown",
        storage: result.storage || {
          userEmail: "",
          userDir: "",
          inputDir: result.inputPath || "",
          archiveDir: "",
          filePath: result.inputPath || "",
          fileName: result.filename || ""
        },
        inputPath: result.inputPath,
        filename: result.filename,
        channelSlug: result.channelSlug || "",
        fileName: result.filename,
        message: "Видео успешно сохранено на сервер"
      });
    } else {
      // Обработка ошибок из сервиса
      const errorMessage = result.error || "Unknown error";

      Logger.warn("fetchAndSaveToServer: error from downloadAndSaveToLocal", {
        requestId,
        userId,
        channelId,
        error: errorMessage,
        resultKeys: Object.keys(result)
      });

      // Обработка ошибки "Канал не найден" из downloadAndSaveToLocal
      if (errorMessage.includes("Канал не найден") || errorMessage.includes("CHANNEL_NOT_FOUND")) {
        Logger.error("fetchAndSaveToServer: CHANNEL_NOT_FOUND from downloadAndSaveToLocal", {
          requestId,
          userId,
          channelId,
          error: errorMessage,
          firestorePath: `users/${userId}/channels/${channelId}`
        });
        return res.status(404).json({
          status: "error",
          message: "CHANNEL_NOT_FOUND",
          ...(process.env.DEBUG_DIAG === "true" && {
            debug: {
              userId,
              channelId,
              firestorePath: `users/${userId}/channels/${channelId}`,
              source: "downloadAndSaveToLocal"
            }
          })
        });
      }

      // ТОЧНАЯ проверка на TELEGRAM_SESSION_INVALID (только если это реальная ошибка сессии)
      if (errorMessage.includes("TELEGRAM_SESSION_INVALID")) {
        Logger.error("Telegram session invalid in fetchAndSaveToServer - РЕАЛЬНАЯ ОШИБКА СЕССИИ", {
          userId,
          channelId,
          error: errorMessage
        });
        return res.status(400).json({
          status: "error",
          error: "TELEGRAM_SESSION_INVALID",
          code: "TELEGRAM_SESSION_INVALID",
          message: "Сессия Telegram недействительна (AUTH_KEY_UNREGISTERED). Отвяжите и заново привяжите Telegram в настройках аккаунта."
        });
      }

      // Обработка специфичных ошибок
      if (errorMessage.includes("NO_VIDEO_FOUND")) {
        // Используем 200 вместо 404, так как это бизнес-логика, а не "Not Found"
        res.charset = "utf-8";
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(200).json({
          status: "error",
          code: "NO_VIDEO_FOUND",
          error: "NO_VIDEO_FOUND",
          message: "Видео ещё не готово в чате SyntX. Подождите окончания генерации и попробуйте ещё раз."
        });
      }

      // Обработка M3U8_NOT_SUPPORTED
      if (errorMessage.includes("M3U8_NOT_SUPPORTED")) {
        res.charset = "utf-8";
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.status(200).json({
          status: "error",
          code: "M3U8_NOT_SUPPORTED",
          error: "M3U8_NOT_SUPPORTED",
          message: "Найдена ссылка на M3U8 поток. Прямое скачивание M3U8 пока не поддерживается. Используйте другой формат видео."
        });
      }

    if (errorMessage.includes("TELEGRAM_MESSAGE_NOT_FOUND")) {
      return res.status(404).json({
        status: "error",
        message: errorMessage.replace("TELEGRAM_MESSAGE_NOT_FOUND: ", "")
      });
    }

    if (errorMessage.includes("TELEGRAM_DOWNLOAD_TIMEOUT") || errorMessage.includes("TELEGRAM_TIMEOUT")) {
      return res.status(504).json({
        status: "error",
        message: errorMessage
          .replace("TELEGRAM_DOWNLOAD_TIMEOUT: ", "")
          .replace("TELEGRAM_TIMEOUT: ", "") ||
          "Превышено время ожидания ответа от Telegram. Проверьте подключение к интернету и попробуйте ещё раз."
      });
    }

    // ТОЧНАЯ проверка на TELEGRAM_SESSION_INVALID (только если это реальная ошибка сессии)
    if (errorMessage.includes("TELEGRAM_SESSION_INVALID:")) {
      Logger.error("Telegram session invalid in fetchAndSaveToServer - РЕАЛЬНАЯ ОШИБКА СЕССИИ", {
        userId,
        channelId,
        error: errorMessage
      });
      return res.status(400).json({
        status: "error",
        error: "TELEGRAM_SESSION_INVALID",
        code: "TELEGRAM_SESSION_INVALID",
        message: "Сессия Telegram недействительна (AUTH_KEY_UNREGISTERED). Отвяжите и заново привяжите Telegram в настройках аккаунта."
      });
    }

    // Обработка ошибок скачивания (все остальные ошибки Telegram)
    if (errorMessage.includes("TELEGRAM_DOWNLOAD_ERROR") || errorMessage.includes("TELEGRAM_DOWNLOAD_FAILED")) {
      Logger.warn("Telegram download failed (not session error) in fetchAndSaveToServer", {
        userId,
        channelId,
        error: errorMessage
      });
      return res.status(500).json({
        status: "error",
        error: "TELEGRAM_DOWNLOAD_FAILED",
        code: "TELEGRAM_DOWNLOAD_FAILED",
        message:
          errorMessage.replace("TELEGRAM_DOWNLOAD_ERROR: ", "").replace("TELEGRAM_DOWNLOAD_FAILED: ", "") ||
          "Не удалось скачать видео из Telegram. Попробуйте ещё раз или проверьте настройки."
      });
    }

      if (errorMessage.includes("FILE_TOO_LARGE")) {
        return res.status(413).json({
          status: "error",
          message: errorMessage.replace("FILE_TOO_LARGE: ", "")
        });
      }

      // Общая ошибка - безопасное преобразование в UTF-8 строку
      const safeErrorMessage = Buffer.isBuffer(errorMessage)
        ? errorMessage.toString("utf-8")
        : String(errorMessage || "Ошибка сервера при обработке видео. Попробуйте позже.");
      
      res.charset = "utf-8";
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      
      return res.status(500).json({
        status: "error",
        error: "SERVER_ERROR",
        code: "SERVER_ERROR",
        message: safeErrorMessage,
        ...(process.env.NODE_ENV !== "production" && { details: safeErrorMessage })
      });
    }
  } catch (err: any) {
    const requestId = (req as any).requestId || "unknown";
    // Безопасное преобразование errorMessage в UTF-8 строку
    const errorMessage = Buffer.isBuffer(err?.message)
      ? err.message.toString("utf-8")
      : String(err?.message ?? err);
    const errorType = err?.errorType;
    const folderId = err?.folderId;
    const userEmail = err?.userEmail;
    const stackTrace = err?.stack || "No stack trace available";
    const caughtUserId = req.user?.uid || "unknown";
    const caughtChannelId = (req.body as any)?.channelId || "unknown";
    
    Logger.error("Error in /api/telegram/fetchAndSaveToServer", {
      requestId,
      error: errorMessage,
      errorType,
      errorName: err?.name,
      errorCode: err?.code,
      stackTrace,
      folderId,
      userEmail,
      userId: caughtUserId,
      channelId: caughtChannelId,
      body: req.body
    });


        // Обработка ошибок доступа к Google Drive папке
        if (
          errorType === "FOLDER_ACCESS" ||
          errorType === "FOLDER_NOT_FOUND" ||
          errorType === "NOT_A_FOLDER" ||
          errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND") ||
          errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED") ||
          errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")
        ) {
          return res.status(400).json({
            success: false,
            errorType: errorType || "FOLDER_ACCESS",
            message: errorMessage,
            folderId: folderId || undefined,
            userEmail: userEmail || undefined
          });
        }
    
    // Обработка ошибок Telegram сессии
    if (errorMessage.includes("TELEGRAM_SESSION_INVALID")) {
      return res.status(400).json({
        error: "TELEGRAM_SESSION_INVALID",
        code: "TELEGRAM_SESSION_INVALID",
        message: "Сессия Telegram недействительна. Отвяжите и заново привяжите Telegram в настройках аккаунта."
      });
    }

    // Безопасное преобразование в UTF-8
    const safeErrorMessage = Buffer.isBuffer(errorMessage)
      ? errorMessage.toString("utf-8")
      : String(errorMessage || "Ошибка сервера при обработке видео. Попробуйте позже.");
    
    res.charset = "utf-8";
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    
    return res.status(500).json({
      success: false,
      error: "UPLOAD_FAILED",
      code: "UPLOAD_FAILED",
      message: safeErrorMessage
    });
  }
});

// ========== ШАГ 4: НОВАЯ АРХИТЕКТУРА - ПРЯМОЙ ИМПОРТ MP4 ПО URL ==========
// POST /api/telegram/importVideo
// Принимает прямую mp4 ссылку (например, https://r2.syntx.ai/veo3/2025/12/22/XXXXX.mp4)
// и сохраняет её в локальное хранилище канала
router.post("/importVideo", authRequired, async (req, res) => {
  const { channelId, videoUrl } = req.body as { channelId?: string; videoUrl?: string };
  const userId = req.user!.uid;
  const requestId = (req as any).requestId || "unknown";

  Logger.info("importVideo: REQUEST RECEIVED", {
    requestId,
    userId,
    channelId,
    hasVideoUrl: !!videoUrl,
    videoUrlPreview: videoUrl ? videoUrl.substring(0, 100).replace(/[?&](token|key|auth|signature|sig)=[^&]*/gi, "***") : undefined
  });

  // Валидация
  if (!channelId || typeof channelId !== "string" || channelId.trim() === "") {
    return res.status(400).json({
      status: "error",
      error: "MISSING_CHANNEL_ID",
      message: "channelId is required"
    });
  }

  if (!videoUrl || typeof videoUrl !== "string" || videoUrl.trim() === "") {
    return res.status(400).json({
      status: "error",
      error: "MISSING_VIDEO_URL",
      message: "videoUrl is required"
    });
  }

  // Проверяем, что это валидный URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(videoUrl.trim());
  } catch (urlError) {
    return res.status(400).json({
      status: "error",
      error: "INVALID_URL",
      message: "videoUrl must be a valid URL"
    });
  }

  // Проверяем доступность Firestore
  if (!isFirestoreAvailable() || !db) {
    Logger.error("Firestore is not available in /api/telegram/importVideo", { requestId });
    return res.status(503).json({
      status: "error",
      error: "FIRESTORE_NOT_AVAILABLE",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    // Проверяем, что пользователь имеет доступ к этому каналу
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      Logger.warn("importVideo: CHANNEL_NOT_FOUND", {
        requestId,
        userId,
        channelId
      });
      return res.status(404).json({
        status: "error",
        error: "CHANNEL_NOT_FOUND",
        message: "Канал не найден"
      });
    }

    const channelData = channelSnap.data() as {
      name?: string;
    };

    Logger.info("importVideo: channel found, starting video download", {
      requestId,
      userId,
      channelId,
      channelName: channelData.name || "unknown",
      videoUrl: parsedUrl.toString().replace(/[?&](token|key|auth|signature|sig)=[^&]*/gi, "***")
    });

    // Получаем email пользователя
    let userEmail = `${userId}@unknown.local`;
    try {
      const { getAdmin } = await import("../services/firebaseAdmin");
      const admin = getAdmin();
      if (admin) {
        const userRecord = await admin.auth().getUser(userId);
        userEmail = userRecord.email || userEmail;
      }
    } catch (authError: any) {
      Logger.warn("Failed to get user email, using fallback", {
        userId,
        error: authError?.message
      });
    }

    // ШАГ 1: HEAD запрос для проверки доступности и Content-Type
    Logger.info("importVideo: Step 1 - HEAD request", {
      requestId,
      videoUrl: parsedUrl.toString().replace(/[?&](token|key|auth|signature|sig)=[^&]*/gi, "***")
    });

    let headResponse: Response;
    try {
      headResponse = await fetch(parsedUrl.toString(), {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "*/*",
          Referer: "https://getvideo.syntxai.net/"
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000) // 10 секунд таймаут
      });
    } catch (headError: any) {
      Logger.error("importVideo: HEAD request failed", {
        requestId,
        error: String(headError?.message ?? headError)
      });
      return res.status(500).json({
        status: "error",
        error: "HEAD_REQUEST_FAILED",
        message: `Не удалось проверить доступность видео: ${headError?.message || "Unknown error"}`
      });
    }

    if (!headResponse.ok) {
      Logger.error("importVideo: HEAD request returned error status", {
        requestId,
        status: headResponse.status,
        statusText: headResponse.statusText
      });
      return res.status(headResponse.status).json({
        status: "error",
        error: "VIDEO_NOT_ACCESSIBLE",
        message: `Видео недоступно: ${headResponse.status} ${headResponse.statusText}`
      });
    }

    const contentType = headResponse.headers.get("content-type") || "";
    const contentLength = headResponse.headers.get("content-length");
    const supportsRange = headResponse.headers.get("accept-ranges") === "bytes";

    Logger.info("importVideo: HEAD request successful", {
      requestId,
      status: headResponse.status,
      contentType,
      contentLength: contentLength || "unknown",
      supportsRange,
      isVideo: contentType.includes("video") || contentType.includes("mp4") || contentType.includes("octet-stream")
    });

    // Проверяем Content-Type
    if (!contentType.includes("video") && !contentType.includes("mp4") && !contentType.includes("octet-stream")) {
      Logger.warn("importVideo: Content-Type is not video/mp4", {
        requestId,
        contentType,
        note: "Продолжаем скачивание, но Content-Type неожиданный"
      });
    }

    // ШАГ 2: Скачиваем видео через stream с поддержкой 206 Partial Content
    Logger.info("importVideo: Step 2 - Downloading video", {
      requestId,
      videoUrl: parsedUrl.toString().replace(/[?&](token|key|auth|signature|sig)=[^&]*/gi, "***"),
      supportsRange
    });

    const downloadResult = await downloadFromUrl(parsedUrl.toString());

    if (!downloadResult.success || !downloadResult.filePath) {
      Logger.error("importVideo: download failed", {
        requestId,
        error: downloadResult.error
      });
      return res.status(500).json({
        status: "error",
        error: "DOWNLOAD_FAILED",
        message: downloadResult.error || "Не удалось скачать видео"
      });
    }

    Logger.info("importVideo: video downloaded successfully", {
      requestId,
      filePath: downloadResult.filePath,
      bytes: downloadResult.bytes,
      finalUrl: downloadResult.finalUrl?.replace(/[?&](token|key|auth|signature|sig)=[^&]*/gi, "***"),
      contentType: downloadResult.contentType
    });

    // ШАГ 3: Сохраняем в локальное хранилище
    const channelName = channelData.name || `channel_${channelId}`;
    const paths = getUserChannelStoragePaths({
      userId,
      userEmail,
      channelId,
      channelName
    });

    await ensureUserChannelDirectories(paths);

    // Генерируем имя файла
    const fileName = generateVideoFileName({
      title: channelName,
      channelName,
      createdAt: new Date()
    });

    const safeFileName = fileName
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_{2,}/g, "_")
      .trim();

    // Читаем скачанный файл
    const fileBuffer = await fs.readFile(downloadResult.filePath);

    // Сохраняем в storage
    const storagePath = path.join(paths.inputDir, safeFileName);
    await fs.writeFile(storagePath, fileBuffer);

    Logger.info("importVideo: file saved to storage", {
      requestId,
      userId,
      channelId,
      storagePath,
      fileName: safeFileName,
      bytes: fileBuffer.length
    });

    // Удаляем временный файл
    try {
      await fs.unlink(downloadResult.filePath);
    } catch (unlinkError) {
      Logger.warn("Failed to delete temp file", {
        filePath: downloadResult.filePath,
        error: unlinkError
      });
    }

    // ШАГ 4: Сохраняем информацию о видео в Firestore
    await channelRef.collection("generatedVideos").add({
      localFilePath: storagePath,
      localFilename: safeFileName,
      source: "url_import",
      sourceUrl: downloadResult.finalUrl || parsedUrl.toString(),
      createdAt: new Date(),
      fileSize: fileBuffer.length,
      contentType: downloadResult.contentType || contentType
    });

    Logger.info("importVideo: SUCCESS - video imported and saved", {
      requestId,
      userId,
      channelId,
      storagePath,
      fileName: safeFileName,
      fileSize: fileBuffer.length,
      sourceUrl: downloadResult.finalUrl?.replace(/[?&](token|key|auth|signature|sig)=[^&]*/gi, "***")
    });

    return res.json({
      status: "ok",
      success: true,
      channelId,
      channelName: channelData.name || "unknown",
      storage: {
        userEmail: paths.userEmail,
        userDir: paths.userDir,
        inputDir: paths.inputDir,
        archiveDir: paths.archiveDir,
        filePath: storagePath,
        fileName: safeFileName
      },
      inputPath: storagePath,
      filename: safeFileName,
      channelSlug: paths.channelSlug,
      fileName: safeFileName,
      fileSize: fileBuffer.length,
      sourceUrl: downloadResult.finalUrl || parsedUrl.toString(),
      message: "Видео успешно импортировано и сохранено на сервер"
    });
  } catch (err: any) {
    const errorMessage = String(err?.message ?? err);
    Logger.error("importVideo: error", {
      requestId,
      userId,
      channelId,
      error: errorMessage,
      stack: err?.stack
    });

    return res.status(500).json({
      status: "error",
      error: "IMPORT_ERROR",
      message: `Ошибка при импорте видео: ${errorMessage}`
    });
  }
});

export default router;


