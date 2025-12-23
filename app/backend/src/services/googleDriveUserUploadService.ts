import { google } from "googleapis";
import { Readable } from "stream";
import { Logger } from "../utils/logger";
import { getValidAccessToken, getIntegrationStatus, SCOPES_VERSION } from "./GoogleDriveOAuthService";
import { findGoogleDriveIntegrationByUserId } from "../repositories/googleDriveIntegrationRepo";

/**
 * Загружает файл в личный Google Drive пользователя
 */
export async function uploadFileToUserDrive(params: {
  userId: string;
  fileBuffer: Buffer;
  mimeType: string;
  fileName: string;
  folderId?: string;
}): Promise<{ fileId: string; webViewLink?: string; webContentLink?: string }> {
  const { userId, fileBuffer, mimeType, fileName, folderId } = params;

  Logger.info("uploadFileToUserDrive: Starting upload", {
    userId,
    fileName,
    mimeType,
    folderId: folderId || "not specified",
    fileSizeBytes: fileBuffer.length
  });

  try {
    // Получаем информацию об интеграции для получения email
    const integration = await findGoogleDriveIntegrationByUserId(userId);
    const userEmail = integration?.email;

    // Получаем валидный access token (обновляет при необходимости)
    const accessToken = await getValidAccessToken(userId);

    // Создаём OAuth2 клиент и настраиваем токен
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Создаём клиент Drive
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Проверяем, какой именно Google-аккаунт используется для запросов
    let actualEmail: string | undefined;
    try {
      const about = await drive.about.get({
        fields: "user(emailAddress,displayName)"
      });
      actualEmail = about.data.user?.emailAddress || undefined;
      
      Logger.info("uploadFileToUserDrive: Google Drive account verified", {
        userId,
        actualEmail: actualEmail || "not available",
        integrationEmail: userEmail || "not available"
      });
    } catch (aboutError: any) {
      Logger.warn("uploadFileToUserDrive: Failed to get account info", {
        userId,
        error: aboutError?.message || String(aboutError)
      });
      // Продолжаем без email, но логируем предупреждение
    }

    // Формируем метаданные файла
    const fileMetadata: any = {
      name: fileName
    };

    if (folderId) {
      // Проверяем доступ к папке перед загрузкой
      try {
        Logger.info("uploadFileToUserDrive: Validating folder access", {
          userId,
          folderId,
          actualEmail: actualEmail || "not available",
          integrationEmail: userEmail || "not available"
        });

        const folderInfo = await drive.files.get({
          fileId: folderId,
          fields: "id, name, mimeType"
        });

        // Проверяем, что это действительно папка
        if (folderInfo.data.mimeType !== "application/vnd.google-apps.folder") {
          const error = new Error(
            `GOOGLE_DRIVE_NOT_A_FOLDER: Указанный ID не является папкой Google Drive.`
          );
          (error as any).errorType = "NOT_A_FOLDER";
          (error as any).folderId = folderId;
          (error as any).userEmail = actualEmail || userEmail;
          throw error;
        }

        fileMetadata.parents = [folderId];
        
        Logger.info("uploadFileToUserDrive: Folder validated successfully", {
          userId,
          folderId,
          folderName: folderInfo.data.name,
          actualEmail: actualEmail || "not available"
        });
      } catch (folderError: any) {
        const errorCode = folderError?.code;
        const errorMessage = String(folderError?.message || "");
        const errorResponse = folderError?.response;
        const errorReason = errorResponse?.data?.error?.errors?.[0]?.reason;

        Logger.error("uploadFileToUserDrive: Folder access validation failed", {
          userId,
          folderId,
          errorCode,
          errorReason,
          errorMessage,
          actualEmail: actualEmail || "not available",
          errorDetails: errorResponse?.data
        });

        // Обработка ошибок Google API
        if (errorCode === 404 || errorReason === "notFound") {
          // Проверяем версию scopes - если старая, требуем переавторизацию
          const integration = await findGoogleDriveIntegrationByUserId(userId);
          
          if (integration && (integration.scopesVersion || 1) < SCOPES_VERSION) {
            // Старая версия scopes - требуется переавторизация
            const error = new Error(
              `GOOGLE_DRIVE_REAUTH_REQUIRED: Необходимо заново подключить Google Drive для обновления прав доступа.`
            );
            (error as any).errorType = "GOOGLE_DRIVE_REAUTH_REQUIRED";
            (error as any).folderId = folderId;
            (error as any).userEmail = actualEmail || userEmail;
            throw error;
          }
          
          // Если версия актуальна, но всё равно 404 - возможно, папка действительно не найдена или нет доступа
          const error = new Error(
            `GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена (ID: ${folderId}). Проверьте правильность ID папки в настройках канала.`
          );
          (error as any).errorType = "FOLDER_ACCESS";
          (error as any).folderId = folderId;
          (error as any).userEmail = actualEmail || userEmail;
          throw error;
        }
        
        if (errorCode === 403 || errorReason === "forbidden" || errorReason === "insufficientFilePermissions" || 
            errorMessage.includes("insufficientFilePermissions") || errorMessage.includes("permission denied")) {
          const emailHint = actualEmail 
            ? ` У текущего Google-аккаунта (${actualEmail}) нет доступа к указанной папке. Откройте доступ к папке для этого email с правами "Редактор".`
            : userEmail
            ? ` Откройте доступ к папке для аккаунта ${userEmail} с правами "Редактор".`
            : " Убедитесь, что у подключённого Google аккаунта есть права 'Редактор' на эту папку.";
          
          const error = new Error(
            `GOOGLE_DRIVE_PERMISSION_DENIED: Нет доступа к папке (ID: ${folderId}).${emailHint}`
          );
          (error as any).errorType = "FOLDER_ACCESS";
          (error as any).folderId = folderId;
          (error as any).userEmail = actualEmail || userEmail;
          throw error;
        }
        
        // Для других ошибок также добавляем структурированную информацию
        const error = new Error(
          `GOOGLE_DRIVE_FOLDER_ERROR: Ошибка при проверке доступа к папке: ${errorMessage}`
        );
        (error as any).errorType = "FOLDER_ERROR";
        (error as any).folderId = folderId;
        (error as any).userEmail = actualEmail || userEmail;
        (error as any).originalError = folderError;
        throw error;
      }
    }

    // Преобразуем Buffer в поток
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null); // Сигнал конца потока

    const uploadStartTime = Date.now();

    // Загружаем файл
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType,
        body: bufferStream
      },
      fields: "id, name, webViewLink, webContentLink, size"
    });

    const file = response.data;
    const uploadDuration = Date.now() - uploadStartTime;

    Logger.info("uploadFileToUserDrive: File uploaded successfully", {
      userId,
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size,
      webViewLink: file.webViewLink,
      folderId: folderId || "root",
      uploadDurationMs: uploadDuration
    });

    return {
      fileId: file.id as string,
      webViewLink: file.webViewLink ?? undefined,
      webContentLink: file.webContentLink ?? undefined
    };
  } catch (error: any) {
    const errorMessage = String(error?.message || error);
    const errorCode = error?.code;

    Logger.error("uploadFileToUserDrive: Upload failed", {
      userId,
      fileName,
      folderId,
      error: errorMessage,
      errorCode
    });

    // Пробрасываем специфичные ошибки дальше
    if (
      errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND") ||
      errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED") ||
      errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER") ||
      errorMessage.includes("Google Drive integration not found") ||
      errorMessage.includes("Refresh token not available")
    ) {
      throw error;
    }

    // Для остальных ошибок оборачиваем в понятное сообщение
    if (errorCode === 403) {
      throw new Error("GOOGLE_DRIVE_PERMISSION_DENIED: Нет доступа к Google Drive. Проверьте права доступа.");
    }
    if (errorCode === 429) {
      throw new Error("GOOGLE_DRIVE_QUOTA_EXCEEDED: Превышена квота Google Drive API. Попробуйте позже.");
    }

    throw new Error(`GOOGLE_DRIVE_UPLOAD_FAILED: Не удалось загрузить файл в Google Drive: ${errorMessage}`);
  }
}

