import { getAuthToken } from "./channelSchedule";
import { API_BASE_URL } from "../config/api";

export interface TestBlottataResponse {
  success: boolean;
  message: string;
  result?: {
    fileId: string;
    fileName: string;
    publishedPlatforms: string[];
    errors: string[];
  };
}

/**
 * Тестирует Blotato автоматизацию для канала
 * @param channelId - ID канала
 * @param fileId - Опциональный ID файла для тестирования
 */
export async function testBlottata(
  channelId: string,
  fileId?: string
): Promise<TestBlottataResponse> {
  const token = await getAuthToken();

  const response = await fetch(
    `${API_BASE_URL}/api/channels/${channelId}/test-blottata`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ fileId })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `Ошибка при тестировании Blotato: ${response.status}`
    );
  }

  return response.json();
}

