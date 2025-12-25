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
  error?: string;
  trackPath?: string;
  finalVideoPath?: string;
  publishedPlatforms?: string[];
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

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.error || error.message || `Ошибка при запуске Music Clips: ${response.status}`
    );
  }

  return response.json();
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

