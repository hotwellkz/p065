const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

export interface CustomPromptRequest {
  prompt: string;
  title?: string;
}

export interface CustomPromptResponse {
  jobId: string;
  status: "queued";
  messageId: number;
  chatId: string;
}

/**
 * Отправляет кастомный промпт для генерации видео
 * @param channelId - ID канала
 * @param prompt - Текст промпта
 * @param title - Опциональное название видео
 */
export async function runCustomPrompt(
  channelId: string,
  prompt: string,
  title?: string
): Promise<CustomPromptResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${backendBaseUrl}/api/channels/${channelId}/run-custom-prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      prompt: prompt.trim(),
      title: title?.trim() || undefined
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Ошибка при запуске генерации: ${response.status}`);
  }

  return response.json();
}

/**
 * Получает токен авторизации из Firebase Auth
 */
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


