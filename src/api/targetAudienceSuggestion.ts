import { getAuthToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface SuggestTargetAudienceParams {
  channelName?: string;
  platform?: string;
  language?: string;
  niche?: string;
  videoDuration?: number;
  tone?: string;
  additionalNotes?: string;
}

export interface SuggestTargetAudienceResponse {
  success: boolean;
  targetAudience?: string;
  error?: string;
  message?: string;
}

/**
 * Генерирует описание целевой аудитории для канала через OpenAI на основе контекста мастера
 */
export async function suggestTargetAudience(
  params: SuggestTargetAudienceParams
): Promise<SuggestTargetAudienceResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${API_BASE}/api/channels/suggest-target-audience`, {
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

