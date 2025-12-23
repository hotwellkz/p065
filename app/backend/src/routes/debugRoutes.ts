import { Router } from "express";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";
import { authRequired } from "../middleware/auth";

const router = Router();

/**
 * Debug-эндпоинт для проверки всех каналов и их настроек автоотправки
 * GET /api/debug/auto-send-channels
 */
router.get("/auto-send-channels", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const allChannels: Array<{
      id: string;
      name?: string;
      ownerId: string;
      autoSendEnabled: any;
      autoSendEnabledType: string;
      timezone?: string;
      autoSendSchedules?: any;
      schedulesCount: number;
      schedulesType: string;
      schedulesDetails?: any;
    }> = [];

    // Получаем всех пользователей
    let usersSnapshot;
    try {
      usersSnapshot = await db.collection("users").limit(100).get();
      Logger.info("DEBUG /api/debug/auto-send-channels: found users", {
        count: usersSnapshot.docs.length,
        empty: usersSnapshot.empty,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "not set"
        }
      });
    } catch (error) {
      Logger.error("DEBUG /api/debug/auto-send-channels: ERROR fetching users", {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      return res.status(500).json({
        error: "Failed to fetch users",
        message: error instanceof Error ? error.message : String(error),
        possibleCauses: [
          "Service Account не имеет прав на чтение коллекции 'users'",
          "Проверьте правила безопасности Firestore"
        ]
      });
    }

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const channelsSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("channels")
        .get();

      for (const channelDoc of channelsSnapshot.docs) {
        const channelData = channelDoc.data() as any;
        const autoSendEnabled = channelData.autoSendEnabled;
        const autoSendSchedules = channelData.autoSendSchedules;
        const schedulesCount = Array.isArray(autoSendSchedules) ? autoSendSchedules.length : 0;

        const channelInfo = {
          id: channelDoc.id,
          name: channelData.name,
          ownerId: userId,
          autoSendEnabled: autoSendEnabled,
          autoSendEnabledType: typeof autoSendEnabled,
          timezone: channelData.timezone,
          autoSendSchedules: autoSendSchedules,
          schedulesCount: schedulesCount,
          schedulesType: typeof autoSendSchedules,
          schedulesDetails: Array.isArray(autoSendSchedules)
            ? autoSendSchedules.map((s: any) => ({
                id: s.id,
                enabled: s.enabled,
                daysOfWeek: s.daysOfWeek,
                time: s.time,
                promptsPerRun: s.promptsPerRun,
                lastRunAt: s.lastRunAt
              }))
            : null
        };

        allChannels.push(channelInfo);
      }
    }

    // Логируем в консоль для отладки
    Logger.info("DEBUG /api/debug/auto-send-channels: all channels", {
      totalChannels: allChannels.length,
      channelsWithAutoSendEnabled: allChannels.filter(
        (c) => c.autoSendEnabled === true
      ).length,
      channelsWithSchedules: allChannels.filter(
        (c) => Array.isArray(c.autoSendSchedules) && c.autoSendSchedules.length > 0
      ).length,
      sampleChannels: allChannels.slice(0, 5).map((c) => ({
        id: c.id,
        name: c.name,
        autoSendEnabled: c.autoSendEnabled,
        autoSendEnabledType: c.autoSendEnabledType,
        schedulesCount: c.schedulesCount
      }))
    });

    return res.json({
      success: true,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "not set"
      },
      totalChannels: allChannels.length,
      channelsWithAutoSendEnabled: allChannels.filter(
        (c) => c.autoSendEnabled === true
      ).length,
      channelsWithSchedules: allChannels.filter(
        (c) => Array.isArray(c.autoSendSchedules) && c.autoSendSchedules.length > 0
      ).length,
      channels: allChannels
    });
  } catch (error) {
    Logger.error("DEBUG /api/debug/auto-send-channels: error", error);
    return res.status(500).json({
      error: "Failed to fetch channels",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;

