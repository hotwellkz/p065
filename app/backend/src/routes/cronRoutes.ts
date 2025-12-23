import { Router } from "express";
import { processAutoSendTick } from "../services/autoSendScheduler";
import { processBlottataTick } from "../services/blottataDriveMonitor";
import { Logger } from "../utils/logger";

const router = Router();
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Эндпоинт для ручного запуска планировщика (используется Cloud Scheduler)
 * Защищён секретным токеном
 */
router.post("/manual-tick", async (req, res) => {
  if (!CRON_SECRET) {
    Logger.warn("CRON_SECRET is not configured, manual-tick endpoint is disabled");
    return res.status(500).json({ error: "CRON_SECRET is not configured" });
  }

  const token = req.headers["x-cron-secret"];
  if (token !== CRON_SECRET) {
    Logger.warn("Unauthorized access attempt to /api/cron/manual-tick");
    return res.status(403).json({ error: "Forbidden" });
  }

  Logger.info("Manual tick triggered via HTTP endpoint");

  try {
    await processAutoSendTick();
    return res.json({ success: true, message: "Auto-send tick completed" });
  } catch (error) {
    Logger.error("Error in manual tick", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Эндпоинт для ручного запуска Blottata мониторинга (используется Cloud Scheduler)
 * Защищён секретным токеном
 */
router.post("/blottata-tick", async (req, res) => {
  if (!CRON_SECRET) {
    Logger.warn("CRON_SECRET is not configured, blottata-tick endpoint is disabled");
    return res.status(500).json({ error: "CRON_SECRET is not configured" });
  }

  const token = req.headers["x-cron-secret"];
  if (token !== CRON_SECRET) {
    Logger.warn("Unauthorized access attempt to /api/cron/blottata-tick");
    return res.status(403).json({ error: "Forbidden" });
  }

  Logger.info("Blottata tick triggered via HTTP endpoint");

  try {
    await processBlottataTick();
    return res.json({ success: true, message: "Blottata monitoring tick completed" });
  } catch (error) {
    Logger.error("Error in Blottata tick", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

/**
 * Старый эндпоинт для обратной совместимости
 * @deprecated Используйте /api/cron/manual-tick
 */
router.post("/sendScheduledPrompts", async (req, res) => {
  Logger.warn("/api/cron/sendScheduledPrompts is deprecated, use /api/cron/manual-tick");
  
  if (!CRON_SECRET) {
    return res.status(500).json({ error: "CRON_SECRET is not configured" });
  }

  const token = req.headers["x-cron-secret"];
  if (token !== CRON_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    await processAutoSendTick();
    return res.json({ success: true, message: "Scheduled prompts sent" });
  } catch (error) {
    Logger.error("Error in sendScheduledPrompts", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

export default router;






