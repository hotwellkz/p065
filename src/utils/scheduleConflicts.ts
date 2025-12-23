import type { ChannelScheduleItem } from "../api/channelSchedule";
import type { ScheduleSettings } from "../api/scheduleSettings";
import { getMinIntervalForMinutes } from "../api/scheduleSettings";

export type ConflictKey = string; // `${channelId}-${time}`

interface TimePoint {
  channelId: string;
  channelName: string;
  time: string; // "HH:MM"
  minutes: number; // HH * 60 + MM
}

/**
 * Рассчитывает набор конфликтующих времён между всеми каналами.
 * Конфликт — когда расстояние между двумя публикациями меньше минимального интервала
 * для соответствующего времени суток, учитывая переход через полночь.
 * 
 * @param channels - Список каналов с расписаниями
 * @param settings - Настройки расписания (содержат интервалы по времени суток)
 */
export function calculateScheduleConflicts(
  channels: ChannelScheduleItem[],
  settings: ScheduleSettings
): Set<ConflictKey> {
  const conflictSet = new Set<ConflictKey>();

  if (!channels || channels.length === 0) {
    return conflictSet;
  }

  const points: TimePoint[] = [];

  for (const channel of channels) {
    for (const time of channel.times) {
      if (!time || !/^\d{2}:\d{2}$/.test(time)) continue;
      const [hh, mm] = time.split(":").map(Number);
      if (
        Number.isNaN(hh) ||
        Number.isNaN(mm) ||
        hh < 0 ||
        hh > 23 ||
        mm < 0 ||
        mm > 59
      ) {
        continue;
      }

      const minutes = hh * 60 + mm;
      points.push({
        channelId: channel.id,
        channelName: channel.name,
        time,
        minutes
      });
    }
  }

  if (points.length < 2) {
    return conflictSet;
  }

  // Сортируем по времени
  points.sort((a, b) => a.minutes - b.minutes);

  const markConflict = (a: TimePoint, b: TimePoint) => {
    conflictSet.add(`${a.channelId}-${a.time}`);
    conflictSet.add(`${b.channelId}-${b.time}`);
  };

  // Сравниваем соседей
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const diff = next.minutes - current.minutes;
    
    // Используем интервал для времени следующей публикации (более строгий подход)
    // Можно также использовать максимум из интервалов для обеих публикаций
    const requiredInterval = getMinIntervalForMinutes(next.minutes, settings);
    
    if (diff < requiredInterval) {
      markConflict(current, next);
    }
  }

  // Учитываем переход через полночь: последний и первый
  const first = points[0];
  const last = points[points.length - 1];
  const wrapDiff = first.minutes + 1440 - last.minutes;
  
  // Используем интервал для времени первой публикации (которая идет после последней через полночь)
  const requiredIntervalWrap = getMinIntervalForMinutes(first.minutes, settings);
  
  if (wrapDiff < requiredIntervalWrap) {
    markConflict(last, first);
  }

  return conflictSet;
}


