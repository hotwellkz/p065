import { google, drive_v3 } from "googleapis";
import { Logger } from "../utils/logger";
import type { Channel } from "../types/channel";
import { blottataPublisherService } from "./blottataPublisherService";
import { generateYoutubeTitleAndDescription } from "./youtubeTitleDescriptionGenerator";
import { getDriveClient } from "./googleDrive";
import { normalizeYoutubeTitle } from "../utils/youtubeTitleNormalizer";

interface ProcessedFile {
  fileId: string;
  fileName: string;
  success: boolean;
  publishedPlatforms: string[];
  errors: string[];
}

/**
 * Очищает ID папки Google Drive от параметров URL (например, ?hl=ru)
 */
function cleanFolderId(folderId: string): string {
  if (!folderId) return folderId;
  // Удаляем параметры URL, если они есть
  // Например: "1BBP3gnYws01siBUs0GQeIYx2j8Nm8Jvy?hl=ru" -> "1BBP3gnYws01siBUs0GQeIYx2j8Nm8Jvy"
  const questionMarkIndex = folderId.indexOf('?');
  if (questionMarkIndex !== -1) {
    return folderId.substring(0, questionMarkIndex);
  }
  return folderId;
}

/**
 * Обрабатывает файл из Google Drive: генерирует описание, публикует через Blottata, перемещает в архив
 */
export async function processBlottataFile(
  channel: Channel,
  fileId: string
): Promise<ProcessedFile> {
  const result: ProcessedFile = {
    fileId,
    fileName: "",
    success: false,
    publishedPlatforms: [],
    errors: []
  };

  try {
    Logger.info("BlottataFileProcessor: Starting file processing", {
      channelId: channel.id,
      fileId,
      driveInputFolderId: channel.driveInputFolderId || "not set",
      driveArchiveFolderId: channel.driveArchiveFolderId || "not set",
      blotataEnabled: channel.blotataEnabled || false
    });

    // 1. Получаем информацию о файле из Google Drive
    const drive = getDriveClient(true);
    const fileInfo = await drive.files.get({
      fileId,
      fields: "id, name, webContentLink, mimeType, parents"
    });

    result.fileName = fileInfo.data.name || "unknown";

    // Проверяем, что это видео
    const mimeType = fileInfo.data.mimeType || "";
    if (!mimeType.startsWith("video/")) {
      throw new Error(`File is not a video: ${mimeType}`);
    }

    // 2. Получаем публичную ссылку на файл
    const mediaUrl = fileInfo.data.webContentLink;
    if (!mediaUrl) {
      throw new Error("File does not have webContentLink. Make sure the file is shared publicly.");
    }

    Logger.info("BlottataFileProcessor: File info retrieved", {
      channelId: channel.id,
      fileId,
      fileName: result.fileName,
      mediaUrl
    });

    // 3. Генерируем title и description через OpenAI с учетом языка канала
    const { title: generatedTitle, description } = await generateYoutubeTitleAndDescription(result.fileName, channel);
    
    // Нормализуем title перед публикацией (уже нормализован в generateYoutubeTitleAndDescription, но для надежности делаем еще раз)
    const normalizedTitle = normalizeYoutubeTitle(generatedTitle);

    Logger.info("BlottataFileProcessor: Title and description generated", {
      channelId: channel.id,
      fileId,
      titleLength: normalizedTitle.length,
      descriptionLength: description.length,
      title: normalizedTitle.substring(0, 50) + (normalizedTitle.length > 50 ? "..." : ""),
      description: description.substring(0, 50) + "..."
    });

    // 4. Публикуем на все настроенные платформы
    const publishResults = await blottataPublisherService.publishToAllPlatforms({
      channel,
      mediaUrl,
      description,
      title: normalizedTitle
    });

    // Анализируем результаты
    const successfulPlatforms: string[] = [];
    const errors: string[] = [];

    publishResults.forEach((result) => {
      if (result.success) {
        successfulPlatforms.push(result.platform);
      } else {
        errors.push(`${result.platform}: ${result.error || "Unknown error"}`);
      }
    });

    result.publishedPlatforms = successfulPlatforms;

    if (errors.length > 0) {
      result.errors = errors;
      Logger.warn("BlottataFileProcessor: Some platforms failed", {
        channelId: channel.id,
        fileId,
        errors
      });
    }

    // Если хотя бы одна платформа успешна, считаем операцию успешной
    result.success = successfulPlatforms.length > 0;

    if (!result.success) {
      throw new Error(`All platforms failed: ${errors.join("; ")}`);
    }

    // 5. Перемещаем файл из входной папки в архивную папку после успешной публикации
    const rawInputFolderId = channel.driveInputFolderId;
    const rawArchiveFolderId = channel.driveArchiveFolderId;

    // Очищаем folderId от параметров URL (например, ?hl=ru)
    const inputFolderId = rawInputFolderId ? cleanFolderId(rawInputFolderId) : undefined;
    const archiveFolderId = rawArchiveFolderId ? cleanFolderId(rawArchiveFolderId) : undefined;

    if (inputFolderId && archiveFolderId) {
      Logger.info("BlottataFileProcessor: Moving file to archive folder", {
        channelId: channel.id,
        fileId,
        fileName: result.fileName,
        inputFolderId,
        archiveFolderId,
        originalInputFolderId: rawInputFolderId,
        originalArchiveFolderId: rawArchiveFolderId
      });

      try {
        await moveFileToArchive(drive, fileId, inputFolderId, archiveFolderId);
        
        Logger.info("BlottataFileProcessor: File successfully moved to archive folder", {
          channelId: channel.id,
          fileId,
          fileName: result.fileName,
          inputFolderId,
          archiveFolderId
        });
      } catch (moveError: any) {
        Logger.error("BlottataFileProcessor: Failed to move file to archive folder", {
          channelId: channel.id,
          fileId,
          fileName: result.fileName,
          inputFolderId,
          archiveFolderId,
          error: moveError?.message || String(moveError),
          errorCode: moveError?.code,
          errorStack: moveError?.stack
        });
        // Не считаем это критической ошибкой, если публикация прошла успешно
        // Файл останется во входной папке и будет обработан снова при следующем цикле
        if (result.errors.length === 0) {
          result.errors.push(`Archive move failed: ${moveError?.message || "Unknown error"}`);
        }
      }
    } else {
      Logger.warn("BlottataFileProcessor: Archive folder is not configured for channel, skipping move", {
        channelId: channel.id,
        fileId,
        fileName: result.fileName,
        inputFolderId: inputFolderId || "not set",
        archiveFolderId: archiveFolderId || "not set",
        rawInputFolderId: rawInputFolderId || "not set",
        rawArchiveFolderId: rawArchiveFolderId || "not set",
        note: "File will remain in input folder and may be reprocessed"
      });
    }

    Logger.info("BlottataFileProcessor: File processing completed", {
      channelId: channel.id,
      fileId,
      success: result.success,
      publishedPlatforms: result.publishedPlatforms
    });

    return result;
  } catch (error: any) {
    Logger.error("BlottataFileProcessor: File processing failed", {
      channelId: channel.id,
      fileId,
      error: error?.message || String(error)
    });

    result.success = false;
    result.errors.push(error?.message || String(error));
    return result;
  }
}

/**
 * Перемещает файл из входной папки в архивную папку Google Drive
 * Удаляет файл из входной папки и добавляет в архивную папку
 * Поддерживает как обычные папки, так и Shared Drives
 */
async function moveFileToArchive(
  drive: drive_v3.Drive,
  fileId: string,
  inputFolderId: string,
  archiveFolderId: string
): Promise<void> {
  // Параметры для поддержки Shared Drives (если используются)
  const driveParams = {
    supportsAllDrives: true,
    includeItemsFromAllDrives: true
  };

  try {
    Logger.info("BlottataFileProcessor: Getting file info before move", {
      fileId,
      inputFolderId,
      archiveFolderId
    });

    // Получаем текущие родители файла
    const file = await drive.files.get({
      fileId,
      fields: "id, name, parents",
      ...driveParams
    });

    const currentParents = file.data.parents || [];
    const fileName = file.data.name || "unknown";
    const isInInputFolder = currentParents.includes(inputFolderId);
    
    Logger.info("BlottataFileProcessor: File current parents", {
      fileId,
      fileName,
      currentParents,
      inputFolderId,
      archiveFolderId,
      isInInputFolder
    });
    
    // Перемещаем файл: удаляем входную папку из родителей (если файл там находится) и добавляем архивную папку
    let updateParams: any = {
      fileId,
      addParents: archiveFolderId,
      fields: "id, parents",
      ...driveParams
    };

    if (isInInputFolder) {
      // Файл находится во входной папке - удаляем его оттуда и добавляем в архивную
      updateParams.removeParents = inputFolderId;
      Logger.info("BlottataFileProcessor: Starting file move operation (remove from input, add to archive)", {
        fileId,
        fileName,
        inputFolderId,
        archiveFolderId,
        operation: "removeParents + addParents"
      });
    } else {
      // Файл не находится во входной папке - просто добавляем в архивную
      Logger.warn("BlottataFileProcessor: File is not in input folder, adding to archive anyway", {
        fileId,
        fileName,
        inputFolderId,
        archiveFolderId,
        currentParents,
        note: "File will be added to archive folder without removing from input folder"
      });
    }

    const updateResult = await drive.files.update(updateParams);

    const newParents = updateResult.data.parents || [];

    Logger.info("BlottataFileProcessor: File successfully moved from input folder to archive folder", {
      fileId,
      fileName,
      inputFolderId,
      archiveFolderId,
      previousParents: currentParents,
      newParents
    });
  } catch (error: any) {
    const errorCode = error?.code;
    const errorMessage = error?.message || String(error);
    
    Logger.error("BlottataFileProcessor: Failed to move file to archive", {
      fileId,
      inputFolderId,
      archiveFolderId,
      error: errorMessage,
      errorCode,
      errorName: error?.name,
      errorStack: error?.stack
    });

    // Детализируем ошибки доступа к Google Drive
    if (errorCode === 404) {
      throw new Error(`GOOGLE_DRIVE_FOLDER_NOT_FOUND: Folder not found (input: ${inputFolderId}, archive: ${archiveFolderId}). Check folder IDs.`);
    }
    if (errorCode === 403) {
      throw new Error(`GOOGLE_DRIVE_PERMISSION_DENIED: Access denied to folder (input: ${inputFolderId}, archive: ${archiveFolderId}). Check permissions.`);
    }
    
    throw error;
  }
}

/**
 * Скачивает файл из Google Drive (если нужен локальный доступ)
 */
export async function downloadFileFromDrive(
  fileId: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const drive = getDriveClient(true);

  // Получаем метаданные файла
  const fileInfo = await drive.files.get({
    fileId,
    fields: "id, name, mimeType"
  });

  const fileName = fileInfo.data.name || "file";
  const mimeType = fileInfo.data.mimeType || "application/octet-stream";

  // Скачиваем файл
  const response = await drive.files.get(
    {
      fileId,
      alt: "media"
    },
    {
      responseType: "arraybuffer"
    }
  );

  const buffer = Buffer.from(response.data as ArrayBuffer);

  Logger.info("BlottataFileProcessor: File downloaded", {
    fileId,
    fileName,
    size: buffer.length
  });

  return { buffer, mimeType, fileName };
}

