import type { Channel } from "../domain/channel";
import { hhmmToMinutes, minutesToHHMM } from "./scheduleFreeSlots";

export type ChannelAutomationState = "current" | "next" | "previous" | "default";

export interface ChannelStateInfo {
  channelId: string;
  state: ChannelAutomationState;
  timeSlot?: string; // Время слота, который определяет состояние
  // Для текущего канала
  currentStartTime?: Date; // Время начала текущего запуска
  currentEndTime?: Date; // Время окончания текущего запуска
  // Для текущего канала - следующий слот в этом же канале
  nextSlotTime?: string; // Время следующего слота в этом канале (HH:MM)
  nextSlotDate?: Date; // Дата следующего слота
  // Для текущего канала - предыдущий слот в этом же канале
  previousSlotTime?: string; // Время предыдущего слота (HH:MM)
  previousSlotDate?: Date; // Дата предыдущего слота
  // Для следующего канала
  nextStartTime?: Date; // Время начала следующего запуска
  // Для предыдущего канала
  previousStartTime?: Date; // Время начала предыдущего запуска
  previousEndTime?: Date; // Время окончания предыдущего запуска
}

/**
 * Определяет состояние автоматизации для канала на основе его расписания
 */
function getChannelState(
  channel: Channel,
  nowMinutes: number,
  minIntervalMinutes: number
): { state: ChannelAutomationState; timeSlot?: string } {
  if (!channel.autoSendEnabled || !channel.autoSendSchedules || channel.autoSendSchedules.length === 0) {
    return { state: "default" };
  }

  // Собираем все времена из включенных расписаний
  const times = channel.autoSendSchedules
    .filter((schedule) => schedule.enabled && schedule.time)
    .map((schedule) => schedule.time)
    .sort();

  if (times.length === 0) {
    return { state: "default" };
  }

  const validInterval = Math.max(1, Math.min(60, minIntervalMinutes || 11));

  // Проверяем, есть ли активный слот (текущий)
  for (const time of times) {
    const slotMinutes = hhmmToMinutes(time);
    if (Number.isNaN(slotMinutes)) continue;

    const endMinutes = slotMinutes + validInterval;
    let isActive = false;

    if (endMinutes < 1440) {
      isActive = slotMinutes <= nowMinutes && nowMinutes < endMinutes;
    } else {
      const endNormalized = endMinutes % 1440;
      isActive = nowMinutes >= slotMinutes || nowMinutes < endNormalized;
    }

    if (isActive) {
      return { state: "current", timeSlot: time };
    }
  }

  // Если нет активного, ищем следующий слот
  for (const time of times) {
    const slotMinutes = hhmmToMinutes(time);
    if (Number.isNaN(slotMinutes)) continue;

    if (slotMinutes > nowMinutes) {
      return { state: "next", timeSlot: time };
    }
  }

  // Если все слоты прошли, берём самый поздний как следующий (следующий день)
  if (times.length > 0) {
    return { state: "next", timeSlot: times[0] };
  }

  return { state: "default" };
}

/**
 * Определяет состояния всех каналов и возвращает информацию о текущем, следующем и предыдущем
 */
export function calculateChannelStates(
  channels: Channel[],
  minIntervalMinutes: number = 11
): Map<string, ChannelStateInfo> {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const states = new Map<string, ChannelStateInfo>();
  let currentChannel: { channelId: string; timeSlot: string; minutes: number } | null = null;
  let nextChannel: { channelId: string; timeSlot: string; minutes: number } | null = null;
  let previousChannel: { channelId: string; timeSlot: string; minutes: number } | null = null;

  // Сначала определяем состояния для всех каналов
  // Сначала находим текущий канал
  for (const channel of channels) {
    const { state, timeSlot } = getChannelState(channel, nowMinutes, minIntervalMinutes);
    
    if (state === "current" && timeSlot) {
      const minutes = hhmmToMinutes(timeSlot);
      if (!Number.isNaN(minutes)) {
        if (!currentChannel || minutes > currentChannel.minutes) {
          currentChannel = { channelId: channel.id, timeSlot, minutes };
        }
      }
    }
  }

  // Теперь находим следующий канал (исключая текущий)
  for (const channel of channels) {
    // Пропускаем канал с активным слотом
    if (currentChannel && channel.id === currentChannel.channelId) {
      continue;
    }
    
    const { state, timeSlot } = getChannelState(channel, nowMinutes, minIntervalMinutes);
    
    if (state === "next" && timeSlot) {
      const minutes = hhmmToMinutes(timeSlot);
      if (!Number.isNaN(minutes)) {
        // Нормализуем для сравнения (если слот завтра, добавляем 1440)
        const normalizedMinutes = minutes <= nowMinutes ? minutes + 1440 : minutes;
        if (!nextChannel || normalizedMinutes < nextChannel.minutes) {
          nextChannel = { channelId: channel.id, timeSlot, minutes: normalizedMinutes };
        }
      }
    }
  }

  // Теперь определяем предыдущий канал (последний завершившийся)
  // Ищем каналы с последним прошедшим слотом, исключая канал с активным слотом
  const validInterval = Math.max(1, Math.min(60, minIntervalMinutes || 11));
  
  for (const channel of channels) {
    // Пропускаем канал с активным слотом
    if (currentChannel && channel.id === currentChannel.channelId) {
      continue;
    }
    
    if (!channel.autoSendEnabled || !channel.autoSendSchedules) continue;

    const times = channel.autoSendSchedules
      .filter((schedule) => schedule.enabled && schedule.time)
      .map((schedule) => schedule.time)
      .sort();

    for (const time of times) {
      const slotMinutes = hhmmToMinutes(time);
      if (Number.isNaN(slotMinutes)) continue;

      // Проверяем, что слот уже завершился (не активный)
      const endMinutes = slotMinutes + validInterval;
      let isPast = false;
      
      if (endMinutes < 1440) {
        isPast = nowMinutes >= endMinutes;
      } else {
        const endNormalized = endMinutes % 1440;
        isPast = nowMinutes >= endNormalized && nowMinutes < slotMinutes;
      }

      if (isPast) {
        if (!previousChannel || slotMinutes > previousChannel.minutes) {
          previousChannel = { channelId: channel.id, timeSlot: time, minutes: slotMinutes };
        }
      }
    }
  }

  // Если нет прошедших слотов сегодня, берём последний слот вчера (исключая активный канал)
  if (!previousChannel) {
    for (const channel of channels) {
      // Пропускаем канал с активным слотом
      if (currentChannel && channel.id === currentChannel.channelId) continue;
      
      if (!channel.autoSendEnabled || !channel.autoSendSchedules) continue;

      const times = channel.autoSendSchedules
        .filter((schedule) => schedule.enabled && schedule.time)
        .map((schedule) => schedule.time)
        .sort();

      if (times.length > 0) {
        const lastTime = times[times.length - 1];
        const lastMinutes = hhmmToMinutes(lastTime);
        if (!Number.isNaN(lastMinutes)) {
          if (!previousChannel || lastMinutes > previousChannel.minutes) {
            previousChannel = { channelId: channel.id, timeSlot: lastTime, minutes: lastMinutes };
          }
        }
      }
    }
  }

  // Применяем финальные состояния и вычисляем дополнительные времена
  for (const channel of channels) {
    if (currentChannel && channel.id === currentChannel.channelId) {
      // Для текущего канала вычисляем все времена
      const currentSlotMinutes = currentChannel.minutes;
      const currentStartDate = new Date(now);
      currentStartDate.setHours(Math.floor(currentSlotMinutes / 60), currentSlotMinutes % 60, 0, 0);
      
      const currentEndDate = new Date(currentStartDate);
      currentEndDate.setMinutes(currentEndDate.getMinutes() + validInterval);

      // Находим следующий слот в этом же канале
      const channelTimes = channel.autoSendSchedules
        ?.filter((schedule) => schedule.enabled && schedule.time)
        .map((schedule) => schedule.time)
        .sort() || [];
      
      let nextSlotTime: string | undefined;
      let nextSlotDate: Date | undefined;
      let previousSlotTime: string | undefined;
      let previousSlotDate: Date | undefined;

      for (const time of channelTimes) {
        const slotMinutes = hhmmToMinutes(time);
        if (Number.isNaN(slotMinutes)) continue;

        if (slotMinutes > nowMinutes) {
          // Следующий слот сегодня
          nextSlotTime = time;
          nextSlotDate = new Date(now);
          nextSlotDate.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
          break;
        }
      }

      // Если следующий слот не найден, берём первый слот завтра
      if (!nextSlotTime && channelTimes.length > 0) {
        nextSlotTime = channelTimes[0];
        nextSlotDate = new Date(now);
        nextSlotDate.setDate(nextSlotDate.getDate() + 1);
        nextSlotDate.setHours(Math.floor(hhmmToMinutes(channelTimes[0]) / 60), hhmmToMinutes(channelTimes[0]) % 60, 0, 0);
      }

      // Находим предыдущий слот в этом же канале
      for (let i = channelTimes.length - 1; i >= 0; i--) {
        const time = channelTimes[i];
        const slotMinutes = hhmmToMinutes(time);
        if (Number.isNaN(slotMinutes)) continue;

        // Пропускаем текущий слот
        if (slotMinutes === currentSlotMinutes) continue;

        const endMinutes = slotMinutes + validInterval;
        let isPast = false;
        
        if (endMinutes < 1440) {
          isPast = nowMinutes >= endMinutes;
        } else {
          const endNormalized = endMinutes % 1440;
          isPast = nowMinutes >= endNormalized && nowMinutes < slotMinutes;
        }

        if (isPast || (slotMinutes < currentSlotMinutes)) {
          previousSlotTime = time;
          previousSlotDate = new Date(now);
          // Если слот был вчера (если его минуты больше текущих минут, значит он был вчера)
          // Или если слот завершился и его время меньше текущего времени начала
          if (slotMinutes > currentSlotMinutes || (isPast && slotMinutes < currentSlotMinutes)) {
            // Проверяем, был ли слот вчера
            if (slotMinutes > nowMinutes) {
              previousSlotDate.setDate(previousSlotDate.getDate() - 1);
            }
          }
          previousSlotDate.setHours(Math.floor(slotMinutes / 60), slotMinutes % 60, 0, 0);
          break;
        }
      }

      states.set(channel.id, {
        channelId: channel.id,
        state: "current",
        timeSlot: currentChannel.timeSlot,
        currentStartTime: currentStartDate,
        currentEndTime: currentEndDate,
        nextSlotTime,
        nextSlotDate,
        previousSlotTime,
        previousSlotDate
      });
    } else if (nextChannel && channel.id === nextChannel.channelId) {
      // Для следующего канала вычисляем время начала
      const nextSlotMinutes = nextChannel.minutes % 1440;
      const nextStartDate = new Date(now);
      
      if (nextChannel.minutes > 1440) {
        // Слот завтра
        nextStartDate.setDate(nextStartDate.getDate() + 1);
      }
      nextStartDate.setHours(Math.floor(nextSlotMinutes / 60), nextSlotMinutes % 60, 0, 0);

      states.set(channel.id, {
        channelId: channel.id,
        state: "next",
        timeSlot: nextChannel.timeSlot,
        nextStartTime: nextStartDate
      });
    } else if (previousChannel && channel.id === previousChannel.channelId) {
      // Для предыдущего канала вычисляем время начала и окончания
      const prevSlotMinutes = previousChannel.minutes;
      const previousStartDate = new Date(now);
      const previousEndDate = new Date(now);
      
      // Определяем, был ли слот вчера
      if (prevSlotMinutes > nowMinutes) {
        previousStartDate.setDate(previousStartDate.getDate() - 1);
        previousEndDate.setDate(previousEndDate.getDate() - 1);
      }
      previousStartDate.setHours(Math.floor(prevSlotMinutes / 60), prevSlotMinutes % 60, 0, 0);
      previousEndDate.setHours(Math.floor(prevSlotMinutes / 60), prevSlotMinutes % 60, 0, 0);
      previousEndDate.setMinutes(previousEndDate.getMinutes() + validInterval);

      states.set(channel.id, {
        channelId: channel.id,
        state: "previous",
        timeSlot: previousChannel.timeSlot,
        previousStartTime: previousStartDate,
        previousEndTime: previousEndDate
      });
    } else {
      states.set(channel.id, {
        channelId: channel.id,
        state: "default"
      });
    }
  }

  return states;
}

