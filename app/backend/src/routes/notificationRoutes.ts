import { Router } from "express";
import { notificationRepository } from "../repositories/notificationRepo";
import { Logger } from "../utils/logger";
import { authRequired } from "../middleware/auth";

const router = Router();

/**
 * GET /api/notifications
 * Получить список уведомлений для текущего пользователя
 */
router.get("/", authRequired, async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const status = req.query.status as "success" | "error" | "info" | undefined;
    const isRead = req.query.isRead === "true" ? true : req.query.isRead === "false" ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const notifications = await notificationRepository.findByUserId(userId, {
      status,
      isRead,
      limit: Math.min(limit, 100), // Максимум 100
      offset
    });

    return res.json({
      notifications,
      total: notifications.length,
      limit,
      offset
    });
  } catch (error) {
    Logger.error("Failed to fetch notifications", {
      error: error instanceof Error ? error.message : String(error),
      userId
    });
    return res.status(500).json({
      error: "FAILED_TO_FETCH_NOTIFICATIONS",
      message: "Не удалось получить уведомления"
    });
  }
});

/**
 * GET /api/notifications/unread-count
 * Получить количество непрочитанных уведомлений
 */
router.get("/unread-count", authRequired, async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const count = await notificationRepository.countUnread(userId);
    return res.json({ count });
  } catch (error) {
    Logger.error("Failed to count unread notifications", {
      error: error instanceof Error ? error.message : String(error),
      userId
    });
    return res.status(500).json({
      error: "FAILED_TO_COUNT_UNREAD",
      message: "Не удалось подсчитать непрочитанные уведомления"
    });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Пометить одно уведомление как прочитанное
 */
router.patch("/:id/read", authRequired, async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const notificationId = req.params.id;
  if (!notificationId) {
    return res.status(400).json({ error: "Notification ID is required" });
  }

  try {
    await notificationRepository.markAsRead(notificationId, userId);
    return res.json({ success: true });
  } catch (error) {
    Logger.error("Failed to mark notification as read", {
      error: error instanceof Error ? error.message : String(error),
      notificationId,
      userId
    });
    return res.status(500).json({
      error: "FAILED_TO_MARK_AS_READ",
      message: "Не удалось пометить уведомление как прочитанное"
    });
  }
});

/**
 * PATCH /api/notifications/read-all
 * Пометить все уведомления как прочитанные
 */
router.patch("/read-all", authRequired, async (req, res) => {
  const userId = req.user?.uid;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await notificationRepository.markAllAsRead(userId);
    return res.json({ success: true });
  } catch (error) {
    Logger.error("Failed to mark all notifications as read", {
      error: error instanceof Error ? error.message : String(error),
      userId
    });
    return res.status(500).json({
      error: "FAILED_TO_MARK_ALL_AS_READ",
      message: "Не удалось пометить все уведомления как прочитанные"
    });
  }
});

export default router;



