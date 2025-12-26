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
  ok?: boolean;
  error?: string;
  jobId?: string;
  channelId?: string;
  stage?: string;
  createdAt?: string;
  message?: string;
  requestId?: string;
  // Legacy fields
  status?: "PROCESSING" | "DONE" | "FAILED";
  taskId?: string;
  trackPath?: string;
  finalVideoPath?: string;
  publishedPlatforms?: string[];
}

export interface MusicClipsJobStatusResponse {
  success: boolean;
  ok?: boolean;
  jobId: string;
  channelId: string;
  stage: string;
  progressText?: string;
  sunoTaskId?: string | null;
  audioUrl?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  heartbeat: {
    secondsSinceUpdate: number;
    isStale: boolean;
  };
  requestId?: string;
}

export interface MusicClipsTaskStatusResponse {
  success: boolean;
  ok?: boolean;
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

  // 202 Accepted - job создан, но ещё обрабатывается
  if (response.status === 202) {
    return {
      ...data,
      jobId: data.jobId,
      stage: data.stage || "STAGE_10_REQUEST_ACCEPTED"
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
 * Проверяет статус job'а генерации музыки
 * @param jobId - ID job'а
 */
export async function getMusicClipsJobStatus(
  jobId: string
): Promise<MusicClipsJobStatusResponse> {
  const token = await getAuthToken();

  const response = await fetch(
    `${backendBaseUrl}/api/music-clips/jobs/${jobId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await response.json().catch(() => ({}));

  // 404 - job не найден
  if (response.status === 404) {
    const error = new Error(data.message || `Job ${jobId} не найден`) as Error & { code?: string; status?: number };
    error.code = data.error || "JOB_NOT_FOUND";
    error.status = 404;
    throw error;
  }

  // 200 OK - возвращаем данные
  if (response.ok) {
    return data as MusicClipsJobStatusResponse;
  }

  // Другие ошибки
  throw new Error(
    data.error || data.message || `Ошибка при проверке статуса: ${response.status}`
  );
}

/**
 * Проверяет статус задачи генерации музыки (legacy, для совместимости)
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

