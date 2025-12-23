import { google } from "googleapis";
import { Readable } from "stream";
import * as fs from "fs";
import { Logger } from "../utils/logger";

/**
 * Создаёт клиент Google Drive API, используя OAuth токен пользователя
 * @param accessToken - OAuth access token пользователя
 * @returns {google.drive_v3.Drive} Клиент Google Drive
 */
function getDriveClientFromOAuth(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  return google.drive({ version: "v3", auth });
}

/**
 * Загружает файл в Google Drive используя OAuth токен пользователя
 * @param params - Параметры загрузки
 * @returns Информация о загруженном файле
 */
export async function uploadFileToDriveWithOAuth(params: {
  filePath: string;
  fileName: string;
  mimeType?: string;
  parentFolderId: string;
  accessToken: string;
}): Promise<{ fileId: string; webViewLink?: string; webContentLink?: string }> {
  const { filePath, fileName, mimeType = "video/mp4", parentFolderId, accessToken } = params;

  // Проверяем, что файл существует
  try {
    await fs.promises.access(filePath);
  } catch {
    throw new Error(`FILE_NOT_FOUND: Файл не найден: ${filePath}`);
  }

  const drive = getDriveClientFromOAuth(accessToken);

  // Проверяем доступ к папке
  try {
    const folderInfo = await drive.files.get({
      fileId: parentFolderId,
      fields: "id, name, mimeType"
    });

    if (folderInfo.data.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("GOOGLE_DRIVE_NOT_A_FOLDER: Указанный ID не является папкой Google Drive.");
    }

    Logger.info("Folder validated for OAuth upload", {
      folderId: parentFolderId,
      folderName: folderInfo.data.name
    });
  } catch (error: any) {
    if (error?.code === 404) {
      throw new Error(
        `GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена (ID: ${parentFolderId}). Проверьте правильность ID папки.`
      );
    }
    if (error?.code === 403) {
      throw new Error(
        `GOOGLE_DRIVE_PERMISSION_DENIED: Нет доступа к папке. Убедитесь, что у вас есть права "Редактор" на эту папку.`
      );
    }
    throw error;
  }

  const stats = await fs.promises.stat(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  // ПРОВЕРКА: Проверяем, не существует ли уже файл с таким же именем в папке
  // ВАЖНО: Проверяем только файлы, созданные не более 1 часа назад (чтобы не блокировать новые загрузки)
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const existingFiles = await drive.files.list({
      q: `name='${fileName.replace(/'/g, "\\'")}' and '${parentFolderId}' in parents and trashed=false and createdTime > '${oneHourAgo}'`,
      fields: "files(id, name, webViewLink, webContentLink, size, createdTime)",
      pageSize: 1,
      orderBy: "createdTime desc"
    });

    if (existingFiles.data.files && existingFiles.data.files.length > 0) {
      const existingFile = existingFiles.data.files[0];
      
      console.log("UPLOAD_SKIPPED_ALREADY_UPLOADED:", {
        fileName,
        reason: "duplicate_file_in_drive_oauth",
        existingFileId: existingFile.id,
        existingCreatedTime: existingFile.createdTime
      });

      Logger.warn("uploadFileToDriveWithOAuth: file with same name already exists in Drive (created recently)", {
        fileName,
        parentFolderId,
        existingFileId: existingFile.id,
        existingFileSize: existingFile.size,
        existingCreatedTime: existingFile.createdTime,
        existingWebViewLink: existingFile.webViewLink,
        note: "Returning existing file to prevent duplicate"
      });

      return {
        fileId: existingFile.id as string,
        webViewLink: existingFile.webViewLink ?? undefined,
        webContentLink: existingFile.webContentLink ?? undefined
      };
    }

    Logger.info("uploadFileToDriveWithOAuth: no recent file found with same name, proceeding with upload", {
      fileName,
      parentFolderId
    });
  } catch (checkError: any) {
    // Если проверка не удалась, продолжаем загрузку (не критично)
    Logger.warn("uploadFileToDriveWithOAuth: failed to check for existing file, proceeding with upload", {
      fileName,
      parentFolderId,
      error: checkError?.message || String(checkError)
    });
  }

  Logger.info("Starting file upload to Google Drive with OAuth", {
    filePath,
    fileName,
    mimeType,
    parentFolderId,
    fileSizeBytes: stats.size,
    fileSizeMB
  });

  console.log("UPLOAD_START:", {
    filePath,
    fileName,
    folderId: parentFolderId,
    method: "OAuth",
    timestamp: new Date().toISOString()
  });

  const uploadStartTime = Date.now();
  const fileStream = fs.createReadStream(filePath);

  try {
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentFolderId]
      },
      media: {
        mimeType,
        body: fileStream
      },
      fields: "id, name, webViewLink, webContentLink, size"
    });

    const file = res.data;
    const uploadDuration = Date.now() - uploadStartTime;

    Logger.info("File uploaded successfully to Google Drive with OAuth", {
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size,
      webViewLink: file.webViewLink,
      uploadDurationMs: uploadDuration
    });

    console.log("UPLOAD_SUCCESS:", {
      driveFileId: file.id,
      webViewLink: file.webViewLink,
      fileName: file.name,
      method: "OAuth",
      timestamp: new Date().toISOString()
    });

    return {
      fileId: file.id as string,
      webViewLink: file.webViewLink ?? undefined,
      webContentLink: file.webContentLink ?? undefined
    };
  } catch (error: any) {
    const errorDetails = {
      code: error?.code,
      message: error?.message,
      errors: error?.errors,
      response: error?.response?.data
    };

    Logger.error("Failed to upload file to Google Drive with OAuth", {
      error: errorDetails,
      fileName,
      parentFolderId,
      filePath,
      fileSizeMB
    });

    if (error?.code === 401) {
      throw new Error(
        "GOOGLE_DRIVE_OAUTH_INVALID: OAuth токен недействителен или истёк. Обновите токен."
      );
    }

    if (error?.code === 403) {
      throw new Error(
        `GOOGLE_DRIVE_PERMISSION_DENIED: Нет прав на загрузку в эту папку (ID: ${parentFolderId}). Убедитесь, что у вас есть права "Редактор".`
      );
    }

    if (error?.code === 404) {
      throw new Error(
        `GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена (ID: ${parentFolderId}). Проверьте правильность ID папки.`
      );
    }

    if (error?.code === 429) {
      throw new Error(
        "GOOGLE_DRIVE_QUOTA_EXCEEDED: Превышена квота Google Drive API. Попробуйте позже."
      );
    }

    if (error?.code === 413) {
      throw new Error(
        "GOOGLE_DRIVE_FILE_TOO_LARGE: Файл слишком большой для загрузки через Google Drive API."
      );
    }

    throw error;
  }
}

