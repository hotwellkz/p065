/**
 * Планировщик для обработки каналов типа music_clips
 * Отдельный от shorts scheduler
 */

import { Logger } from "../utils/logger";
import { Channel, ChannelType } from "../types/channel";
import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { processMusicClipsChannel } from "./musicClipsPipeline";

/**
 * Получить все каналы типа music_clips
 */
export async function getMusicClipsChannels(): Promise<Array<Channel & { ownerId: string }>> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("[MusicClipsScheduler] Firestore is not available");
    return [];
  }

  const channels: Array<Channel & { ownerId: string }> = [];

  try {
    // Используем Collection Group Query для поиска всех каналов
    const channelsSnapshot = await db.collectionGroup("channels").get();

    for (const doc of channelsSnapshot.docs) {
      const data = doc.data();

      // Извлекаем userId из пути документа: users/{userId}/channels/{channelId}
      const pathParts = doc.ref.path.split("/");
      const userIdIndex = pathParts.indexOf("users");
      const ownerId = userIdIndex !== -1 && userIdIndex + 1 < pathParts.length
        ? pathParts[userIdIndex + 1]
        : null;

      if (!ownerId) {
        Logger.warn("[MusicClipsScheduler] Could not extract userId from channel path", {
          channelId: doc.id,
          path: doc.ref.path
        });
        continue;
      }

      // Проверяем тип канала
      const channelType: ChannelType = data.type || "shorts";
      if (channelType !== "music_clips") {
        continue;
      }

      // Проверяем наличие настроек music_clips
      if (!data.musicClipsSettings || !data.musicClipsSettings.sunoPrompt) {
        Logger.warn("[MusicClipsScheduler] Channel has no musicClipsSettings or sunoPrompt", {
          channelId: doc.id,
          ownerId
        });
        continue;
      }

      const channel: Channel & { ownerId: string } = {
        id: doc.id,
        ownerId,
        ...data,
        type: channelType,
        createdAt: data.createdAt || { seconds: 0, nanoseconds: 0 },
        updatedAt: data.updatedAt || { seconds: 0, nanoseconds: 0 }
      } as Channel & { ownerId: string };

      channels.push(channel);
    }

    Logger.info("[MusicClipsScheduler] Found music_clips channels", {
      count: channels.length,
      channelIds: channels.map((c) => c.id)
    });

    return channels;
  } catch (error: any) {
    Logger.error("[MusicClipsScheduler] Failed to get channels", {
      error: error?.message || String(error)
    });
    return [];
  }
}

/**
 * Проверить расписание канала и нужно ли запускать обработку
 * Для MVP: проверяем autoSendSchedule
 */
async function shouldProcessChannel(channel: Channel): Promise<boolean> {
  if (!channel.autoSendSchedule || channel.autoSendSchedule.length === 0) {
    return false;
  }

  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  for (const schedule of channel.autoSendSchedule) {
    if (!schedule.enabled) {
      continue;
    }

    // Проверяем день недели
    if (!schedule.daysOfWeek.includes(currentDay)) {
      continue;
    }

    // Проверяем время (с точностью до минуты)
    if (schedule.time !== currentTime) {
      continue;
    }

    // Проверяем, не запускали ли уже в эту минуту
    if (schedule.lastRunAt) {
      const lastRun = new Date(schedule.lastRunAt);
      const diffMinutes = (now.getTime() - lastRun.getTime()) / 1000 / 60;
      if (diffMinutes < 1) {
        // Уже запускали в эту минуту
        continue;
      }
    }

    return true;
  }

  return false;
}

/**
 * Обновить lastRunAt для расписания
 */
async function updateScheduleLastRun(channel: Channel & { ownerId: string }, scheduleId: string): Promise<void> {
  if (!isFirestoreAvailable() || !db || !channel.ownerId) {
    return;
  }

  try {
    const channelRef = db
      .collection("users")
      .doc(channel.ownerId)
      .collection("channels")
      .doc(channel.id);

    const channelSnap = await channelRef.get();
    if (!channelSnap.exists) {
      return;
    }

    const data = channelSnap.data();
    const schedules = (data?.autoSendSchedule || []) as Array<{ id: string; lastRunAt?: string | null }>;

    const updatedSchedules = schedules.map(schedule => {
      if (schedule.id === scheduleId) {
        return {
          ...schedule,
          lastRunAt: new Date().toISOString()
        };
      }
      return schedule;
    });

    await channelRef.update({
      autoSendSchedule: updatedSchedules
    });

    Logger.info("[MusicClipsScheduler] Updated schedule lastRunAt", {
      channelId: channel.id,
      scheduleId
    });
  } catch (error: any) {
    Logger.error("[MusicClipsScheduler] Failed to update schedule lastRunAt", {
      channelId: channel.id,
      scheduleId,
      error: error?.message || String(error)
    });
  }
}

/**
 * Основная функция обработки тика
 */
export async function processMusicClipsTick(): Promise<void> {
  const startTime = Date.now();
  Logger.info("[MusicClipsScheduler] Starting tick", {
    timestamp: new Date().toISOString()
  });

  try {
    // Получаем все каналы типа music_clips
    const channels = await getMusicClipsChannels();

    if (channels.length === 0) {
      Logger.info("[MusicClipsScheduler] No music_clips channels found");
      return;
    }

    Logger.info("[MusicClipsScheduler] Processing channels", {
      channelsCount: channels.length
    });

    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // Обрабатываем каждый канал
    for (const channel of channels) {
      try {
        // Проверяем расписание
        const shouldProcess = await shouldProcessChannel(channel);
        if (!shouldProcess) {
          Logger.debug("[MusicClipsScheduler] Channel skipped (schedule)", {
            channelId: channel.id,
            channelName: channel.name
          });
          totalSkipped++;
          continue;
        }

        Logger.info("[MusicClipsScheduler] Processing channel", {
          channelId: channel.id,
          channelName: channel.name
        });

        // Запускаем пайплайн
        const result = await processMusicClipsChannel(channel, channel.ownerId);

        if (result.success) {
          totalProcessed++;
          Logger.info("[MusicClipsScheduler] Channel processed successfully", {
            channelId: channel.id,
            channelName: channel.name,
            publishedPlatforms: result.publishedPlatforms
          });

          // Обновляем lastRunAt для расписания
          if (channel.autoSendSchedule) {
            for (const schedule of channel.autoSendSchedule) {
              if (schedule.enabled && schedule.daysOfWeek.includes(new Date().getDay())) {
                await updateScheduleLastRun(channel, schedule.id);
                break;
              }
            }
          }
        } else {
          totalErrors++;
          Logger.error("[MusicClipsScheduler] Channel processing failed", {
            channelId: channel.id,
            channelName: channel.name,
            error: result.error
          });
        }
      } catch (error: any) {
        totalErrors++;
        Logger.error("[MusicClipsScheduler] Error processing channel", {
          channelId: channel.id,
          channelName: channel.name,
          error: error?.message || String(error),
          stack: error?.stack?.substring(0, 500)
        });
      }
    }

    const duration = Date.now() - startTime;
    Logger.info("[MusicClipsScheduler] Tick completed", {
      duration,
      channelsProcessed: channels.length,
      totalProcessed,
      totalSkipped,
      totalErrors
    });
  } catch (error: any) {
    Logger.error("[MusicClipsScheduler] Error in tick", {
      error: error?.message || String(error),
      stack: error?.stack
    });
  }
}

