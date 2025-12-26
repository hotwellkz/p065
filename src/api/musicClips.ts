/**
 * API client для Music Clips
 */

import { getAuthToken } from "../utils/auth";

const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  "https://api.shortsai.ru";

export interface MusicClipsRunOnceResponse {
  success: boolean;
  ok?: boolean; // Дополнительное поле для совместимости
  error?: string;
  trackPath?: string;
  finalVideoPath?: string;
  publishedPlatforms?: string[];
  status?: "PROCESSING" | "DONE" | "FAILED";
  taskId?: string;
  message?: string;
  requestId?: string;
}

export interface MusicClipsTaskStatusResponse {
  success: boolean;
  ok?: boolean; // Дополнительное поле для совместимости
  status: "PROCESSING" | "DONE" | "FAILED";
  taskId: string;
  audioUrl?: string;
  title?: string;
  duration?: number;
  errorMessage?: string;
  message?: string;
  requestId?: string;
}

/**
 * Запускает пайплайн Music Clips для одного канала
 * @param channelId - ID канала
 * @param userId - ID пользователя
 */
export async function runMusicClipsOnce(
  channelId: string,
  userId: string
): Promise<MusicClipsRunOnceResponse> {
  const token = await getAuthToken();

  const response = await fetch(
    `${backendBaseUrl}/api/music-clips/channels/${channelId}/runOnce`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-user-id": userId
      },
      body: JSON.stringify({ userId })
    }
  );

  const data = await response.json().catch(() => ({}));

  // 202 Accepted - задача создана, но ещё обрабатывается
  if (response.status === 202) {
    return {
      ...data,
      status: data.status || "PROCESSING"
    } as MusicClipsRunOnceResponse;
  }

  // Ошибки
  if (!response.ok) {
    throw new Error(
      data.error || data.message || `Ошибка при запуске Music Clips: ${response.status}`
    );
  }

  // 200 OK - успешное завершение
  return {
    ...data,
    status: data.status || "DONE"
  } as MusicClipsRunOnceResponse;
}

/**
 * Проверяет статус задачи генерации музыки
 * @param taskId - ID задачи Suno
 * @param userId - ID пользователя
 */
export async function getMusicClipsTaskStatus(
  taskId: string,
  userId: string
): Promise<MusicClipsTaskStatusResponse> {
  const token = await getAuthToken();

  const response = await fetch(
    `${backendBaseUrl}/api/music-clips/tasks/${taskId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-user-id": userId
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  // 404 - задача не найдена
  if (response.status === 404) {
    throw new Error(data.message || `Задача ${taskId} не найдена`);
  }

  // 502/503 - ошибка Suno API
  if (response.status >= 500 && response.status < 600) {
    throw new Error(
      data.error || data.message || `Ошибка Suno API: ${response.status}`
    );
  }

  // 200 OK - возвращаем данные (может быть PROCESSING, DONE или FAILED)
  if (response.ok) {
    return data as MusicClipsTaskStatusResponse;
  }

  // Другие ошибки
  throw new Error(
    data.error || data.message || `Ошибка при проверке статуса: ${response.status}`
  );
}

/**
 * Формирует URL для доступа к медиа-файлам Music Clips
 * @param userFolderKey - Ключ папки пользователя
 * @param channelFolderKey - Ключ папки канала
 * @param fileName - Имя файла
 */
export function getMusicClipsMediaUrl(
  userFolderKey: string,
  channelFolderKey: string,
  fileName: string
): string {
  return `${backendBaseUrl}/api/music-clips/media/${userFolderKey}/${channelFolderKey}/${encodeURIComponent(fileName)}`;
}

