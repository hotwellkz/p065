import { getAuthToken } from "../utils/auth";
import { API_BASE_URL } from "../config/api";

export interface UserSettings {
  defaultBlottataApiKey: string | null;
  hasDefaultBlottataApiKey: boolean;
  hasSeenChannelWizard?: boolean;
}

export interface UserSettingsResponse {
  success: boolean;
  settings: UserSettings;
  error?: string;
  message?: string;
}

/**
 * Получает настройки пользователя
 */
export async function getUserSettings(): Promise<UserSettings> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  const data: UserSettingsResponse = await response.json().catch(() => ({
    success: false,
    settings: {
      defaultBlottataApiKey: null,
      hasDefaultBlottataApiKey: false
    }
  }));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Не удалось загрузить настройки");
  }

  return data.settings;
}

/**
 * Обновляет настройки пользователя
 */
export async function updateUserSettings(settings: {
  defaultBlottataApiKey?: string | null;
  hasSeenChannelWizard?: boolean;
}): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(settings)
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: "Unknown error"
  }));

  if (!response.ok) {
    throw new Error(data.message || data.error || "Не удалось сохранить настройки");
  }
}

