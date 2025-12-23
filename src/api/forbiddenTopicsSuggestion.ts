import { getAuthToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface SuggestForbiddenTopicsParams {
  channelName?: string;
  platform?: string;
  language?: string;
  niche?: string;
  targetAudience?: string;
  tone?: string;
  additionalNotes?: string;
}

export interface SuggestForbiddenTopicsResponse {
  success: boolean;
  forbiddenTopics?: string;
  error?: string;
  message?: string;
}

/**
 * Генерирует список запрещённых тем для канала через OpenAI на основе контекста мастера
 */
export async function suggestForbiddenTopics(
  params: SuggestForbiddenTopicsParams
): Promise<SuggestForbiddenTopicsResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${API_BASE}/api/channels/suggest-forbidden-topics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(params)
  });

  const data = await response.json().catch(() => ({
    success: false,
    error: "PARSE_ERROR",
    message: "Не удалось обработать ответ сервера"
  }));

  if (!response.ok) {
    return {
      success: false,
      error: data.error || "REQUEST_FAILED",
      message: data.message || `Ошибка ${response.status}: ${response.statusText}`
    };
  }

  return data;
}

