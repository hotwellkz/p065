import { Router } from "express";
import { google } from "googleapis";
import { Logger } from "../utils/logger";
import { saveUserOAuthTokens } from "../repositories/userOAuthTokensRepo";
import { authRequired } from "../middleware/auth";

const router = Router();

// Создаём OAuth2 клиент
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "http://localhost:8080/api/auth/google/callback";

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_NOT_CONFIGURED: Google OAuth credentials are not configured. " +
      "Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in backend/.env"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Scopes для Google Drive
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive"
];

/**
 * GET /api/auth/user-id
 * Возвращает userId текущего авторизованного пользователя
 */
router.get("/user-id", authRequired, (req, res) => {
  res.json({
    userId: req.user!.uid,
    email: req.user!.email
  });
});

/**
 * GET /api/auth/google
 * Перенаправляет пользователя на страницу авторизации Google
 * userId можно передать через query параметр или через авторизацию
 */
router.get("/google", (req, res) => {
  try {
    // Пробуем получить userId из query параметра или из авторизации
    let userId: string | undefined;
    
    if (req.query.userId && typeof req.query.userId === "string") {
      userId = req.query.userId;
    } else if (req.user?.uid) {
      userId = req.user.uid;
    }
    
    if (!userId) {
      return res.status(400).json({
        error: "Missing userId",
        message: "userId is required. Pass it as query parameter: ?userId=YOUR_USER_ID",
        instructions: [
          "1. Получите ваш Firebase User ID",
          "2. Откройте: http://localhost:8080/api/auth/google?userId=YOUR_USER_ID",
          "3. Или авторизуйтесь через API с токеном в заголовке Authorization: Bearer YOUR_TOKEN"
        ]
      });
    }
    
    const oauth2Client = getOAuth2Client();
    
    // Сохраняем userId в state для получения в callback
    const state = Buffer.from(JSON.stringify({ userId })).toString('base64');
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline", // Получаем refresh token
      scope: SCOPES,
      prompt: "consent", // Принудительно показываем consent screen для получения refresh token
      state: state // Передаём userId через state
    });

    Logger.info("Google OAuth authorization URL generated", { userId });
    res.redirect(authUrl);
  } catch (error) {
    Logger.error("Failed to generate Google OAuth URL", error);
    res.status(500).json({
      error: "Failed to initialize Google OAuth",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * GET /api/auth/google/callback
 * Обрабатывает callback от Google OAuth
 * Сохраняет токены в Firestore для пользователя из state
 */
router.get("/google/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        error: "Missing authorization code",
        message: "Authorization code is required"
      });
    }

    // Получаем userId из state
    let userId: string;
    if (state && typeof state === "string") {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        userId = stateData.userId;
      } catch {
        return res.status(400).json({
          error: "Invalid state parameter",
          message: "State parameter is invalid or corrupted"
        });
      }
    } else {
      return res.status(400).json({
        error: "Missing state parameter",
        message: "State parameter is required to identify user"
      });
    }

    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    Logger.info("Google OAuth tokens received", {
      userId,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expiry_date
    });

    // Сохраняем токены в Firestore
    try {
      await saveUserOAuthTokens(userId, {
        access_token: tokens.access_token ?? undefined,
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined
      });
      
      Logger.info("OAuth tokens saved to Firestore", { userId });
    } catch (saveError) {
      Logger.error("Failed to save OAuth tokens to Firestore", saveError);
      // Продолжаем, даже если не удалось сохранить
    }

    // Возвращаем успешный ответ
    res.json({
      success: true,
      message: "Authorization successful. Tokens saved.",
      tokens: {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null
      },
      note: "Теперь вы можете загружать файлы в Google Drive через API"
    });
  } catch (error) {
    Logger.error("Failed to exchange authorization code for tokens", error);
    res.status(500).json({
      error: "Failed to complete OAuth flow",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * POST /api/auth/google/refresh
 * Обновляет access token используя refresh token
 */
router.post("/google/refresh", async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: "Missing refresh token",
        message: "refresh_token is required"
      });
    }

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token });

    const { credentials } = await oauth2Client.refreshAccessToken();

    Logger.info("Google OAuth access token refreshed");

    res.json({
      success: true,
      tokens: {
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date
      }
    });
  } catch (error) {
    Logger.error("Failed to refresh access token", error);
    res.status(500).json({
      error: "Failed to refresh access token",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;

