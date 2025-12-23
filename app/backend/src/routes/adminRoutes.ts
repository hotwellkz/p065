import express from "express";
import { authRequired } from "../middleware/auth";
import { Logger } from "../utils/logger";

// Проверяем, что пароль настроен при старте сервера
if (!process.env.TELEGRAM_GLOBAL_SWITCH_PASSWORD) {
  Logger.warn("TELEGRAM_GLOBAL_SWITCH_PASSWORD not set in environment variables. Telegram global switch will not work.");
}

const router = express.Router();

/**
 * POST /api/admin/telegram-global/verify
 * Проверяет пароль для доступа к использованию общего Telegram аккаунта
 * Body: { password: string }
 */
router.post("/telegram-global/verify", authRequired, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_REQUEST",
        message: "Пароль не указан"
      });
    }

    const expectedPassword = process.env.TELEGRAM_GLOBAL_SWITCH_PASSWORD;
    
    if (!expectedPassword) {
      Logger.error("TELEGRAM_GLOBAL_SWITCH_PASSWORD not configured in environment");
      return res.status(500).json({
        success: false,
        error: "CONFIGURATION_ERROR",
        message: "Сервер не настроен для проверки пароля"
      });
    }

    const isValid = password === expectedPassword;

    if (!isValid) {
      Logger.info("Invalid password attempt for telegram-global access", {
        userId: req.user!.uid
      });
      return res.status(403).json({
        success: false,
        error: "INVALID_PASSWORD",
        message: "Неверный пароль"
      });
    }

    Logger.info("Password verified for telegram-global access", {
      userId: req.user!.uid
    });

    return res.json({
      success: true,
      message: "Пароль подтверждён"
    });
  } catch (error: any) {
    Logger.error("Failed to verify password", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Ошибка при проверке пароля"
    });
  }
});

export default router;

