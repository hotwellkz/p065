import { getAuthToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

/**
 * Проверяет пароль для доступа к использованию общего Telegram аккаунта
 * @param password - Пароль администратора
 */
export async function verifyTelegramGlobalPassword(password: string): Promise<{ success: boolean; message?: string }> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/admin/telegram-global/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ password })
  });

  const responseData = await response.json().catch(() => ({ error: "Unknown error" }));

  if (!response.ok) {
    const errorCode = responseData.error || "VERIFICATION_FAILED";
    const errorMessage = responseData.message || errorCode;
    const error = new Error(errorMessage);
    (error as any).code = errorCode;
    throw error;
  }

  return responseData;
}

