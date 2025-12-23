import { Router } from "express";
import { authRequired } from "../middleware/auth";
import {
  requestCode,
  confirmCode,
  disconnectTelegram,
  getIntegrationStatus
} from "../services/TelegramUserService";
import {
  findTelegramIntegrationByUserId,
  updateTelegramIntegration
} from "../repositories/telegramUserIntegrationRepo";
import { Logger } from "../utils/logger";

const router = Router();

/**
 * POST /api/telegram/request-code
 * Запрашивает код подтверждения для номера телефона
 */
router.post("/request-code", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    const { phoneNumber } = req.body as { phoneNumber?: string };

    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber is required" });
    }

    // Валидация номера телефона (базовая)
    if (!/^\+?[1-9]\d{1,14}$/.test(phoneNumber.replace(/\s/g, ""))) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    const result = await requestCode(userId, phoneNumber);
    
    return res.json({
      status: "code_sent",
      phoneCodeHash: result.phoneCodeHash
    });
  } catch (error: any) {
    Logger.error("Error in /api/telegram/request-code", error);
    
    if (error.message === "Telegram already connected") {
      return res.status(400).json({ error: "TELEGRAM_ALREADY_CONNECTED" });
    }
    
    if (error.message?.includes("FLOOD_WAIT")) {
      return res.status(429).json({ 
        error: "FLOOD_WAIT",
        message: "Too many requests, please wait before trying again"
      });
    }

    return res.status(500).json({ 
      error: "FAILED_TO_REQUEST_CODE",
      message: error.message || "Failed to request code"
    });
  }
});

/**
 * POST /api/telegram/confirm-code
 * Подтверждает код и завершает авторизацию
 */
router.post("/confirm-code", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    const { code, password } = req.body as { code?: string; password?: string };

    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    // Валидация кода (обычно 5-6 цифр)
    if (!/^\d{5,6}$/.test(code)) {
      return res.status(400).json({ error: "Invalid code format" });
    }

    await confirmCode(userId, code, password);
    
    Logger.info("confirm-code: Code confirmed successfully", { userId });
    
    return res.json({
      success: true,
      status: "connected",
      message: "Telegram successfully connected"
    });
  } catch (error: any) {
    Logger.error("Error in /api/telegram/confirm-code", error);
    
    if (error.message === "PHONE_CODE_INVALID") {
      return res.status(400).json({ 
        error: "PHONE_CODE_INVALID",
        message: "Invalid verification code"
      });
    }
    
    if (error.message === "PHONE_CODE_EXPIRED") {
      return res.status(400).json({ 
        error: "PHONE_CODE_EXPIRED",
        message: "Verification code expired, please request a new one"
      });
    }
    
    if (error.message === "PASSWORD_REQUIRED_FOR_2FA") {
      return res.status(400).json({ 
        error: "PASSWORD_REQUIRED_FOR_2FA",
        message: "This account requires 2FA password. Please provide password."
      });
    }
    
    if (error.message === "PASSWORD_INVALID") {
      return res.status(400).json({ 
        error: "PASSWORD_INVALID",
        message: "Invalid 2FA password"
      });
    }
    
    if (error.message?.includes("FLOOD_WAIT")) {
      return res.status(429).json({ 
        error: "FLOOD_WAIT",
        message: "Too many attempts, please wait before trying again"
      });
    }
    
    if (error.message === "No pending authorization found") {
      return res.status(400).json({ 
        error: "NO_PENDING_AUTHORIZATION",
        message: "No pending authorization found. Please request a code first."
      });
    }
    
    if (error.message === "AUTH_CLIENT_EXPIRED" || error.message === "Authorization client expired, please request code again") {
      return res.status(400).json({ 
        success: false,
        errorCode: "AUTH_CLIENT_EXPIRED",
        message: "Authorization client expired, please request code again"
      });
    }

    return res.status(500).json({ 
      error: "FAILED_TO_CONFIRM_CODE",
      message: error.message || "Failed to confirm code"
    });
  }
});

/**
 * POST /api/telegram/disconnect
 * Отключает Telegram интеграцию пользователя
 */
router.post("/disconnect", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    
    await disconnectTelegram(userId);
    
    return res.json({
      status: "disconnected",
      message: "Telegram successfully disconnected"
    });
  } catch (error: any) {
    Logger.error("Error in /api/telegram/disconnect", error);
    
    return res.status(500).json({ 
      error: "FAILED_TO_DISCONNECT",
      message: error.message || "Failed to disconnect Telegram"
    });
  }
});

/**
 * GET /api/telegram-integration/status
 * Получает статус Telegram интеграции пользователя
 */
router.get("/status", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    
    Logger.info("GET /api/telegram-integration/status: Request received", { userId });
    
    const status = await getIntegrationStatus(userId);
    
    Logger.info("GET /api/telegram-integration/status: Status retrieved", {
      userId,
      status: status.status,
      hasPhoneNumber: !!status.phoneNumber
    });
    
    return res.json(status);
  } catch (error: any) {
    Logger.error("Error in /api/telegram-integration/status", {
      error: error?.message || String(error),
      stack: error?.stack,
      userId: req.user?.uid
    });
    
    // Если Firestore недоступен, возвращаем статус "not_connected"
    if (error.message?.includes("Firestore is not available")) {
      Logger.warn("GET /api/telegram-integration/status: Firestore not available, returning not_connected");
      return res.json({ status: "not_connected" });
    }
    
    return res.status(500).json({ 
      error: "FAILED_TO_GET_STATUS",
      message: error.message || "Failed to get Telegram status"
    });
  }
});

/**
 * POST /api/telegram-integration/reset
 * Сбрасывает Telegram интеграцию пользователя
 */
router.post("/reset", authRequired, async (req, res) => {
  try {
    const userId = req.user!.uid;
    
    // Сбрасываем интеграцию
    const integration = await findTelegramIntegrationByUserId(userId);
    if (integration) {
      await updateTelegramIntegration(integration.id, {
        status: "not_connected",
        lastError: null,
        meta: null
      });
    }
    
    return res.json({
      success: true,
      message: "Telegram integration reset successfully"
    });
  } catch (error: any) {
    Logger.error("Error in /api/telegram-integration/reset", error);
    
    return res.status(500).json({ 
      success: false,
      error: "FAILED_TO_RESET",
      message: error.message || "Failed to reset Telegram integration"
    });
  }
});

export default router;

