const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

export interface ChannelScheduleItem {
  id: string;
  index: number;
  name: string;
  times: string[];
  platform: string;
  isAutomationEnabled: boolean;
}

/**
 * Получает расписание всех каналов пользователя
 */
export async function fetchChannelSchedule(): Promise<ChannelScheduleItem[]> {
  const token = await getAuthToken();
  
  const response = await fetch(`${backendBaseUrl}/api/channels/schedule`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка при получении расписания: ${response.status}`);
  }

  return response.json();
}

/**
 * Обновляет расписание канала
 * @param channelId - ID канала
 * @param times - Массив времён в формате "HH:MM"
 */
export async function updateChannelSchedule(
  channelId: string,
  times: string[]
): Promise<ChannelScheduleItem> {
  const token = await getAuthToken();
  
  const response = await fetch(`${backendBaseUrl}/api/channels/${channelId}/schedule`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ times })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка при обновлении расписания: ${response.status}`);
  }

  return response.json();
}

/**
 * Обновляет статус автоматизации канала
 * @param channelId - ID канала
 * @param autoSendEnabled - Включена ли автоматизация
 */
export async function updateChannelAutomation(
  channelId: string,
  autoSendEnabled: boolean
): Promise<{ success: boolean; autoSendEnabled: boolean }> {
  const token = await getAuthToken();
  
  const response = await fetch(`${backendBaseUrl}/api/channels/${channelId}/automation`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ autoSendEnabled })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка при обновлении автоматизации: ${response.status}`);
  }

  return response.json();
}

/**
 * Получает токен авторизации из Firebase Auth
 */
export async function getAuthToken(): Promise<string> {
  const { getAuth } = await import("firebase/auth");
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error("Пользователь не авторизован");
  }
  
  const token = await user.getIdToken();
  return token;
}

