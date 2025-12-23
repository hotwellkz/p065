import { getAuthToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface TelegramIntegrationStatus {
  status: "not_connected" | "waiting_code" | "active" | "error";
  phoneNumber?: string;
  lastError?: string | null;
}

/**
 * Запрашивает код подтверждения для номера телефона
 */
export async function requestTelegramCode(phoneNumber: string): Promise<{ phoneCodeHash: string }> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/telegram-integration/request-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ phoneNumber })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to request code");
  }

  return response.json();
}

/**
 * Подтверждает код и завершает авторизацию
 */
export async function confirmTelegramCode(code: string, password?: string): Promise<{ status: string; message?: string }> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/telegram-integration/confirm-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ code, password })
  });

  const responseData = await response.json().catch(() => ({ error: "Unknown error" }));

  if (!response.ok) {
    // Извлекаем код ошибки и сообщение из ответа
    const errorCode = responseData.error || "FAILED_TO_CONFIRM_CODE";
    const errorMessage = responseData.message || errorCode;
    const error = new Error(errorMessage);
    (error as any).code = errorCode;
    throw error;
  }

  return responseData;
}

/**
 * Отключает Telegram интеграцию
 */
export async function disconnectTelegram(): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/telegram-integration/disconnect`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to disconnect");
  }

  return response.json();
}

/**
 * Получает статус Telegram интеграции
 */
export async function getTelegramStatus(): Promise<TelegramIntegrationStatus> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/telegram-integration/status`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(error.error || "Failed to get status");
  }

  return response.json();
}

/**
 * Сбрасывает Telegram интеграцию
 */
export async function resetTelegramIntegration(): Promise<{ success: boolean; message?: string }> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/telegram-integration/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  const responseData = await response.json().catch(() => ({ error: "Unknown error" }));

  if (!response.ok) {
    const errorCode = responseData.error || "FAILED_TO_RESET";
    const errorMessage = responseData.message || errorCode;
    const error = new Error(errorMessage);
    (error as any).code = errorCode;
    throw error;
  }

  return responseData;
}

