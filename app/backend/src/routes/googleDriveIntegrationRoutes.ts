import { Router } from "express";
import { authRequired } from "../middleware/auth";
import {
  generateAuthUrl,
  handleOAuthCallback,
  getIntegrationStatus,
  disconnectIntegration,
  getValidAccessToken
} from "../services/GoogleDriveOAuthService";
import { Logger } from "../utils/logger";
import { google } from "googleapis";

const router = Router();

// Тестовый маршрут для диагностики (без авторизации)
router.get("/test", (req, res) => {
  Logger.info("GET /api/google-drive-integration/test: Test route called", {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl
  });
  res.json({ 
    success: true, 
    message: "Google Drive Integration routes are working",
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/google-drive-integration/status
 * Получает статус Google Drive интеграции пользователя
 */
router.get("/status", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    
    Logger.info("GET /api/google-drive-integration/status: Request received", { userId });
    
    const status = await getIntegrationStatus(userId);
    
    Logger.info("GET /api/google-drive-integration/status: Status retrieved", {
      userId,
      connected: status.connected,
      email: status.email
    });
    
    return res.json(status);
  } catch (error: any) {
    Logger.error("Error in /api/google-drive-integration/status", {
      error: error?.message || String(error),
      userId: req.user?.uid
    });
    
    return res.status(500).json({
      error: "FAILED_TO_GET_STATUS",
      message: error.message || "Failed to get Google Drive status"
    });
  }
});

/**
 * GET /api/google-drive-integration/oauth/url
 * Генерирует URL для авторизации Google OAuth
 */
router.get("/oauth/url", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    
    Logger.info("GET /api/google-drive-integration/oauth/url: Request received", { 
      userId,
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl
    });
    
    // Проверяем наличие необходимых env переменных
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URL;
    
    if (!clientId || !clientSecret || !redirectUri) {
      Logger.error("GET /api/google-drive-integration/oauth/url: Missing env variables", {
        userId,
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        hasRedirectUri: !!redirectUri
      });
      
      return res.status(500).json({
        error: "FAILED_TO_GENERATE_AUTH_URL",
        message: "Google OAuth credentials are not configured. Please check backend environment variables."
      });
    }
    
    const authUrl = await generateAuthUrl();
    
    Logger.info("GET /api/google-drive-integration/oauth/url: Auth URL generated successfully", { 
      userId,
      authUrlLength: authUrl.length
    });
    
    return res.json({ authUrl });
  } catch (error: any) {
    Logger.error("Error in /api/google-drive-integration/oauth/url", {
      error: error?.message || String(error),
      errorStack: error?.stack,
      userId: req.user?.uid,
      errorCode: error?.code
    });
    
    return res.status(500).json({
      error: "FAILED_TO_GENERATE_AUTH_URL",
      message: error.message || "Failed to generate auth URL"
    });
  }
});

/**
 * POST /api/google-drive-integration/oauth/callback
 * Обрабатывает callback от Google OAuth
 */
router.post("/oauth/callback", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    const { code } = req.body as { code?: string };
    
    if (!code) {
      return res.status(400).json({
        error: "CODE_REQUIRED",
        message: "Authorization code is required"
      });
    }
    
    Logger.info("POST /api/google-drive-integration/oauth/callback: Processing callback", {
      userId,
      codeLength: code.length
    });
    
    const result = await handleOAuthCallback(userId, code);
    
    Logger.info("POST /api/google-drive-integration/oauth/callback: Integration connected", {
      userId,
      email: result.email
    });
    
    return res.json({
      connected: true,
      email: result.email
    });
  } catch (error: any) {
    Logger.error("Error in /api/google-drive-integration/oauth/callback", {
      error: error?.message || String(error),
      userId: req.user?.uid
    });
    
    return res.status(500).json({
      error: "FAILED_TO_CONNECT",
      message: error.message || "Failed to connect Google Drive"
    });
  }
});

/**
 * POST /api/google-drive-integration/disconnect
 * Отключает Google Drive интеграцию пользователя
 */
router.post("/disconnect", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    
    Logger.info("POST /api/google-drive-integration/disconnect: Request received", { userId });
    
    await disconnectIntegration(userId);
    
    Logger.info("POST /api/google-drive-integration/disconnect: Integration disconnected", { userId });
    
    return res.json({
      connected: false
    });
  } catch (error: any) {
    Logger.error("Error in /api/google-drive-integration/disconnect", {
      error: error?.message || String(error),
      userId: req.user?.uid
    });
    
    return res.status(500).json({
      error: "FAILED_TO_DISCONNECT",
      message: error.message || "Failed to disconnect Google Drive"
    });
  }
});

/**
 * GET /api/google-drive-integration/check-folder?folderId=...
 * Проверяет доступность папки Google Drive для текущего пользователя
 */
router.get("/check-folder", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    const folderId = req.query.folderId as string;
    
    if (!folderId) {
      return res.status(400).json({
        success: false,
        error: "FOLDER_ID_REQUIRED",
        message: "folderId parameter is required"
      });
    }
    
    Logger.info("GET /api/google-drive-integration/check-folder: Request received", {
      userId,
      folderId
    });
    
    // Получаем валидный access token
    const accessToken = await getValidAccessToken(userId);
    
    // Создаём OAuth2 клиент и настраиваем токен
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    // Создаём клиент Drive
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    
    // Получаем информацию об аккаунте
    let email: string | undefined;
    try {
      const about = await drive.about.get({
        fields: "user(emailAddress,displayName)"
      });
      email = about.data.user?.emailAddress || undefined;
    } catch (aboutError: any) {
      Logger.warn("Failed to get account info in check-folder", {
        userId,
        error: aboutError?.message
      });
    }
    
    // Проверяем папку
    try {
      const folderInfo = await drive.files.get({
        fileId: folderId,
        fields: "id, name, mimeType"
      });
      
      const isFolder = folderInfo.data.mimeType === "application/vnd.google-apps.folder";
      
      Logger.info("GET /api/google-drive-integration/check-folder: Folder check successful", {
        userId,
        folderId,
        exists: true,
        isFolder,
        email
      });
      
      return res.json({
        success: true,
        exists: true,
        isFolder,
        accessible: true,
        email,
        folderName: folderInfo.data.name
      });
    } catch (folderError: any) {
      const errorCode = folderError?.code;
      const errorReason = folderError?.response?.data?.error?.errors?.[0]?.reason;
      
      Logger.error("GET /api/google-drive-integration/check-folder: Folder check failed", {
        userId,
        folderId,
        errorCode,
        errorReason,
        email
      });
      
      if (errorCode === 404 || errorReason === "notFound") {
        return res.json({
          success: false,
          exists: false,
          isFolder: false,
          accessible: false,
          email,
          error: "FOLDER_NOT_FOUND",
          message: "Папка не найдена"
        });
      }
      
      if (errorCode === 403 || errorReason === "forbidden" || errorReason === "insufficientFilePermissions") {
        return res.json({
          success: false,
          exists: true,
          isFolder: false,
          accessible: false,
          email,
          error: "FOLDER_ACCESS_DENIED",
          message: "Нет доступа к папке"
        });
      }
      
      return res.status(500).json({
        success: false,
        exists: false,
        isFolder: false,
        accessible: false,
        email,
        error: "FOLDER_CHECK_ERROR",
        message: folderError?.message || "Ошибка при проверке папки"
      });
    }
  } catch (error: any) {
    Logger.error("Error in /api/google-drive-integration/check-folder", {
      error: error?.message || String(error),
      userId: req.user?.uid
    });
    
    return res.status(500).json({
      success: false,
      exists: false,
      isFolder: false,
      accessible: false,
      error: "CHECK_FAILED",
      message: error.message || "Failed to check folder"
    });
  }
});

export default router;

