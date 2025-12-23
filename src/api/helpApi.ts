import { getAuthToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface ExplainFieldParams {
  fieldKey: string;
  page: string;
  userQuestion: string;
  currentValue?: any;
  channelContext?: any;
}

export interface ExplainFieldResponse {
  success: boolean;
  answer?: string;
  fieldKey?: string;
  error?: string;
  message?: string;
}

export interface ExplainSectionParams {
  sectionKey: "telegram_integration" | "google_drive_integration" | "profile" | "generate_drive_folders";
  page?: string;
  sectionTitle?: string;
  currentStatus?: string;
  question?: string;
  context?: any;
}

export interface ExplainSectionResponse {
  success: boolean;
  answer?: string;
  sectionKey?: string;
  error?: string;
  message?: string;
}

/**
 * Запрашивает объяснение поля через AI ассистента
 */
export async function explainField(params: ExplainFieldParams): Promise<ExplainFieldResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${API_BASE}/api/help/explain-field`, {
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

/**
 * Запрашивает объяснение секции через AI ассистента
 */
export async function explainSection(params: ExplainSectionParams): Promise<ExplainSectionResponse> {
  const token = await getAuthToken();
  
  const response = await fetch(`${API_BASE}/api/help/explain-section`, {
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

