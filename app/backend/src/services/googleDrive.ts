import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import * as fs from "fs";
import { Logger } from "../utils/logger";

const DRIVE_SCOPE = ["https://www.googleapis.com/auth/drive.file"];
const DRIVE_FULL_SCOPE = ["https://www.googleapis.com/auth/drive"];

/**
 * Создаёт и возвращает клиент Google Drive API, используя Service Account
 * @param useFullScope - Если true, использует полный scope для создания папок и управления правами
 * @returns {drive_v3.Drive} Клиент Google Drive
 */
export function getDriveClient(useFullScope: boolean = false): drive_v3.Drive {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      "GOOGLE_DRIVE_CREDENTIALS_NOT_CONFIGURED: Google Drive credentials are not configured. Please set GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY in backend/.env"
    );
  }

  try {
    // В .env переносы строк обычно экранируются как \n, здесь восстанавливаем их
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    // Инициализация JWT аутентификации для Service Account
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: useFullScope ? DRIVE_FULL_SCOPE : DRIVE_SCOPE
    });

    return google.drive({ version: "v3", auth });
  } catch (error) {
    Logger.error("Failed to create Google Drive client", error);
    throw new Error(
      "GOOGLE_DRIVE_AUTH_FAILED: Failed to authenticate with Google Drive. Check your credentials."
    );
  }
}

/**
 * Проверяет доступность папки и права доступа Service Account
 * @param {google.drive_v3.Drive} drive - Клиент Google Drive
 * @param {string} folderId - ID папки для проверки
 * @returns {Promise<void>}
 */
async function validateFolderAccess(
  drive: drive_v3.Drive,
  folderId: string
): Promise<void> {
  try {
    Logger.info("Validating folder access", { folderId });

    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: "id, name, mimeType, permissions, owners, shared"
    });

    // Проверяем, что это действительно папка
    if (folderInfo.data.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error(
        "GOOGLE_DRIVE_NOT_A_FOLDER: Указанный ID не является папкой Google Drive."
      );
    }

    Logger.info("Folder validated successfully", {
      folderId,
      folderName: folderInfo.data.name,
      mimeType: folderInfo.data.mimeType
    });
  } catch (error: any) {
    const errorCode = error?.code;
    const errorMessage = String(error?.message || "");

    Logger.error("Folder validation failed", {
      folderId,
      errorCode,
      errorMessage
    });

    if (errorCode === 404) {
      throw new Error(
        "GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена. Проверьте правильность ID папки. " +
        "Убедитесь, что папка существует и расшарена на Service Account."
      );
    }

    if (errorCode === 403 || errorMessage.includes("insufficientFilePermissions")) {
      const serviceAccountEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      throw new Error(
        `GOOGLE_DRIVE_PERMISSION_DENIED: Нет доступа к папке. Проверьте, что папка расшарена на ${serviceAccountEmail} с правами "Редактор".`
      );
    }

    // Пробрасываем другие ошибки дальше
    throw error;
  }
}

/**
 * Загружает видеофайл в указанную папку Google Drive
 * @param {Buffer} fileBuffer - Буфер с данными файла
 * @param {string} mimeType - MIME-тип файла (например, 'video/mp4')
 * @param {string} fileName - Имя файла для сохранения
 * @param {string|undefined} folderId - ID папки из настроек канала (опционально)
 * @returns {Promise<{fileId: string, webViewLink?: string, webContentLink?: string}>}
 */
export async function uploadVideoToDrive(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  folderId?: string
): Promise<{ fileId: string; webViewLink?: string; webContentLink?: string }> {
  // Определяем родительскую папку: сначала из канала, потом из .env, иначе ошибка
  const folderIdFromChannel = folderId?.trim() || undefined;
  const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT?.trim() || undefined;

  if (!folderIdFromChannel && !defaultFolderId) {
    throw new Error(
      "GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED: Не указана папка для загрузки. " +
      "Укажите Google Drive Folder ID в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env"
    );
  }

  // Используем полный scope для загрузки файлов в расшаренные папки
  const drive = getDriveClient(true);

  // Определяем, какую папку использовать: сначала пробуем из канала, если не найдена - используем defaultParent
  let parentFolderId: string = "";
  let usedDefaultParent = false;

  try {
    // Шаг 1: Пробуем использовать папку из канала, если она указана
    if (folderIdFromChannel) {
      try {
        await validateFolderAccess(drive, folderIdFromChannel);
        parentFolderId = folderIdFromChannel;
        Logger.info("Using folder from channel settings", { folderId: parentFolderId });
      } catch (error: any) {
        // Если папка из канала не найдена (404), пробуем использовать defaultParent
        if (error?.code === 404 || String(error?.message || "").includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND")) {
          if (defaultFolderId) {
            Logger.warn("Folder from channel not found, falling back to default parent", {
              channelFolderId: folderIdFromChannel,
              defaultFolderId
            });
            // Проверяем доступность defaultParent
            await validateFolderAccess(drive, defaultFolderId);
            parentFolderId = defaultFolderId;
            usedDefaultParent = true;
          } else {
            // Папка из канала не найдена, и нет defaultParent
            throw new Error(
              `GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка из настроек канала не найдена (ID: ${folderIdFromChannel}). ` +
              `Проверьте правильность ID папки в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env`
            );
          }
        } else {
          // Другие ошибки (403, и т.д.) пробрасываем дальше
          throw error;
        }
      }
    } else {
      // Папка из канала не указана, используем defaultParent
      parentFolderId = defaultFolderId!;
      await validateFolderAccess(drive, parentFolderId);
      usedDefaultParent = true;
      Logger.info("Using default parent folder", { folderId: parentFolderId });
    }

    // Шаг 2: Подготавливаем данные для загрузки
    const fileSizeMB = (fileBuffer.length / (1024 * 1024)).toFixed(2);
    Logger.info("Starting upload to Google Drive", {
      fileName,
      mimeType,
      parentFolderId,
      usedDefaultParent,
      fileSizeBytes: fileBuffer.length,
      fileSizeMB
    });

    // Преобразуем Buffer в поток (stream), так как googleapis ожидает поток для media.body
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null); // Сигнал конца потока

    const uploadStartTime = Date.now();

    // Шаг 3: Загружаем файл в Google Drive
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentFolderId]
      },
      media: {
        mimeType,
        body: bufferStream
      },
      fields: "id, name, webViewLink, webContentLink, size"
    });

    const file = res.data;
    const uploadDuration = Date.now() - uploadStartTime;

    Logger.info("Video uploaded successfully to Google Drive", {
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size,
      webViewLink: file.webViewLink,
      uploadDurationMs: uploadDuration
    });

    return {
      fileId: file.id as string,
      webViewLink: file.webViewLink ?? undefined,
      webContentLink: file.webContentLink ?? undefined
    };
  } catch (error: any) {
    // Детальное логирование ошибки для отладки
    const errorDetails = {
      code: error?.code,
      message: error?.message,
      errors: error?.errors,
      response: error?.response?.data
    };

    Logger.error("Failed to upload video to Google Drive", {
      error: errorDetails,
      fileName,
      parentFolderId
    });

    // Если ошибка уже обработана в validateFolderAccess, пробрасываем её дальше
    const errorMessage = String(error?.message || "");
    if (
      errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND") ||
      errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED") ||
      errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")
    ) {
      throw error;
    }

    // Обработка специфичных ошибок Google Drive API при загрузке
    if (error?.code === 404) {
      throw new Error(
        "GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена. Проверьте правильность ID папки."
      );
    }

    if (error?.code === 403) {
      const serviceAccountEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      const errorMsg = String(error?.message || "");
      
      // Проверяем конкретные типы ошибок доступа
      if (errorMsg.includes("insufficientFilePermissions") || errorMsg.includes("insufficient permissions")) {
        throw new Error(
          `GOOGLE_DRIVE_PERMISSION_DENIED: Недостаточно прав доступа к папке. Проверьте, что папка расшарена на ${serviceAccountEmail} с правами "Редактор".`
        );
      }

      // Общая ошибка доступа
      throw new Error(
        `GOOGLE_DRIVE_PERMISSION_DENIED: Нет доступа к папке. Проверьте, что папка расшарена на ${serviceAccountEmail} с правами "Редактор".`
      );
    }

    if (error?.code === 401) {
      throw new Error(
        "GOOGLE_DRIVE_AUTH_FAILED: Ошибка аутентификации. Проверьте правильность GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
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

    // Общая ошибка с деталями (логируем полную информацию, возвращаем краткое сообщение)
    const fullErrorMessage = error?.message || "Unknown error";
    Logger.error("Unexpected Google Drive error", {
      fullError: fullErrorMessage,
      errorCode: error?.code,
      errorStack: error?.stack
    });

    throw new Error(`GOOGLE_DRIVE_UPLOAD_FAILED: Ошибка при загрузке файла в Google Drive. ${fullErrorMessage}`);
  }
}

/**
 * Загружает файл с диска в Google Drive
 * @param params - Параметры загрузки
 * @returns Информация о загруженном файле
 */
export async function uploadFileToDrive(params: {
  filePath: string; // Локальный путь к файлу
  fileName: string; // Имя файла для сохранения в Drive
  mimeType?: string; // MIME-тип (по умолчанию 'video/mp4')
  parentFolderId?: string; // ID папки из запроса или GOOGLE_DRIVE_DEFAULT_PARENT
}): Promise<{ fileId: string; webViewLink?: string; webContentLink?: string }> {
  const { filePath, fileName, mimeType = "video/mp4", parentFolderId } = params;

  // Проверяем, что файл существует
  try {
    await fs.promises.access(filePath);
  } catch {
    throw new Error(`FILE_NOT_FOUND: Файл не найден: ${filePath}`);
  }

  // Получаем размер файла
  const stats = await fs.promises.stat(filePath);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  // Определяем родительскую папку
  const folderIdFromRequest = parentFolderId?.trim() || undefined;
  const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT?.trim() || undefined;

  if (!folderIdFromRequest && !defaultFolderId) {
    throw new Error(
      "GOOGLE_DRIVE_FOLDER_NOT_CONFIGURED: Не указана папка для загрузки. " +
      "Укажите Google Drive Folder ID в настройках канала или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env"
    );
  }

  // Используем полный scope для загрузки файлов в расшаренные папки
  const drive = getDriveClient(true);

  // Определяем, какую папку использовать
  let finalParentFolderId: string = "";
  let usedDefaultParent = false;

  try {
    // Пробуем использовать папку из запроса, если она указана
    if (folderIdFromRequest) {
      try {
        await validateFolderAccess(drive, folderIdFromRequest);
        finalParentFolderId = folderIdFromRequest;
        Logger.info("Using folder from request", { folderId: finalParentFolderId });
      } catch (error: any) {
        // Если папка не найдена (404), пробуем использовать defaultParent
        if (error?.code === 404 || String(error?.message || "").includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND")) {
          if (defaultFolderId) {
            Logger.warn("Folder from request not found, falling back to default parent", {
              requestFolderId: folderIdFromRequest,
              defaultFolderId
            });
            try {
              await validateFolderAccess(drive, defaultFolderId);
              finalParentFolderId = defaultFolderId;
              usedDefaultParent = true;
            } catch (defaultError: any) {
              // Если и defaultParent не найден, возвращаем понятную ошибку
              const serviceAccountEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
              throw new Error(
                `GOOGLE_DRIVE_FOLDER_NOT_FOUND: Обе папки не найдены. ` +
                `Папка из запроса (${folderIdFromRequest}) и папка по умолчанию (${defaultFolderId}) недоступны. ` +
                `Проверьте правильность ID папок и убедитесь, что они расшарены на ${serviceAccountEmail} с правами "Редактор".`
              );
            }
          } else {
            const serviceAccountEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
            throw new Error(
              `GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена (ID: ${folderIdFromRequest}). ` +
              `Проверьте правильность ID папки и убедитесь, что она расшарена на ${serviceAccountEmail} с правами "Редактор". ` +
              `Или задайте GOOGLE_DRIVE_DEFAULT_PARENT в backend/.env`
            );
          }
        } else {
          throw error;
        }
      }
    } else {
      // Используем defaultParent
      finalParentFolderId = defaultFolderId!;
      await validateFolderAccess(drive, finalParentFolderId);
      usedDefaultParent = true;
      Logger.info("Using default parent folder", { folderId: finalParentFolderId });
    }

    // ПРОВЕРКА: Проверяем, не существует ли уже файл с таким же именем в папке
    // ВАЖНО: Проверяем только файлы, созданные не более 1 часа назад (чтобы не блокировать новые загрузки)
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const existingFiles = await drive.files.list({
        q: `name='${fileName.replace(/'/g, "\\'")}' and '${finalParentFolderId}' in parents and trashed=false and createdTime > '${oneHourAgo}'`,
        fields: "files(id, name, webViewLink, webContentLink, size, createdTime)",
        pageSize: 1,
        orderBy: "createdTime desc"
      });

      if (existingFiles.data.files && existingFiles.data.files.length > 0) {
        const existingFile = existingFiles.data.files[0];
        
        console.log("UPLOAD_SKIPPED_ALREADY_UPLOADED:", {
          fileName,
          reason: "duplicate_file_in_drive_service_account",
          existingFileId: existingFile.id,
          existingCreatedTime: existingFile.createdTime
        });

        Logger.warn("uploadFileToDrive: file with same name already exists in Drive (created recently)", {
          fileName,
          parentFolderId: finalParentFolderId,
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

      Logger.info("uploadFileToDrive: no recent file found with same name, proceeding with upload", {
        fileName,
        parentFolderId: finalParentFolderId
      });
    } catch (checkError: any) {
      // Если проверка не удалась, продолжаем загрузку (не критично)
      Logger.warn("uploadFileToDrive: failed to check for existing file, proceeding with upload", {
        fileName,
        parentFolderId: finalParentFolderId,
        error: checkError?.message || String(checkError)
      });
    }

    Logger.info("Starting file upload to Google Drive from disk", {
      filePath,
      fileName,
      mimeType,
      parentFolderId: finalParentFolderId,
      usedDefaultParent,
      fileSizeBytes: stats.size,
      fileSizeMB
    });

    console.log("UPLOAD_START:", {
      filePath,
      fileName,
      folderId: finalParentFolderId,
      timestamp: new Date().toISOString()
    });

    const uploadStartTime = Date.now();

    // Создаём поток для чтения файла
    const fileStream = fs.createReadStream(filePath);

    // Загружаем файл в Google Drive
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [finalParentFolderId]
      },
      media: {
        mimeType,
        body: fileStream
      },
      fields: "id, name, webViewLink, webContentLink, size"
    });

    const file = res.data;
    const uploadDuration = Date.now() - uploadStartTime;

    Logger.info("File uploaded successfully to Google Drive", {
      fileId: file.id,
      fileName: file.name,
      fileSize: file.size,
      webViewLink: file.webViewLink,
      uploadDurationMs: uploadDuration
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

    Logger.error("Failed to upload file to Google Drive", {
      error: errorDetails,
      fileName,
      filePath,
      parentFolderId: finalParentFolderId || "undefined (error occurred before folder selection)"
    });

    // Если ошибка уже обработана в validateFolderAccess, пробрасываем её дальше
    const errorMessage = String(error?.message || "");
    if (
      errorMessage.includes("GOOGLE_DRIVE_FOLDER_NOT_FOUND") ||
      errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED") ||
      errorMessage.includes("GOOGLE_DRIVE_NOT_A_FOLDER")
    ) {
      throw error;
    }

    // Обработка специфичных ошибок Google Drive API
    if (error?.code === 404) {
      throw new Error(
        "GOOGLE_DRIVE_FOLDER_NOT_FOUND: Папка не найдена. Проверьте правильность ID папки."
      );
    }

    if (error?.code === 403) {
      const serviceAccountEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      const errorMsg = String(error?.message || "");

      if (errorMsg.includes("insufficientFilePermissions") || errorMsg.includes("insufficient permissions")) {
        throw new Error(
          `GOOGLE_DRIVE_PERMISSION_DENIED: Недостаточно прав доступа к папке. Проверьте, что папка расшарена на ${serviceAccountEmail} с правами "Редактор".`
        );
      }

      throw new Error(
        `GOOGLE_DRIVE_PERMISSION_DENIED: Нет доступа к папке. Проверьте, что папка расшарена на ${serviceAccountEmail} с правами "Редактор".`
      );
    }

    if (error?.code === 401) {
      throw new Error(
        "GOOGLE_DRIVE_AUTH_FAILED: Ошибка аутентификации. Проверьте правильность GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
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

    const fullErrorMessage = error?.message || "Unknown error";
    Logger.error("Unexpected Google Drive error", {
      fullError: fullErrorMessage,
      errorCode: error?.code,
      errorStack: error?.stack
    });

    throw new Error(`GOOGLE_DRIVE_UPLOAD_FAILED: Ошибка при загрузке файла в Google Drive. ${fullErrorMessage}`);
  }
}


/**
 * Создаёт папку в Google Drive от имени сервис-аккаунта
 * @param params.folderName - Имя создаваемой папки
 * @param params.parentId - Необязательный ID родительской папки
 * @returns ID и webViewLink созданной папки
 */
export async function createFolder(params: {
  folderName: string;
  parentId?: string;
}): Promise<{ folderId: string; webViewLink?: string }> {
  const { folderName, parentId } = params;
  const drive = getDriveClient(true); // полный scope для создания папок

  try {
    Logger.info("Creating Google Drive folder", { folderName, parentId });

    const requestBody: {
      name: string;
      mimeType: string;
      parents?: string[];
      writersCanShare?: boolean;
    } = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      writersCanShare: true
    };

    if (parentId) {
      requestBody.parents = [parentId];
    }

    const res = await drive.files.create({
      requestBody,
      fields: "id, name, webViewLink"
    });

    const folder = res.data;

    Logger.info("Google Drive folder created successfully", {
      folderId: folder.id,
      folderName: folder.name,
      webViewLink: folder.webViewLink
    });

    return {
      folderId: folder.id as string,
      webViewLink: folder.webViewLink ?? undefined
    };
  } catch (error: any) {
    const errorDetails = {
      code: error?.code,
      message: error?.message,
      errors: error?.errors,
      response: error?.response?.data
    };

    Logger.error("Failed to create Google Drive folder", {
      error: errorDetails,
      folderName,
      parentId
    });

    throw new Error(
      `GOOGLE_DRIVE_CREATE_FOLDER_FAILED: Ошибка при создании папки в Google Drive. ${error?.message || "Unknown error"}`
    );
  }
}

