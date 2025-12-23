import type { ChannelScheduleItem } from "../api/channelSchedule";
import { hhmmToMinutes, minutesToHHMM } from "./scheduleFreeSlots";

export type TimePoint = {
  time: string; // "HH:MM"
  minutes: number; // HH*60 + MM
};

export type TimeSlotInterval = {
  startMinutes: number;
  endMinutes: number; // НЕ включительно
  time: string; // "HH:MM" - время начала слота
};

/**
 * Собирает все уникальные временные слоты из всех каналов
 */
export function collectAllTimeSlots(items: ChannelScheduleItem[]): TimePoint[] {
  const timeSet = new Set<string>();
  
  for (const item of items) {
    for (const time of item.times) {
      if (time && time.trim()) {
        timeSet.add(time.trim());
      }
    }
  }
  
  const timePoints: TimePoint[] = Array.from(timeSet)
    .map((time) => {
      const minutes = hhmmToMinutes(time);
      if (Number.isNaN(minutes)) {
        return null;
      }
      return { time, minutes };
    })
    .filter((tp): tp is TimePoint => tp !== null);
  
  // Сортируем по minutes и удаляем дубликаты по minutes
  timePoints.sort((a, b) => a.minutes - b.minutes);
  
  // Удаляем дубликаты по minutes (если есть одинаковые минуты с разными форматами)
  const uniqueByMinutes: TimePoint[] = [];
  const seenMinutes = new Set<number>();
  
  for (const tp of timePoints) {
    if (!seenMinutes.has(tp.minutes)) {
      seenMinutes.add(tp.minutes);
      uniqueByMinutes.push(tp);
    }
  }
  
  return uniqueByMinutes;
}

/**
 * Строит интервалы для каждого слота
 * Каждый интервал идёт от текущего слота до следующего (не включительно)
 */
export function buildTimeSlotIntervals(timePoints: TimePoint[]): TimeSlotInterval[] {
  if (timePoints.length === 0) {
    return [];
  }
  
  // Сортируем по minutes
  const sorted = [...timePoints].sort((a, b) => a.minutes - b.minutes);
  
  // Добавляем "замкнутый" день: копию первого элемента с minutes + 1440
  const extended = [
    ...sorted,
    {
      time: sorted[0].time,
      minutes: sorted[0].minutes + 1440
    }
  ];
  
  const intervals: TimeSlotInterval[] = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = extended[i + 1];
    
    intervals.push({
      startMinutes: current.minutes,
      endMinutes: next.minutes, // НЕ включительно
      time: current.time
    });
  }
  
  return intervals;
}

/**
 * Результат поиска активного слота
 */
export type ActiveSlotResult = {
  activeTime: string | null; // "HH:MM" или null
  activeMinutes: number | null; // минуты от начала суток или null
};

/**
 * Находит активный слот на основе текущего времени
 * Слот активен ТОЛЬКО в течение minIntervalMinutes после своего времени
 * @param items - список каналов с расписанием
 * @param minIntervalMinutes - минимальный интервал между публикациями (в минутах)
 * @returns результат с активным временем и минутами
 */
export function calculateActiveTime(
  items: ChannelScheduleItem[],
  minIntervalMinutes: number
): ActiveSlotResult {
  if (items.length === 0) {
    return { activeTime: null, activeMinutes: null };
  }
  
  // Собираем все уникальные времена в минутах
  const allTimeSlots = collectAllTimeSlots(items);
  
  if (allTimeSlots.length === 0) {
    return { activeTime: null, activeMinutes: null };
  }
  
  // Получаем текущее время в минутах от начала суток
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Валидируем minIntervalMinutes
  const validInterval = Math.max(1, Math.min(60, minIntervalMinutes || 11));
  
  // Ищем активный слот
  // Слот активен, если: t <= now < t + minIntervalMinutes
  let activeMinutes: number | null = null;
  
  for (const slot of allTimeSlots) {
    const t = slot.minutes;
    const endMinutes = t + validInterval;
    
    let isActive = false;
    
    if (endMinutes < 1440) {
      // Обычный случай: окно не выходит за пределы суток
      isActive = t <= nowMinutes && nowMinutes < endMinutes;
    } else {
      // Окно выходит за полночь (например, 23:50 + 11 минут = 00:01 следующего дня)
      const endNormalized = endMinutes % 1440;
      // Активно если: now >= t (вечер) ИЛИ now < endNormalized (утро следующего дня)
      isActive = (nowMinutes >= t) || (nowMinutes < endNormalized);
    }
    
    if (isActive) {
      // Если несколько слотов активны, выбираем самый поздний
      if (activeMinutes === null || t > activeMinutes) {
        activeMinutes = t;
      }
    }
  }
  
  // Преобразуем обратно в "HH:MM"
  if (activeMinutes === null) {
    return { activeTime: null, activeMinutes: null };
  }
  
  return {
    activeTime: minutesToHHMM(activeMinutes),
    activeMinutes: activeMinutes % 1440
  };
}

/**
 * Собирает все уникальные времена в минутах из всех каналов
 * @param items - список каналов с расписанием
 * @returns отсортированный массив минут (0..1439)
 */
export function collectAllTimesMinutes(items: ChannelScheduleItem[]): number[] {
  const set = new Set<number>();
  
  for (const item of items) {
    for (const time of item.times) {
      if (time && time.trim()) {
        const minutes = hhmmToMinutes(time.trim());
        if (!Number.isNaN(minutes)) {
          set.add(minutes);
        }
      }
    }
  }
  
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Находит следующее ближайшее время публикации относительно текущего момента
 * @param allTimesMinutes - отсортированный массив всех времён в минутах (0..1439)
 * @param nowMinutes - текущее время в минутах от начала суток
 * @param activeMinutes - минуты активного слота (если есть), чтобы исключить его из поиска следующего
 * @returns минуты следующего слота или null, если слотов нет
 */
export function findNextTimeMinutes(
  allTimesMinutes: number[],
  nowMinutes: number,
  activeMinutes: number | null = null
): number | null {
  if (allTimesMinutes.length === 0) {
    return null;
  }
  
  // Ищем первый слот строго после текущего времени
  // Исключаем активный слот, если он есть
  for (const t of allTimesMinutes) {
    if (t > nowMinutes && (activeMinutes === null || t !== activeMinutes)) {
      return t;
    }
  }
  
  // Если все слоты уже прошли — берём самый ранний слот следующего дня
  // Но не берём активный слот, если он есть
  if (activeMinutes !== null) {
    // Ищем первый слот, который не является активным
    for (const t of allTimesMinutes) {
      if (t !== activeMinutes) {
        return t;
      }
    }
    // Если все слоты - это активный слот, возвращаем null
    return null;
  }
  
  return allTimesMinutes[0];
}

/**
 * Находит предыдущее ближайшее время публикации относительно текущего момента
 * Возвращает последний временной слот, который уже прошёл (<= nowMinutes)
 * @param allTimesMinutes - отсортированный массив всех времён в минутах (0..1439), отсортированный по возрастанию
 * @param nowMinutes - текущее время в минутах от начала суток
 * @returns минуты предыдущего слота (всегда возвращает значение, если есть слоты)
 */
export function findPreviousTimeMinutes(
  allTimesMinutes: number[],
  nowMinutes: number
): number | null {
  if (allTimesMinutes.length === 0) {
    return null;
  }
  
  let prev: number | null = null;
  
  // Ищем последний слот, который меньше или равен текущему времени
  // previousTime = последний временной слот, который уже прошёл сегодня
  for (const t of allTimesMinutes) {
    if (t <= nowMinutes) {
      prev = t; // берём самый поздний, который <= now
    } else {
      break; // массив отсортирован, дальше искать не нужно
    }
  }
  
  // Если сейчас раннее утро и ни один слот ещё не наступил —
  // previousTime = последний слот в списке (вчерашний)
  if (prev === null) {
    prev = allTimesMinutes[allTimesMinutes.length - 1];
  }
  
  return prev;
}

