import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";

const router = Router();

export interface ScheduleSettings {
  // Старое поле для обратной совместимости (deprecated, используйте minInterval_00_13, minInterval_13_17, minInterval_17_24)
  minIntervalMinutes?: number;
  // Новые поля для интервалов по времени суток (в минутах)
  minInterval_00_13?: number; // 00:00–13:00
  minInterval_13_17?: number; // 13:00–17:00
  minInterval_17_24?: number; // 17:00–24:00
  conflictsCheckEnabled: boolean;
  isAutomationPaused: boolean; // Пауза автоматизации публикаций
}

const DEFAULT_SETTINGS: ScheduleSettings = {
  minIntervalMinutes: 11,
  minInterval_00_13: 11,
  minInterval_13_17: 11,
  minInterval_17_24: 11,
  conflictsCheckEnabled: true,
  isAutomationPaused: false
};

function getSettingsDocRef(userId: string) {
  // Храним настройки в подколлекции settings внутри документа пользователя
  return db!
    .collection("users")
    .doc(userId)
    .collection("settings")
    .doc("schedule");
}

/**
 * GET /api/schedule/settings
 * Возвращает настройки расписания для текущего пользователя
 */
router.get("/settings", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const docRef = getSettingsDocRef(userId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return res.json(DEFAULT_SETTINGS);
    }

    const data = snap.data() as Partial<ScheduleSettings> | undefined;

    // Миграция: если есть старое поле minIntervalMinutes, но нет новых полей, копируем его во все три
    const oldInterval = typeof data?.minIntervalMinutes === "number" 
      ? data.minIntervalMinutes 
      : DEFAULT_SETTINGS.minIntervalMinutes;

    const settings: ScheduleSettings = {
      minIntervalMinutes: oldInterval, // Оставляем для обратной совместимости
      minInterval_00_13: typeof data?.minInterval_00_13 === "number"
        ? data.minInterval_00_13
        : (typeof data?.minIntervalMinutes === "number" ? data.minIntervalMinutes : DEFAULT_SETTINGS.minInterval_00_13),
      minInterval_13_17: typeof data?.minInterval_13_17 === "number"
        ? data.minInterval_13_17
        : (typeof data?.minIntervalMinutes === "number" ? data.minIntervalMinutes : DEFAULT_SETTINGS.minInterval_13_17),
      minInterval_17_24: typeof data?.minInterval_17_24 === "number"
        ? data.minInterval_17_24
        : (typeof data?.minIntervalMinutes === "number" ? data.minIntervalMinutes : DEFAULT_SETTINGS.minInterval_17_24),
      conflictsCheckEnabled:
        typeof data?.conflictsCheckEnabled === "boolean"
          ? data.conflictsCheckEnabled
          : DEFAULT_SETTINGS.conflictsCheckEnabled,
      isAutomationPaused:
        typeof data?.isAutomationPaused === "boolean"
          ? data.isAutomationPaused
          : DEFAULT_SETTINGS.isAutomationPaused
    };

    res.json(settings);
  } catch (error: any) {
    Logger.error("Failed to get schedule settings", {
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при получении настроек расписания"
    });
  }
});

/**
 * PATCH /api/schedule/settings
 * Обновляет настройки расписания для текущего пользователя
 */
router.patch("/settings", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { 
      minIntervalMinutes, 
      minInterval_00_13, 
      minInterval_13_17, 
      minInterval_17_24,
      conflictsCheckEnabled,
      isAutomationPaused
    } = req.body as Partial<ScheduleSettings>;

    const updates: Partial<ScheduleSettings> = {};

    // Валидация и обновление старых полей (для обратной совместимости)
    if (typeof minIntervalMinutes !== "undefined") {
      if (
        typeof minIntervalMinutes !== "number" ||
        !Number.isFinite(minIntervalMinutes) ||
        !Number.isInteger(minIntervalMinutes)
      ) {
        return res.status(400).json({
          error: "Invalid request",
          message: "minIntervalMinutes должен быть целым числом"
        });
      }

      const clamped = Math.max(1, Math.min(60, minIntervalMinutes));
      updates.minIntervalMinutes = clamped;
    }

    // Валидация и обновление новых полей
    const validateInterval = (value: number | undefined, fieldName: string): number | undefined => {
      if (typeof value === "undefined") return undefined;
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        !Number.isInteger(value)
      ) {
        throw new Error(`${fieldName} должен быть целым числом`);
      }
      return Math.max(1, Math.min(60, value));
    };

    try {
      if (typeof minInterval_00_13 !== "undefined") {
        updates.minInterval_00_13 = validateInterval(minInterval_00_13, "minInterval_00_13");
      }
      if (typeof minInterval_13_17 !== "undefined") {
        updates.minInterval_13_17 = validateInterval(minInterval_13_17, "minInterval_13_17");
      }
      if (typeof minInterval_17_24 !== "undefined") {
        updates.minInterval_17_24 = validateInterval(minInterval_17_24, "minInterval_17_24");
      }
    } catch (validationError: any) {
      return res.status(400).json({
        error: "Invalid request",
        message: validationError.message
      });
    }

    if (typeof conflictsCheckEnabled !== "undefined") {
      if (typeof conflictsCheckEnabled !== "boolean") {
        return res.status(400).json({
          error: "Invalid request",
          message: "conflictsCheckEnabled должен быть boolean"
        });
      }
      updates.conflictsCheckEnabled = conflictsCheckEnabled;
    }

    if (typeof isAutomationPaused !== "undefined") {
      if (typeof isAutomationPaused !== "boolean") {
        return res.status(400).json({
          error: "Invalid request",
          message: "isAutomationPaused должен быть boolean"
        });
      }
      updates.isAutomationPaused = isAutomationPaused;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Не переданы поля для обновления"
      });
    }

    const docRef = getSettingsDocRef(userId);
    await docRef.set(updates, { merge: true });

    const snap = await docRef.get();
    const data = snap.data() as Partial<ScheduleSettings> | undefined;

    // Миграция: если есть старое поле, но нет новых, копируем его
    const oldInterval = typeof data?.minIntervalMinutes === "number" 
      ? data.minIntervalMinutes 
      : DEFAULT_SETTINGS.minIntervalMinutes;

    const settings: ScheduleSettings = {
      minIntervalMinutes: oldInterval,
      minInterval_00_13: typeof data?.minInterval_00_13 === "number"
        ? data.minInterval_00_13
        : oldInterval,
      minInterval_13_17: typeof data?.minInterval_13_17 === "number"
        ? data.minInterval_13_17
        : oldInterval,
      minInterval_17_24: typeof data?.minInterval_17_24 === "number"
        ? data.minInterval_17_24
        : oldInterval,
      conflictsCheckEnabled:
        typeof data?.conflictsCheckEnabled === "boolean"
          ? data.conflictsCheckEnabled
          : DEFAULT_SETTINGS.conflictsCheckEnabled,
      isAutomationPaused:
        typeof data?.isAutomationPaused === "boolean"
          ? data.isAutomationPaused
          : DEFAULT_SETTINGS.isAutomationPaused
    };

    Logger.info("Schedule settings updated", {
      userId,
      settings
    });

    res.json(settings);
  } catch (error: any) {
    Logger.error("Failed to update schedule settings", {
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при обновлении настроек расписания"
    });
  }
});

export default router;



