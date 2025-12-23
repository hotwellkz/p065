const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

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

/**
 * Получает минимальный интервал между публикациями для указанного времени суток
 * @param date - Дата/время для определения диапазона
 * @param settings - Настройки расписания
 * @returns Минимальный интервал в минутах
 */
export function getMinIntervalForTime(date: Date, settings: ScheduleSettings): number {
  const h = date.getHours();
  
  // Определяем диапазон времени суток
  if (h >= 0 && h < 13) {
    // 00:00–13:00
    return settings.minInterval_00_13 ?? settings.minIntervalMinutes ?? DEFAULT_SETTINGS.minInterval_00_13!;
  } else if (h >= 13 && h < 17) {
    // 13:00–17:00
    return settings.minInterval_13_17 ?? settings.minIntervalMinutes ?? DEFAULT_SETTINGS.minInterval_13_17!;
  } else {
    // 17:00–24:00
    return settings.minInterval_17_24 ?? settings.minIntervalMinutes ?? DEFAULT_SETTINGS.minInterval_17_24!;
  }
}

/**
 * Получает минимальный интервал для времени в минутах (0-1439)
 * @param minutes - Время в минутах от начала суток (0-1439)
 * @param settings - Настройки расписания
 * @returns Минимальный интервал в минутах
 */
export function getMinIntervalForMinutes(minutes: number, settings: ScheduleSettings): number {
  const h = Math.floor(minutes / 60);
  
  if (h >= 0 && h < 13) {
    return settings.minInterval_00_13 ?? settings.minIntervalMinutes ?? DEFAULT_SETTINGS.minInterval_00_13!;
  } else if (h >= 13 && h < 17) {
    return settings.minInterval_13_17 ?? settings.minIntervalMinutes ?? DEFAULT_SETTINGS.minInterval_13_17!;
  } else {
    return settings.minInterval_17_24 ?? settings.minIntervalMinutes ?? DEFAULT_SETTINGS.minInterval_17_24!;
  }
}

/**
 * Получает настройки расписания для текущего пользователя
 */
export async function fetchScheduleSettings(): Promise<ScheduleSettings> {
  const token = await getAuthToken();

  try {
    const response = await fetch(`${backendBaseUrl}/api/schedule/settings`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.message || `Ошибка при получении настроек расписания: ${response.status}`
      );
    }

    const data = (await response.json()) as ScheduleSettings;
    
    // Миграция: если есть старое поле, но нет новых, копируем его во все три
    const oldInterval = data.minIntervalMinutes ?? DEFAULT_SETTINGS.minIntervalMinutes;
    
    return {
      minIntervalMinutes: oldInterval,
      minInterval_00_13: data.minInterval_00_13 ?? oldInterval,
      minInterval_13_17: data.minInterval_13_17 ?? oldInterval,
      minInterval_17_24: data.minInterval_17_24 ?? oldInterval,
      conflictsCheckEnabled:
        typeof data.conflictsCheckEnabled === "boolean"
          ? data.conflictsCheckEnabled
          : DEFAULT_SETTINGS.conflictsCheckEnabled,
      isAutomationPaused:
        typeof data.isAutomationPaused === "boolean"
          ? data.isAutomationPaused
          : DEFAULT_SETTINGS.isAutomationPaused
    };
  } catch {
    // При ошибке возвращаем значения по умолчанию
    return DEFAULT_SETTINGS;
  }
}

/**
 * Обновляет настройки расписания
 */
export async function updateScheduleSettings(
  settings: ScheduleSettings
): Promise<ScheduleSettings> {
  const token = await getAuthToken();

  const response = await fetch(`${backendBaseUrl}/api/schedule/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      minIntervalMinutes: settings.minIntervalMinutes,
      minInterval_00_13: settings.minInterval_00_13,
      minInterval_13_17: settings.minInterval_13_17,
      minInterval_17_24: settings.minInterval_17_24,
      conflictsCheckEnabled: settings.conflictsCheckEnabled,
      isAutomationPaused: settings.isAutomationPaused
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Ошибка при обновлении настроек расписания: ${response.status}`
    );
  }

    const data = (await response.json()) as ScheduleSettings;
    
    // Миграция: если есть старое поле, но нет новых, копируем его во все три
    const oldInterval = data.minIntervalMinutes ?? DEFAULT_SETTINGS.minIntervalMinutes;
    
    return {
      minIntervalMinutes: oldInterval,
      minInterval_00_13: data.minInterval_00_13 ?? oldInterval,
      minInterval_13_17: data.minInterval_13_17 ?? oldInterval,
      minInterval_17_24: data.minInterval_17_24 ?? oldInterval,
      conflictsCheckEnabled:
        typeof data.conflictsCheckEnabled === "boolean"
          ? data.conflictsCheckEnabled
          : DEFAULT_SETTINGS.conflictsCheckEnabled,
      isAutomationPaused:
        typeof data.isAutomationPaused === "boolean"
          ? data.isAutomationPaused
          : DEFAULT_SETTINGS.isAutomationPaused
    };
}

async function getAuthToken(): Promise<string> {
  const { getAuth } = await import("firebase/auth");
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Пользователь не авторизован");
  }

  const token = await user.getIdToken();
  return token;
}



