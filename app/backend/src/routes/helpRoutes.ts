import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { Logger } from "../utils/logger";
import { explainFieldWithOpenAI, explainSectionWithOpenAI } from "../services/help/openaiFieldHelp";

const router = Router();

/**
 * POST /api/help/explain-field
 * 
 * Объясняет поле формы через OpenAI на основе контекста канала и страницы.
 * 
 * ТРЕБУЕТ АВТОРИЗАЦИЮ:
 * - Заголовок: Authorization: Bearer <firebase-id-token>
 */
router.post("/explain-field", authRequired, async (req, res) => {
  try {
    const { fieldKey, page, userQuestion, currentValue, channelContext } = req.body;

    if (!fieldKey || !page || !userQuestion) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "Отсутствуют обязательные параметры: fieldKey, page или userQuestion"
      });
    }

    Logger.info("explain-field request", {
      userId: req.user!.uid,
      fieldKey,
      page
    });

    const answer = await explainFieldWithOpenAI({
      fieldKey,
      page,
      userQuestion,
      currentValue,
      channelContext
    });

    return res.json({
      success: true,
      answer,
      fieldKey
    });
  } catch (error: any) {
    Logger.error("explain-field error", error);
    
    // Возвращаем понятное сообщение об ошибке
    const errorMessage = error?.message || "Ошибка при получении объяснения поля";
    
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: errorMessage
    });
  }
});

/**
 * POST /api/help/explain-section
 * 
 * Объясняет секцию страницы настроек через OpenAI на основе контекста.
 * 
 * ТРЕБУЕТ АВТОРИЗАЦИЮ:
 * - Заголовок: Authorization: Bearer <firebase-id-token>
 */
router.post("/explain-section", authRequired, async (req, res) => {
  try {
    const { sectionKey, page, sectionTitle, currentStatus, question, context } = req.body;

    if (!sectionKey) {
      return res.status(400).json({
        success: false,
        error: "MISSING_PARAMS",
        message: "Отсутствует обязательный параметр: sectionKey"
      });
    }

    Logger.info("explain-section request", {
      userId: req.user!.uid,
      sectionKey,
      page,
      sectionTitle
    });

    const answer = await explainSectionWithOpenAI({
      sectionKey,
      page,
      sectionTitle,
      currentStatus,
      question,
      context
    });

    return res.json({
      success: true,
      answer,
      sectionKey
    });
  } catch (error: any) {
    Logger.error("explain-section error", error);
    
    // Возвращаем понятное сообщение об ошибке
    const errorMessage = error?.message || "Ошибка при получении объяснения секции";
    
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: errorMessage
    });
  }
});

export default router;

