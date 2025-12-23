import { google } from "googleapis";
import { Logger } from "../utils/logger";
import {
  findGoogleDriveIntegrationByUserId,
  createGoogleDriveIntegration,
  updateGoogleDriveIntegration,
  deleteGoogleDriveIntegration
} from "../repositories/googleDriveIntegrationRepo";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_OAUTH_REDIRECT_URL = process.env.GOOGLE_OAUTH_REDIRECT_URL;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_OAUTH_REDIRECT_URL) {
  Logger.warn("Google OAuth credentials not fully configured. Some features may not work.");
}

// Версия scopes для отслеживания миграций
export const SCOPES_VERSION = 2;

const scopes = [
  "https://www.googleapis.com/auth/drive", // Полный доступ к Google Drive
  "https://www.googleapis.com/auth/userinfo.email", // Email пользователя
  "openid" // OpenID Connect
];

/**
 * Создаёт OAuth2 клиент для Google
 */
function createOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_OAUTH_REDIRECT_URL) {
    throw new Error("Google OAuth credentials not configured");
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URL
  );
}

/**
 * Генерирует URL для авторизации Google OAuth
 */
export async function generateAuthUrl(): Promise<string> {
  const oauth2Client = createOAuth2Client();
  
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Важно: запрашиваем refresh_token
    scope: scopes
  });

  Logger.info("Generated Google OAuth auth URL");
  return url;
}

/**
 * Обрабатывает callback от Google OAuth и сохраняет токены
 */
export async function handleOAuthCallback(
  userId: string,
  code: string
): Promise<{ email?: string }> {
  const oauth2Client = createOAuth2Client();

  try {
    // Обмениваем код на токены
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error("No access token received from Google");
    }

    Logger.info("Received tokens from Google OAuth", {
      userId,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date
    });

    // Получаем email пользователя
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
    let email: string | undefined;
    
    try {
      const { data } = await oauth2.userinfo.get();
      email = data.email || undefined;
      Logger.info("Retrieved user email from Google", { userId, email });
    } catch (emailError: any) {
      Logger.warn("Failed to retrieve user email from Google", {
        userId,
        error: emailError?.message || String(emailError)
      });
      // Продолжаем без email
    }

    // Проверяем, есть ли уже интеграция
    const existingIntegration = await findGoogleDriveIntegrationByUserId(userId);

    const expiryDate = tokens.expiry_date 
      ? tokens.expiry_date 
      : Date.now() + 3600 * 1000; // По умолчанию 1 час, если не указано

    if (existingIntegration) {
      // Обновляем существующую интеграцию
      await updateGoogleDriveIntegration(existingIntegration.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existingIntegration.refreshToken,
        expiryDate,
        email: email || existingIntegration.email,
        status: "active",
        lastError: null,
        scopesVersion: SCOPES_VERSION
      });
      
      Logger.info("Google Drive integration updated", {
        userId,
        integrationId: existingIntegration.id,
        email: email || existingIntegration.email
      });
    } else {
      // Создаём новую интеграцию
      if (!tokens.refresh_token) {
        throw new Error("No refresh token received. Please revoke access and reconnect.");
      }

      await createGoogleDriveIntegration(
        userId,
        tokens.access_token,
        tokens.refresh_token,
        expiryDate,
        email,
        SCOPES_VERSION
      );
      
      Logger.info("Google Drive integration created", {
        userId,
        email: email || "not provided"
      });
    }

    return { email };
  } catch (error: any) {
    Logger.error("Error handling Google OAuth callback", {
      userId,
      error: error?.message || String(error),
      errorCode: error?.code
    });
    throw error;
  }
}

/**
 * Получает статус интеграции Google Drive для пользователя
 */
export async function getIntegrationStatus(userId: string): Promise<{
  connected: boolean;
  email?: string;
}> {
  try {
    const integration = await findGoogleDriveIntegrationByUserId(userId);
    
    if (!integration || integration.status !== "active") {
      return { connected: false };
    }

    return {
      connected: true,
      email: integration.email
    };
  } catch (error: any) {
    Logger.error("Error getting Google Drive integration status", {
      userId,
      error: error?.message || String(error)
    });
    return { connected: false };
  }
}

/**
 * Получает валидный access token для пользователя (обновляет при необходимости)
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const integration = await findGoogleDriveIntegrationByUserId(userId);
  
  if (!integration || integration.status !== "active") {
    throw new Error("Google Drive integration not found or not active");
  }

  const now = Date.now();
  const isExpired = integration.expiryDate < now;

  // Если токен не истёк, возвращаем его
  if (!isExpired) {
    return integration.accessToken;
  }

  // Токен истёк, обновляем его
  Logger.info("Access token expired, refreshing", {
    userId,
    integrationId: integration.id,
    expiryDate: new Date(integration.expiryDate).toISOString()
  });

  if (!integration.refreshToken) {
    // Помечаем интеграцию как ошибку
    await updateGoogleDriveIntegration(integration.id, {
      status: "error",
      lastError: "Refresh token not available"
    });
    throw new Error("Refresh token not available. Please reconnect Google Drive.");
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: integration.refreshToken
  });

  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token) {
      throw new Error("No access token received after refresh");
    }

    const newExpiryDate = credentials.expiry_date 
      ? credentials.expiry_date 
      : Date.now() + 3600 * 1000;

    // Сохраняем обновлённые токены
    await updateGoogleDriveIntegration(integration.id, {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || integration.refreshToken,
      expiryDate: newExpiryDate,
      status: "active",
      lastError: null
    });

    Logger.info("Access token refreshed successfully", {
      userId,
      integrationId: integration.id,
      newExpiryDate: new Date(newExpiryDate).toISOString()
    });

    return credentials.access_token;
  } catch (error: any) {
    Logger.error("Failed to refresh access token", {
      userId,
      integrationId: integration.id,
      error: error?.message || String(error),
      errorCode: error?.code
    });

    // Помечаем интеграцию как ошибку
    await updateGoogleDriveIntegration(integration.id, {
      status: "error",
      lastError: `Token refresh failed: ${error?.message || String(error)}`
    });

    throw new Error(`Failed to refresh access token: ${error?.message || String(error)}`);
  }
}

/**
 * Отключает интеграцию Google Drive для пользователя
 */
export async function disconnectIntegration(userId: string): Promise<void> {
  try {
    const integration = await findGoogleDriveIntegrationByUserId(userId);
    
    if (!integration) {
      Logger.info("No Google Drive integration found to disconnect", { userId });
      return;
    }

    // Пытаемся отозвать токен у Google (необязательно, но желательно)
    try {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({
        refresh_token: integration.refreshToken
      });
      await oauth2Client.revokeCredentials();
      Logger.info("Google OAuth credentials revoked", { userId });
    } catch (revokeError: any) {
      Logger.warn("Failed to revoke Google OAuth credentials (non-critical)", {
        userId,
        error: revokeError?.message || String(revokeError)
      });
      // Продолжаем удаление даже если отзыв не удался
    }

    // Удаляем интеграцию из БД
    await deleteGoogleDriveIntegration(integration.id);
    
    Logger.info("Google Drive integration disconnected", {
      userId,
      integrationId: integration.id
    });
  } catch (error: any) {
    Logger.error("Error disconnecting Google Drive integration", {
      userId,
      error: error?.message || String(error)
    });
    throw error;
  }
}

