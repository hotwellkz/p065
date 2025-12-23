import { getAuthToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface SuggestNicheParams {
  channelName?: string;
  language?: string;
  targetAudience?: string;
  tone?: string;
  platform?: string;
}

export interface SuggestNicheResponse {
  success: boolean;
  niche?: string;
  error?: string;
  message?: string;
}

/**
 * Генерирует нишу для канала через OpenAI на основе контекста мастера
 */
export async function suggestNiche(params: SuggestNicheParams): Promise<SuggestNicheResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${API_BASE}/api/channels/suggest-niche`, {
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

