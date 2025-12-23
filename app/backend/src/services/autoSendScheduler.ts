import { db, isFirestoreAvailable, getFirestoreInfo } from "./firebaseAdmin";
import { Logger } from "../utils/logger";
import { generateAndSendPromptForChannel } from "./autoSendService";
import { scheduleAutoDownload } from "./scheduledTasks";

// Типы для канала с расписанием
interface ChannelAutoSendSchedule {
  id: string;
  enabled: boolean;
  daysOfWeek: number[]; // 0–6 (вс, пн, вт, ...)
  time: string; // "HH:MM"
  promptsPerRun: number;
  lastRunAt?: string | null; // ISO-дата
}

interface ChannelWithSchedule {
  id: string;
  ownerId: string;
  autoSendEnabled?: boolean;
  timezone?: string;
  autoSendSchedules?: ChannelAutoSendSchedule[];
  autoDownloadToDriveEnabled?: boolean;
  autoDownloadDelayMinutes?: number;
  googleDriveFolderId?: string;
}

/**
 * Внутрипроцессный кэш недавних запусков расписаний.
 * Нужен как дополнительная защита от повторных срабатываний
 * (даже если lastRunAt ещё не успел сохраниться в Firestore
 * или планировщик вызывается несколько раз подряд).
 *
 * Ключ: `${channelId}:${scheduleId}`
 * Значение: timestamp последнего запуска (ms)
 */
const recentScheduleRuns = new Map<string, number>();

/**
 * Получает все каналы с включённой автоотправкой
 */
async function getChannelsWithAutoSendEnabled(): Promise<ChannelWithSchedule[]> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("Firestore is not available, skipping auto-send check", {
      isFirestoreAvailable: isFirestoreAvailable(),
      dbIsNull: db === null
    });
    return [];
  }

  // Проверяем подключение к Firestore
  const firestoreInfo = getFirestoreInfo();
  Logger.info("getChannelsWithAutoSendEnabled: Firestore check", {
    isFirestoreAvailable: isFirestoreAvailable(),
    dbExists: db !== null,
    firestoreInfo: firestoreInfo,
    env: {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "not set",
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? "set" : "not set",
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? "set" : "not set",
      FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? "set" : "not set"
    }
  });

  const channels: ChannelWithSchedule[] = [];
  let totalChannelsCount = 0;
  let channelsWithAutoSendFlag = 0;
  let channelsWithSchedules = 0;

  try {
    // ИСПРАВЛЕНИЕ: Используем Collection Group Query для поиска всех каналов
    // Пользователи не хранятся в коллекции "users" - они используют Firebase Authentication
    // Каналы хранятся в users/{uid}/channels, поэтому используем collectionGroup("channels")
    Logger.info("getChannelsWithAutoSendEnabled: using collection group query for 'channels'");
    
    let allChannelsSnapshot;
    try {
      // Collection Group Query ищет все документы в коллекции "channels" 
      // независимо от пути (users/{uid}/channels)
      allChannelsSnapshot = await db.collectionGroup("channels").get();
      Logger.info("getChannelsWithAutoSendEnabled: collection group query successful", {
        size: allChannelsSnapshot.size,
        empty: allChannelsSnapshot.empty
      });
    } catch (error) {
      Logger.error("getChannelsWithAutoSendEnabled: ERROR fetching channels collection group", {
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        possibleCauses: [
          "Service Account не имеет прав на чтение коллекции 'channels'",
          "Проверьте правила безопасности Firestore",
          "Проверьте, что Service Account имеет роль 'Firebase Admin SDK Administrator Service Agent'",
          "Убедитесь, что в Firestore есть индекс для collection group query (создаётся автоматически)"
        ]
      });
      return [];
    }
    
    Logger.info("getChannelsWithAutoSendEnabled: found channels", { 
      count: allChannelsSnapshot.docs.length,
      empty: allChannelsSnapshot.empty
    });

    if (allChannelsSnapshot.docs.length === 0) {
      Logger.warn("getChannelsWithAutoSendEnabled: WARNING - no channels found in Firestore", {
        collectionGroup: "channels",
        firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "not set",
        possibleCauses: [
          "В Firestore нет каналов (создайте канал через frontend)",
          "Firebase Admin не имеет прав на чтение",
          "Backend смотрит в другую БД, чем frontend"
        ]
      });
    }

    // ВРЕМЕННО: собираем все каналы для отладки
    const allChannelsDebug: Array<{
      id: string;
      name?: string;
      ownerId: string;
      autoSendEnabled: any;
      autoSendEnabledType: string;
      autoSendSchedules?: any;
      schedulesCount: number;
      schedulesType: string;
    }> = [];

    // Извлекаем userId из пути документа (users/{userId}/channels/{channelId})
    for (const channelDoc of allChannelsSnapshot.docs) {
      // Путь документа: users/{userId}/channels/{channelId}
      // Получаем userId из пути
      const pathParts = channelDoc.ref.path.split("/");
      const userIdIndex = pathParts.indexOf("users");
      const userId = userIdIndex >= 0 && userIdIndex < pathParts.length - 1 
        ? pathParts[userIdIndex + 1] 
        : "unknown";

      totalChannelsCount++;

      const channelData = channelDoc.data() as any;
      
      // Отладочная информация
      const autoSendEnabled = channelData.autoSendEnabled;
      const autoSendSchedules = channelData.autoSendSchedules;
      const schedulesCount = Array.isArray(autoSendSchedules) ? autoSendSchedules.length : 0;

      allChannelsDebug.push({
        id: channelDoc.id,
        name: channelData.name,
        ownerId: userId,
        autoSendEnabled: autoSendEnabled,
        autoSendEnabledType: typeof autoSendEnabled,
        autoSendSchedules: autoSendSchedules,
        schedulesCount: schedulesCount,
        schedulesType: typeof autoSendSchedules
      });

      // Проверяем, включена ли автоотправка
      // Важно: проверяем именно на true, а не просто truthy
      // Также проверяем, что autoSendSchedules - это массив и он не пустой
      const isAutoSendEnabled = autoSendEnabled === true;
      const hasSchedules = Array.isArray(autoSendSchedules) && autoSendSchedules.length > 0;

      if (isAutoSendEnabled) {
        channelsWithAutoSendFlag++;
      }
      if (hasSchedules) {
        channelsWithSchedules++;
      }

      if (isAutoSendEnabled && hasSchedules) {
        channels.push({
          id: channelDoc.id,
          ownerId: userId,
          autoSendEnabled: true,
          timezone: channelData.timezone || "UTC",
          autoSendSchedules: autoSendSchedules,
          autoDownloadToDriveEnabled: channelData.autoDownloadToDriveEnabled === true,
          autoDownloadDelayMinutes: channelData.autoDownloadDelayMinutes ?? 10,
          googleDriveFolderId: channelData.googleDriveFolderId
        });
      }
    }

    // Детальное логирование для отладки
    Logger.info("getChannelsWithAutoSendEnabled: DEBUG statistics", {
      totalChannels: totalChannelsCount,
      channelsWithAutoSendFlag: channelsWithAutoSendFlag,
      channelsWithSchedules: channelsWithSchedules,
      channelsWithBoth: channels.length
    });

    // Логируем все каналы с autoSendEnabled для отладки
    const channelsWithFlag = allChannelsDebug.filter(c => c.autoSendEnabled === true);
    if (channelsWithFlag.length > 0) {
      Logger.info("getChannelsWithAutoSendEnabled: DEBUG channels with autoSendEnabled=true", {
        count: channelsWithFlag.length,
        channels: channelsWithFlag.map(c => ({
          id: c.id,
          name: c.name,
          autoSendEnabled: c.autoSendEnabled,
          autoSendEnabledType: c.autoSendEnabledType,
          schedulesCount: c.schedulesCount,
          schedulesType: c.schedulesType,
          schedules: c.autoSendSchedules
        }))
      });
    }

    // Логируем каналы без autoSendEnabled для отладки
    const channelsWithoutFlag = allChannelsDebug.filter(c => c.autoSendEnabled !== true);
    if (channelsWithoutFlag.length > 0 && channelsWithoutFlag.length <= 10) {
      Logger.info("getChannelsWithAutoSendEnabled: DEBUG sample channels without autoSendEnabled=true", {
        count: channelsWithoutFlag.length,
        sample: channelsWithoutFlag.slice(0, 5).map(c => ({
          id: c.id,
          name: c.name,
          autoSendEnabled: c.autoSendEnabled,
          autoSendEnabledType: c.autoSendEnabledType
        }))
      });
    }

    Logger.info("getChannelsWithAutoSendEnabled: found channels with auto-send enabled", { 
      count: channels.length,
      channelIds: channels.map(c => c.id)
    });
    
    return channels;
  } catch (error) {
    Logger.error("Failed to get channels with auto-send enabled", {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    return [];
  }
}

/**
 * Получает локальное время в указанной таймзоне
 * Использует Intl.DateTimeFormat для надёжной конвертации
 */
function getLocalTimeInTimezone(date: Date, timezone: string): {
  dayOfWeek: number; // 0 = воскресенье, 1 = понедельник, ...
  hour: number;
  minute: number;
  date: number;
  month: number;
  year: number;
  timeString: string; // "HH:MM"
} {
  // Используем Intl.DateTimeFormat для правильной конвертации
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  
  const dayOfWeekMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };

  const dayOfWeek = dayOfWeekMap[parts.find((p) => p.type === "weekday")?.value || "Sunday"] ?? 0;
  let hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const dateNum = parseInt(parts.find((p) => p.type === "day")?.value || "0", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
  const year = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
  
  // ИСПРАВЛЕНИЕ: Intl.DateTimeFormat может вернуть 24 для полночи (00:00 следующего дня)
  // Нужно нормализовать это к 0
  if (hour === 24) {
    hour = 0;
  }
  
  const timeString = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return {
    dayOfWeek,
    hour,
    minute,
    date: dateNum,
    month,
    year,
    timeString
  };
}

/**
 * Парсит время из строки "HH:MM" в часы и минуты
 */
function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

/**
 * Проверяет, нужно ли запускать расписание прямо сейчас
 * @param channel - Канал с расписанием
 * @param schedule - Конкретное расписание
 * @param nowUtc - Текущее время в UTC
 */
function shouldRunScheduleNow(
  channel: ChannelWithSchedule,
  schedule: ChannelAutoSendSchedule,
  nowUtc: Date
): boolean {
  // Детальное логирование для отладки
  const timezone = channel.timezone || "UTC";
  const localTime = getLocalTimeInTimezone(nowUtc, timezone);
  const scheduleTime = parseTime(schedule.time);

  Logger.info("shouldRunScheduleNow: checking", {
    channelId: channel.id,
    scheduleId: schedule.id,
    nowUtc: nowUtc.toISOString(),
    timezone,
    localTime: {
      dayOfWeek: localTime.dayOfWeek,
      time: localTime.timeString,
      date: `${localTime.year}-${String(localTime.month).padStart(2, "0")}-${String(localTime.date).padStart(2, "0")}`
    },
    schedule: {
      enabled: schedule.enabled,
      daysOfWeek: schedule.daysOfWeek,
      time: schedule.time,
      lastRunAt: schedule.lastRunAt || "never"
    }
  });

  // Проверка 1: включено ли расписание
  if (!schedule.enabled) {
    Logger.info("shouldRunScheduleNow: SKIPPED (schedule disabled)", {
      channelId: channel.id,
      scheduleId: schedule.id
    });
    return false;
  }

  // Проверка 2: валидность времени в расписании
  if (!scheduleTime) {
    Logger.warn("shouldRunScheduleNow: SKIPPED (invalid time format)", {
      channelId: channel.id,
      scheduleId: schedule.id,
      scheduleTime: schedule.time
    });
    return false;
  }

  // Проверка 3: день недели
  if (!schedule.daysOfWeek.includes(localTime.dayOfWeek)) {
    Logger.info("shouldRunScheduleNow: SKIPPED (day of week mismatch)", {
      channelId: channel.id,
      scheduleId: schedule.id,
      localDayOfWeek: localTime.dayOfWeek,
      scheduleDaysOfWeek: schedule.daysOfWeek
    });
    return false;
  }

  // Проверка 4: время (с "окном" в 1 минуту для надёжности)
  // Считаем, что нужно запускать, если текущее время совпадает с расписанием
  // или находится в пределах ±1 минуты от расписания
  const timeDiff = Math.abs(
    localTime.hour * 60 + localTime.minute - (scheduleTime.hour * 60 + scheduleTime.minute)
  );

  // Разрешаем запуск, если время точно совпадает или отличается на 1 минуту
  // (это нужно, чтобы учесть возможную задержку cron)
  if (timeDiff > 1) {
    Logger.info("shouldRunScheduleNow: SKIPPED (time mismatch)", {
      channelId: channel.id,
      scheduleId: schedule.id,
      localTime: localTime.timeString,
      scheduleTime: schedule.time,
      timeDiffMinutes: timeDiff
    });
    return false;
  }

  // Проверка 5: не был ли уже запуск сегодня в это время (с учётом "окна" ±1 минута)
  if (schedule.lastRunAt) {
    const lastRun = new Date(schedule.lastRunAt);
    const lastRunLocal = getLocalTimeInTimezone(lastRun, timezone);

    // Проверяем, был ли запуск сегодня рядом с запланированным временем
    const sameDay =
      lastRunLocal.year === localTime.year &&
      lastRunLocal.month === localTime.month &&
      lastRunLocal.date === localTime.date;

    // Считаем запуск уже выполненным, если lastRunLocal находится в том же "окне" ±1 минута
    // вокруг запланированного времени, что и текущий nowUtc.
    const lastRunMinutes = lastRunLocal.hour * 60 + lastRunLocal.minute;
    const targetMinutes = scheduleTime.hour * 60 + scheduleTime.minute;
    const lastRunDiff = Math.abs(lastRunMinutes - targetMinutes);

    const alreadyRanInWindow = sameDay && lastRunDiff <= 1;

    if (alreadyRanInWindow) {
      Logger.info("shouldRunScheduleNow: SKIPPED (already run today in this time window)", {
        channelId: channel.id,
        scheduleId: schedule.id,
        lastRunAt: schedule.lastRunAt,
        lastRunLocal: {
          date: `${lastRunLocal.year}-${String(lastRunLocal.month).padStart(2, "0")}-${String(lastRunLocal.date).padStart(2, "0")}`,
          time: lastRunLocal.timeString
        },
        currentLocal: {
          date: `${localTime.year}-${String(localTime.month).padStart(2, "0")}-${String(localTime.date).padStart(2, "0")}`,
          time: localTime.timeString
        },
        targetTime: schedule.time,
        lastRunDiffMinutes: lastRunDiff
      });
      return false;
    }
  }

  // Все проверки пройдены - нужно запускать
  Logger.info("shouldRunScheduleNow: TRIGGERED", {
    channelId: channel.id,
    scheduleId: schedule.id,
    localTime: localTime.timeString,
    scheduleTime: schedule.time
  });

  return true;
}

/**
 * Отмечает расписание как выполненное
 */
async function markScheduleExecuted(
  userId: string,
  channelId: string,
  scheduleId: string,
  executedAt: Date
): Promise<void> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("Firestore is not available, cannot mark schedule as executed");
    return;
  }

  try {
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);

    const channelSnap = await channelRef.get();
    if (!channelSnap.exists) {
      Logger.warn("Channel not found when marking schedule as executed", {
        userId,
        channelId
      });
      return;
    }

    const channelData = channelSnap.data() as any;
    const schedules = (channelData.autoSendSchedules || []) as ChannelAutoSendSchedule[];

    // Обновляем lastRunAt для конкретного расписания
    const updatedSchedules = schedules.map((s) =>
      s.id === scheduleId
        ? { ...s, lastRunAt: executedAt.toISOString() }
        : s
    );

    await channelRef.update({
      autoSendSchedules: updatedSchedules,
      updatedAt: new Date()
    });

    Logger.info("Schedule marked as executed", {
      userId,
      channelId,
      scheduleId,
      executedAt: executedAt.toISOString()
    });
  } catch (error) {
    Logger.error("Failed to mark schedule as executed", {
      userId,
      channelId,
      scheduleId,
      error
    });
  }
}

/**
 * Основная функция планировщика - проверяет все каналы и запускает генерацию промптов
 */
/**
 * Полные настройки расписания с интервалами
 */
interface FullScheduleSettings {
  minInterval_00_13?: number;
  minInterval_13_17?: number;
  minInterval_17_24?: number;
  minIntervalMinutes?: number; // для обратной совместимости
  isAutomationPaused: boolean;
}

const DEFAULT_INTERVALS = {
  minInterval_00_13: 11,
  minInterval_13_17: 11,
  minInterval_17_24: 11,
  minIntervalMinutes: 11
};

/**
 * Получает полные настройки расписания для пользователя (включая интервалы)
 */
async function getFullScheduleSettingsForUser(userId: string): Promise<FullScheduleSettings | null> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("Firestore is not available, cannot get schedule settings", { userId });
    return null;
  }

  try {
    const settingsRef = db
      .collection("users")
      .doc(userId)
      .collection("settings")
      .doc("schedule");
    
    const settingsSnap = await settingsRef.get();
    
    if (!settingsSnap.exists) {
      // Настройки не найдены, возвращаем дефолтные
      return {
        ...DEFAULT_INTERVALS,
        isAutomationPaused: false
      };
    }

    const data = settingsSnap.data();
    const oldInterval = typeof data?.minIntervalMinutes === "number" 
      ? data.minIntervalMinutes 
      : DEFAULT_INTERVALS.minIntervalMinutes;

    return {
      minInterval_00_13: typeof data?.minInterval_00_13 === "number"
        ? data.minInterval_00_13
        : oldInterval,
      minInterval_13_17: typeof data?.minInterval_13_17 === "number"
        ? data.minInterval_13_17
        : oldInterval,
      minInterval_17_24: typeof data?.minInterval_17_24 === "number"
        ? data.minInterval_17_24
        : oldInterval,
      minIntervalMinutes: oldInterval,
      isAutomationPaused: typeof data?.isAutomationPaused === "boolean" 
        ? data.isAutomationPaused 
        : false
    };
  } catch (error: any) {
    Logger.error("Failed to get schedule settings for user", {
      userId,
      error: error?.message || String(error)
    });
    return null;
  }
}

/**
 * Получает настройки расписания для пользователя (только пауза, для обратной совместимости)
 */
async function getScheduleSettingsForUser(userId: string): Promise<{ isAutomationPaused: boolean } | null> {
  const fullSettings = await getFullScheduleSettingsForUser(userId);
  if (!fullSettings) return null;
  return { isAutomationPaused: fullSettings.isAutomationPaused };
}

/**
 * Вычисляет задержку автоскачивания на основе расписания каналов
 * @param userId - ID пользователя
 * @param sentAt - Время отправки промпта
 * @returns Задержка в минутах (interval - 1, с границами 1-60)
 */
export async function getAutoDownloadDelayMinutesForChannel(
  userId: string,
  sentAt: Date
): Promise<number> {
  const scheduleSettings = await getFullScheduleSettingsForUser(userId);
  
  if (!scheduleSettings) {
    // Если не удалось получить настройки, используем дефолтное значение
    Logger.warn("getAutoDownloadDelayMinutesForChannel: schedule settings not available, using default", {
      userId,
      defaultDelay: 10
    });
    return 10;
  }

  // Определяем диапазон времени суток
  const hour = sentAt.getHours();
  let baseInterval: number;
  let range: string;

  if (hour >= 0 && hour < 13) {
    baseInterval = scheduleSettings.minInterval_00_13 ?? scheduleSettings.minIntervalMinutes ?? DEFAULT_INTERVALS.minInterval_00_13;
    range = "00-13";
  } else if (hour >= 13 && hour < 17) {
    baseInterval = scheduleSettings.minInterval_13_17 ?? scheduleSettings.minIntervalMinutes ?? DEFAULT_INTERVALS.minInterval_13_17;
    range = "13-17";
  } else {
    baseInterval = scheduleSettings.minInterval_17_24 ?? scheduleSettings.minIntervalMinutes ?? DEFAULT_INTERVALS.minInterval_17_24;
    range = "17-24";
  }

  // Вычисляем задержку как interval - 1, с безопасными границами
  let delay = baseInterval - 1;
  if (delay < 1) delay = 1;
  if (delay > 60) delay = 60;

  Logger.info("getAutoDownloadDelayMinutesForChannel: calculated delay", {
    userId,
    sentAt: sentAt.toISOString(),
    hour,
    range,
    baseInterval,
    calculatedDelay: delay
  });

  return delay;
}

export async function processAutoSendTick(): Promise<void> {
  const nowUtc = new Date();
  Logger.info("processAutoSendTick: start", { 
    nowUtc: nowUtc.toISOString(),
    nowUtcTimestamp: nowUtc.getTime(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "not set",
      ENABLE_CRON_SCHEDULER: process.env.ENABLE_CRON_SCHEDULER || "true"
    }
  });

  try {
    // Получаем все каналы с включённой автоотправкой
    const channels = await getChannelsWithAutoSendEnabled();
    Logger.info("processAutoSendTick: totalChannels", { 
      count: channels.length,
      channelIds: channels.map(c => c.id),
      channels: channels.map(c => ({
        id: c.id,
        autoSendEnabled: c.autoSendEnabled,
        timezone: c.timezone,
        schedulesCount: c.autoSendSchedules?.length || 0
      }))
    });

    let triggeredCount = 0;
    let skippedCount = 0;

    // Группируем каналы по пользователям для проверки паузы
    const channelsByUser = new Map<string, ChannelWithSchedule[]>();
    for (const channel of channels) {
      if (!channelsByUser.has(channel.ownerId)) {
        channelsByUser.set(channel.ownerId, []);
      }
      channelsByUser.get(channel.ownerId)!.push(channel);
    }

    // Проверяем паузу для каждого пользователя
    const userPauseStatus = new Map<string, boolean>();
    for (const [userId, userChannels] of channelsByUser.entries()) {
      const settings = await getScheduleSettingsForUser(userId);
      const isPaused = settings?.isAutomationPaused === true;
      userPauseStatus.set(userId, isPaused);
      
      if (isPaused) {
        Logger.info("processAutoSendTick: automation is paused for user", {
          userId,
          channelsCount: userChannels.length,
          channelIds: userChannels.map(c => c.id)
        });
        skippedCount += userChannels.length;
      }
    }

    for (const channel of channels) {
      // Проверяем паузу для пользователя этого канала
      const isPaused = userPauseStatus.get(channel.ownerId) === true;
      if (isPaused) {
        Logger.info("processAutoSendTick: skipping channel (automation paused)", {
          channelId: channel.id,
          userId: channel.ownerId
        });
        continue;
      }

      if (!channel.autoSendEnabled || !channel.autoSendSchedules) {
        Logger.info("processAutoSendTick: skipping channel (disabled or no schedules)", {
          channelId: channel.id,
          autoSendEnabled: channel.autoSendEnabled,
          schedulesCount: channel.autoSendSchedules?.length || 0
        });
        continue;
      }

      Logger.info("processAutoSendTick: checking channel", {
        channelId: channel.id,
        timezone: channel.timezone || "UTC",
        schedulesCount: channel.autoSendSchedules.length
      });

      // Проверяем каждое расписание в канале
      for (const schedule of channel.autoSendSchedules) {
        // Логируем кандидата на срабатывание (используем ту же функцию, что и в shouldRunScheduleNow)
        const localTimeForLog = getLocalTimeInTimezone(nowUtc, channel.timezone || "UTC");
        Logger.info("processAutoSendTick: TRIGGER candidate", {
          channelId: channel.id,
          scheduleId: schedule.id,
          nowUtc: nowUtc.toISOString(),
          nowLocal: localTimeForLog.timeString,
          nowLocalDayOfWeek: localTimeForLog.dayOfWeek,
          scheduleTime: schedule.time,
          scheduleDaysOfWeek: schedule.daysOfWeek,
          scheduleEnabled: schedule.enabled,
          timezone: channel.timezone || "UTC"
        });

        if (shouldRunScheduleNow(channel, schedule, nowUtc)) {
          const runKey = `${channel.id}:${schedule.id}`;
          const lastRunTs = recentScheduleRuns.get(runKey);
          const nowTs = nowUtc.getTime();

          // Дополнительная защита: не даём одному и тому же расписанию
          // сработать чаще, чем раз в 90 секунд на этом процессе,
          // даже если что-то не так с сохранением lastRunAt.
          if (lastRunTs && nowTs - lastRunTs < 90_000) {
            Logger.warn("processAutoSendTick: SKIPPED (recent run in memory cache)", {
              channelId: channel.id,
              scheduleId: schedule.id,
              nowUtc: nowUtc.toISOString(),
              lastRunTs: new Date(lastRunTs).toISOString(),
              diffMs: nowTs - lastRunTs
            });
            skippedCount++;
            continue;
          }

          // Фиксируем запуск в кэше до фактической отправки,
          // чтобы даже при ошибке сохранения в Firestore не было дублей.
          recentScheduleRuns.set(runKey, nowTs);

          triggeredCount++;
          Logger.info("processAutoSendTick: TRIGGERED auto-send", {
            channelId: channel.id,
            scheduleId: schedule.id,
            nowUtc: nowUtc.toISOString(),
            nowLocal: localTimeForLog.timeString
          });
          Logger.info("processAutoSendTick: TRIGGERED - Running scheduled prompt generation", {
            channelId: channel.id,
            scheduleId: schedule.id,
            promptsPerRun: schedule.promptsPerRun,
            timezone: channel.timezone || "UTC"
          });

          try {
            // Запускаем генерацию и отправку N раз
            for (let i = 0; i < schedule.promptsPerRun; i++) {
              Logger.info("processAutoSendTick: generating and sending prompt", {
                channelId: channel.id,
                scheduleId: schedule.id,
                promptNumber: i + 1,
                totalPrompts: schedule.promptsPerRun
              });

              const promptResult = await generateAndSendPromptForChannel(channel.id, channel.ownerId);
              
              Logger.info("processAutoSendTick: prompt sent successfully", {
                channelId: channel.id,
                scheduleId: schedule.id,
                promptNumber: i + 1,
                messageId: promptResult.messageId,
                chatId: promptResult.chatId,
                hasTitle: !!promptResult.title
              });

              // Если включено автоматическое скачивание, планируем задачу
              Logger.info("processAutoSendTick: checking auto-download conditions", {
                channelId: channel.id,
                scheduleId: schedule.id,
                autoDownloadToDriveEnabled: channel.autoDownloadToDriveEnabled,
                autoDownloadToDriveEnabledType: typeof channel.autoDownloadToDriveEnabled,
                googleDriveFolderId: channel.googleDriveFolderId || "not set",
                googleDriveFolderIdType: typeof channel.googleDriveFolderId,
                autoDownloadDelayMinutes: channel.autoDownloadDelayMinutes
              });

              // ДЕТАЛЬНАЯ ПРОВЕРКА УСЛОВИЙ ДЛЯ ДИАГНОСТИКИ
              const hasAutoDownloadEnabled = channel.autoDownloadToDriveEnabled === true;
              const hasGoogleDriveFolder = !!channel.googleDriveFolderId;
              
              console.log("AUTO_DOWNLOAD_CHECK:", {
                channelId: channel.id,
                scheduleId: schedule.id,
                autoDownloadToDriveEnabled: channel.autoDownloadToDriveEnabled,
                autoDownloadToDriveEnabledType: typeof channel.autoDownloadToDriveEnabled,
                hasAutoDownloadEnabled,
                googleDriveFolderId: channel.googleDriveFolderId || "NOT_SET",
                hasGoogleDriveFolder,
                willSchedule: hasAutoDownloadEnabled && hasGoogleDriveFolder
              });

              if (hasAutoDownloadEnabled && hasGoogleDriveFolder) {
                // Вычисляем задержку на основе расписания каналов
                const promptSentAt = new Date();
                const delayMinutes = await getAutoDownloadDelayMinutesForChannel(
                  channel.ownerId,
                  promptSentAt
                );
                
                // Определяем диапазон для логирования
                const hour = promptSentAt.getHours();
                let range: string;
                if (hour >= 0 && hour < 13) {
                  range = "00-13";
                } else if (hour >= 13 && hour < 17) {
                  range = "13-17";
                } else {
                  range = "17-24";
                }
                
                Logger.info("processAutoSendTick: scheduling auto-download", {
                  channelId: channel.id,
                  scheduleId: schedule.id,
                  messageId: promptResult.messageId,
                  chatId: promptResult.chatId,
                  delayMinutes,
                  range,
                  promptSentAt: promptSentAt.toISOString(),
                  googleDriveFolderId: channel.googleDriveFolderId,
                  videoTitle: promptResult.title || "not provided",
                  promptLength: promptResult.prompt?.length || 0,
                  note: "Delay calculated from schedule settings (interval - 1)"
                });

                try {
                  console.log("auto-download scheduled", {
                    userId: channel.ownerId,
                    channelId: channel.id,
                    scheduleId: schedule.id,
                    messageId: promptResult.messageId,
                    promptSentAt: promptSentAt.toISOString(),
                    delayMinutes,
                    range,
                    willRunAt: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
                  });

                  const taskId = scheduleAutoDownload({
                    channelId: channel.id,
                    scheduleId: schedule.id,
                    userId: channel.ownerId,
                    telegramMessageInfo: {
                      messageId: promptResult.messageId,
                      chatId: promptResult.chatId
                    },
                    delayMinutes,
                    videoTitle: promptResult.title,
                    prompt: promptResult.prompt
                  });

                  console.log("AUTO_DOWNLOAD_SCHEDULED:", {
                    taskId,
                    channelId: channel.id,
                    scheduleId: schedule.id,
                    messageId: promptResult.messageId,
                    willRunInMinutes: delayMinutes,
                    willRunAt: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
                  });

                  Logger.info("processAutoSendTick: auto-download scheduled successfully", {
                    channelId: channel.id,
                    scheduleId: schedule.id,
                    taskId,
                    willRunInMinutes: delayMinutes,
                    willRunAt: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString()
                  });
                } catch (scheduleError) {
                  // Логируем ошибку планирования, но не прерываем основной процесс
                  Logger.error("processAutoSendTick: failed to schedule auto-download", {
                    channelId: channel.id,
                    scheduleId: schedule.id,
                    error: scheduleError instanceof Error ? scheduleError.message : String(scheduleError),
                    errorStack: scheduleError instanceof Error ? scheduleError.stack : undefined
                  });
                }
              } else {
                Logger.warn("processAutoSendTick: auto-download not scheduled - conditions not met", {
                  channelId: channel.id,
                  scheduleId: schedule.id,
                  autoDownloadToDriveEnabled: channel.autoDownloadToDriveEnabled,
                  autoDownloadToDriveEnabledType: typeof channel.autoDownloadToDriveEnabled,
                  googleDriveFolderId: channel.googleDriveFolderId || "not set",
                  googleDriveFolderIdType: typeof channel.googleDriveFolderId,
                  reason: !channel.autoDownloadToDriveEnabled 
                    ? "autoDownloadToDriveEnabled is not true" 
                    : !channel.googleDriveFolderId 
                    ? "googleDriveFolderId is not set" 
                    : "unknown"
                });
              }
              
              // Небольшая задержка между промптами, чтобы не перегружать API
              if (i < schedule.promptsPerRun - 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }
            }

            // Отмечаем расписание как выполненное
            await markScheduleExecuted(
              channel.ownerId,
              channel.id,
              schedule.id,
              nowUtc
            );

            Logger.info("processAutoSendTick: Scheduled prompt generation completed", {
              channelId: channel.id,
              scheduleId: schedule.id,
              promptsSent: schedule.promptsPerRun,
              lastRunAt: nowUtc.toISOString()
            });
          } catch (error) {
            // Логируем ошибку, но продолжаем обработку других каналов
            Logger.error("processAutoSendTick: Failed to process scheduled prompt generation", {
              channelId: channel.id,
              scheduleId: schedule.id,
              error: error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined
            });
          }
        } else {
          skippedCount++;
        }
      }
    }

    Logger.info("processAutoSendTick: completed", {
      totalChannels: channels.length,
      triggeredSchedules: triggeredCount,
      skippedSchedules: skippedCount
    });
  } catch (error) {
    Logger.error("processAutoSendTick: error", {
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    // Не пробрасываем ошибку, чтобы планировщик продолжал работать
  }
}

