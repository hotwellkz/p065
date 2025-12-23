import type { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { Logger } from "../utils/logger";

export interface AuthUser {
  uid: string;
  email?: string;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Middleware для проверки Firebase ID Token через Firebase Admin SDK.
 * 
 * Требует заголовок: Authorization: Bearer <firebase-id-token>
 * 
 * При успешной проверке:
 * - В req.user сохраняется информация о пользователе (uid, email)
 * - Запрос проходит дальше
 * 
 * При ошибке:
 * - Возвращает 401 с JSON { error: "Unauthorized" | "Invalid token" | ... }
 * - Логирует причину ошибки в консоль
 */
export async function authRequired(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  // Проверяем наличие заголовка Authorization
  if (!authHeader?.startsWith("Bearer ")) {
    Logger.warn("authRequired: missing or invalid Authorization header", {
      hasHeader: !!authHeader,
      headerValue: authHeader ? `${authHeader.substring(0, 20)}...` : "none",
      method: req.method,
      path: req.path
    });
    res.status(401).json({ 
      error: "Unauthorized", 
      message: "Missing or invalid Authorization header" 
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  // Проверяем, что Firebase Admin инициализирован
  if (!admin.apps.length) {
    Logger.error("authRequired: Firebase Admin not initialized");
    res.status(500).json({ 
      error: "Internal server error", 
      message: "Authentication service unavailable" 
    });
    return;
  }

  try {
    // Верифицируем токен через Firebase Admin SDK
    // Это проверяет подпись токена и его валидность
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Сохраняем информацию о пользователе в req.user
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email
    };

    // Успешная авторизация - логируем для отладки
    Logger.info("authRequired: token verified successfully", {
      uid: decodedToken.uid,
      email: decodedToken.email || "not provided",
      method: req.method,
      path: req.path
    });

    // Передаём управление следующему middleware/роуту
    next();
  } catch (error) {
    // Обрабатываем различные типы ошибок Firebase Auth
    let errorMessage = "Invalid token";
    let logMessage = "authRequired: token verification failed";
    let errorCode = "INVALID_TOKEN";

    if (error instanceof Error) {
      if (error.message.includes("expired")) {
        errorMessage = "Token expired";
        logMessage = "authRequired: token expired";
        errorCode = "TOKEN_EXPIRED";
      } else if (error.message.includes("revoked")) {
        errorMessage = "Token revoked";
        logMessage = "authRequired: token revoked";
        errorCode = "TOKEN_REVOKED";
      } else if (error.message.includes("invalid")) {
        errorMessage = "Invalid token";
        logMessage = "authRequired: invalid token format";
        errorCode = "INVALID_TOKEN_FORMAT";
      } else {
        errorMessage = error.message;
      }
    }

    Logger.warn(logMessage, {
      error: errorMessage,
      errorCode,
      method: req.method,
      path: req.path,
      tokenPrefix: token.substring(0, 20) + "..."
    });

    res.status(401).json({ 
      error: "Unauthorized", 
      errorCode,
      message: errorMessage 
    });
  }
}


