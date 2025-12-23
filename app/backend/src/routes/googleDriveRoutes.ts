import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { createFolder } from "../services/googleDrive";
import { Logger } from "../utils/logger";

const router = Router();

/**
 * POST /api/google-drive/create-folder
 * Создаёт новую папку в Google Drive от имени Service Account
 *
 * Тело запроса:
 * {
 *   "folderName": "Имя папки",
 *   "parentId": "опционально — ID родительской папки"
 * }
 *
 * Ответ при успехе:
 * {
 *   "success": true,
 *   "folderId": "...",
 *   "webViewLink": "..."
 * }
 *
 * Ответ при ошибке:
 * {
 *   "success": false,
 *   "error": "описание ошибки"
 * }
 */
router.post("/create-folder", authRequired, async (req, res) => {
  const { folderName, parentId } = req.body as {
    folderName?: string;
    parentId?: string;
  };

  const userId = req.user!.uid;

  Logger.info("POST /api/google-drive/create-folder: start", {
    userId,
    folderName,
    parentId: parentId || "not specified (will create in root)"
  });

  // Валидация входных данных
  if (!folderName || typeof folderName !== "string" || folderName.trim().length === 0) {
    Logger.warn("Invalid folder name provided", { folderName, userId });
    return res.status(400).json({
      success: false,
      error: "Название папки обязательно и не может быть пустым."
    });
  }

  try {
    // Создаём папку через сервис
    const result = await createFolder({
      folderName: folderName.trim(),
      parentId: parentId?.trim()
    });

    Logger.info("Folder created successfully", {
      userId,
      folderId: result.folderId,
      folderName: folderName.trim(),
      parentId: parentId || "root"
    });

    return res.json({
      success: true,
      folderId: result.folderId,
      webViewLink: result.webViewLink
    });
  } catch (error: any) {
    const errorMessage = String(error?.message ?? error);
    const errorCode = error?.code;

    Logger.error("Error in /api/google-drive/create-folder", {
      error: errorMessage,
      errorCode,
      userId,
      folderName,
      parentId,
      stack: error?.stack
    });

    // Обработка специфичных ошибок Google Drive
    if (errorMessage.includes("GOOGLE_DRIVE_CREDENTIALS_NOT_CONFIGURED")) {
      return res.status(503).json({
        success: false,
        error: "Google Drive не настроен. Добавьте GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_AUTH_FAILED")) {
      return res.status(503).json({
        success: false,
        error: "Ошибка аутентификации Google Drive. Проверьте правильность credentials в backend/.env"
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_INVALID_FOLDER_NAME")) {
      return res.status(400).json({
        success: false,
        error: errorMessage.replace("GOOGLE_DRIVE_INVALID_FOLDER_NAME: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_PARENT_NOT_FOUND")) {
      return res.status(400).json({
        success: false,
        error: errorMessage.replace("GOOGLE_DRIVE_PARENT_NOT_FOUND: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_PARENT_PERMISSION_DENIED")) {
      return res.status(403).json({
        success: false,
        error: errorMessage.replace("GOOGLE_DRIVE_PARENT_PERMISSION_DENIED: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_PERMISSION_DENIED")) {
      return res.status(403).json({
        success: false,
        error: errorMessage.replace("GOOGLE_DRIVE_PERMISSION_DENIED: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_QUOTA_EXCEEDED")) {
      return res.status(429).json({
        success: false,
        error: errorMessage.replace("GOOGLE_DRIVE_QUOTA_EXCEEDED: ", "")
      });
    }

    if (errorMessage.includes("GOOGLE_DRIVE_CREATE_FOLDER_FAILED")) {
      return res.status(500).json({
        success: false,
        error: errorMessage.replace("GOOGLE_DRIVE_CREATE_FOLDER_FAILED: ", "")
      });
    }

    // Общая ошибка
    return res.status(500).json({
      success: false,
      error: errorMessage || "Неизвестная ошибка при создании папки в Google Drive"
    });
  }
});

export default router;





