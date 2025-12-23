import { google } from "googleapis";
import { Logger } from "../utils/logger";
import { getValidAccessToken } from "./GoogleDriveOAuthService";
import { getDriveClient } from "./googleDrive";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;

if (!SERVICE_ACCOUNT_EMAIL) {
  Logger.warn("GOOGLE_DRIVE_CLIENT_EMAIL not configured. Folder sharing with service account may not work.");
}

/**
 * Создаёт папку в Google Drive от имени пользователя (через OAuth)
 * @param userId - ID пользователя
 * @param folderName - Имя папки
 * @param parentId - ID родительской папки (опционально, по умолчанию корень)
 * @returns ID и webViewLink созданной папки
 */
export async function createUserFolder(params: {
  userId: string;
  folderName: string;
  parentId?: string;
}): Promise<{ folderId: string; webViewLink?: string }> {
  const { userId, folderName, parentId } = params;

  try {
    // Получаем валидный access token пользователя
    const accessToken = await getValidAccessToken(userId);

    // Создаём OAuth2 клиент и настраиваем токен
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Создаём клиент Drive
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    Logger.info("Creating Google Drive folder for user", {
      userId,
      folderName,
      parentId: parentId || "root"
    });

    const requestBody: {
      name: string;
      mimeType: string;
      parents?: string[];
    } = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder"
    };

    if (parentId) {
      requestBody.parents = [parentId];
    }

    const res = await drive.files.create({
      requestBody,
      fields: "id, name, webViewLink"
    });

    const folder = res.data;

    Logger.info("Google Drive folder created successfully for user", {
      userId,
      folderId: folder.id,
      folderName: folder.name,
      webViewLink: folder.webViewLink
    });

    return {
      folderId: folder.id as string,
      webViewLink: folder.webViewLink ?? undefined
    };
  } catch (error: any) {
    Logger.error("Failed to create Google Drive folder for user", {
      userId,
      folderName,
      parentId,
      error: error?.message || String(error),
      errorCode: error?.code
    });

    throw new Error(
      `GOOGLE_DRIVE_CREATE_FOLDER_FAILED: Ошибка при создании папки в Google Drive. ${error?.message || "Unknown error"}`
    );
  }
}

/**
 * Выдаёт права доступа сервис-аккаунту на папку
 * @param userId - ID пользователя (владельца папки)
 * @param folderId - ID папки
 * @param role - Роль доступа (по умолчанию "writer")
 * @returns true если успешно
 */
export async function shareFolderWithServiceAccount(params: {
  userId: string;
  folderId: string;
  role?: "reader" | "writer" | "commenter";
}): Promise<boolean> {
  const { userId, folderId, role = "writer" } = params;

  if (!SERVICE_ACCOUNT_EMAIL) {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_NOT_CONFIGURED: Сервисный аккаунт не настроен");
  }

  try {
    // Получаем валидный access token пользователя
    const accessToken = await getValidAccessToken(userId);

    // Создаём OAuth2 клиент и настраиваем токен
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    // Создаём клиент Drive
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    Logger.info("Sharing folder with service account", {
      userId,
      folderId,
      serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
      role
    });

    // Выдаём права сервис-аккаунту
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        role,
        type: "user",
        emailAddress: SERVICE_ACCOUNT_EMAIL
      },
      fields: "id"
    });

    Logger.info("Folder shared with service account successfully", {
      userId,
      folderId,
      serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
      role
    });

    return true;
  } catch (error: any) {
    Logger.error("Failed to share folder with service account", {
      userId,
      folderId,
      serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
      role,
      error: error?.message || String(error),
      errorCode: error?.code
    });

    // Если права уже выданы, это не ошибка
    if (error?.code === 409 || error?.message?.includes("already exists")) {
      Logger.info("Folder already shared with service account", {
        userId,
        folderId,
        serviceAccountEmail: SERVICE_ACCOUNT_EMAIL
      });
      return true;
    }

    throw new Error(
      `GOOGLE_DRIVE_SHARE_FAILED: Ошибка при выдаче прав доступа. ${error?.message || "Unknown error"}`
    );
  }
}

/**
 * Создаёт структуру папок для канала и выдаёт права сервис-аккаунту
 * @param userId - ID пользователя
 * @param channelName - Название канала
 * @param channelId - ID канала
 * @returns Объект с ID основной папки и папки архива
 */
export async function createChannelFolders(params: {
  userId: string;
  channelName: string;
  channelId: string;
}): Promise<{
  rootFolderId: string;
  archiveFolderId: string;
  rootFolderName: string;
  archiveFolderName: string;
}> {
  const { userId, channelName, channelId } = params;

  try {
    Logger.info("Starting channel folders creation", {
      userId,
      channelName,
      channelId
    });

    // 1. Создаём основную папку канала
    const rootFolderName = `${channelName} — ${channelId}`;
    const rootFolder = await createUserFolder({
      userId,
      folderName: rootFolderName,
      parentId: undefined // Создаём в корне
    });

    Logger.info("Root folder created", {
      userId,
      channelId,
      rootFolderId: rootFolder.folderId,
      rootFolderName
    });

    // 2. Создаём папку uploaded внутри основной папки
    const archiveFolderName = "uploaded";
    const archiveFolder = await createUserFolder({
      userId,
      folderName: archiveFolderName,
      parentId: rootFolder.folderId
    });

    Logger.info("Archive folder created", {
      userId,
      channelId,
      archiveFolderId: archiveFolder.folderId,
      archiveFolderName,
      parentFolderId: rootFolder.folderId
    });

    // 3. Выдаём права сервис-аккаунту на обе папки
    await shareFolderWithServiceAccount({
      userId,
      folderId: rootFolder.folderId,
      role: "writer"
    });

    await shareFolderWithServiceAccount({
      userId,
      folderId: archiveFolder.folderId,
      role: "writer"
    });

    Logger.info("Channel folders created and shared successfully", {
      userId,
      channelId,
      rootFolderId: rootFolder.folderId,
      archiveFolderId: archiveFolder.folderId
    });

    return {
      rootFolderId: rootFolder.folderId,
      archiveFolderId: archiveFolder.folderId,
      rootFolderName,
      archiveFolderName
    };
  } catch (error: any) {
    Logger.error("Failed to create channel folders", {
      userId,
      channelName,
      channelId,
      error: error?.message || String(error),
      errorCode: error?.code
    });
    throw error;
  }
}

/**
 * Создаёт структуру папок для канала в мастере (без channelId)
 * Используется до создания канала в БД
 * @param userId - ID пользователя
 * @param channelName - Название канала
 * @param channelUuid - Временный UUID для канала (опционально, если не указан - генерируется)
 * @returns Объект с ID основной папки и папки архива
 */
export async function createChannelFoldersForWizard(params: {
  userId: string;
  channelName: string;
  channelUuid?: string;
}): Promise<{
  rootFolderId: string;
  archiveFolderId: string;
  rootFolderName: string;
  archiveFolderName: string;
}> {
  const { userId, channelName, channelUuid } = params;
  
  // Генерируем временный UUID, если не указан
  const tempChannelId = channelUuid || `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  try {
    Logger.info("Starting channel folders creation for wizard", {
      userId,
      channelName,
      tempChannelId
    });

    // 1. Создаём основную папку канала
    const rootFolderName = `${channelName} — ${tempChannelId}`;
    const rootFolder = await createUserFolder({
      userId,
      folderName: rootFolderName,
      parentId: undefined // Создаём в корне
    });

    Logger.info("Root folder created for wizard", {
      userId,
      tempChannelId,
      rootFolderId: rootFolder.folderId,
      rootFolderName
    });

    // 2. Создаём папку uploaded внутри основной папки
    const archiveFolderName = "uploaded";
    const archiveFolder = await createUserFolder({
      userId,
      folderName: archiveFolderName,
      parentId: rootFolder.folderId
    });

    Logger.info("Archive folder created for wizard", {
      userId,
      tempChannelId,
      archiveFolderId: archiveFolder.folderId,
      archiveFolderName,
      parentFolderId: rootFolder.folderId
    });

    // 3. Выдаём права сервис-аккаунту на обе папки
    await shareFolderWithServiceAccount({
      userId,
      folderId: rootFolder.folderId,
      role: "writer"
    });

    await shareFolderWithServiceAccount({
      userId,
      folderId: archiveFolder.folderId,
      role: "writer"
    });

    Logger.info("Channel folders created and shared successfully for wizard", {
      userId,
      tempChannelId,
      rootFolderId: rootFolder.folderId,
      archiveFolderId: archiveFolder.folderId
    });

    return {
      rootFolderId: rootFolder.folderId,
      archiveFolderId: archiveFolder.folderId,
      rootFolderName,
      archiveFolderName
    };
  } catch (error: any) {
    Logger.error("Failed to create channel folders for wizard", {
      userId,
      channelName,
      tempChannelId,
      error: error?.message || String(error),
      errorCode: error?.code
    });
    throw error;
  }
}

