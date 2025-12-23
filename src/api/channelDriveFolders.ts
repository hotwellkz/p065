import { getAuthToken } from "../utils/auth";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export interface GenerateDriveFoldersResponse {
  success: boolean;
  rootFolderId?: string;
  archiveFolderId?: string;
  rootFolderName?: string;
  archiveFolderName?: string;
  error?: string;
  message?: string;
}

/**
 * Создаёт структуру папок Google Drive для канала и автоматически заполняет поля
 */
export async function generateDriveFolders(channelId: string): Promise<GenerateDriveFoldersResponse> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/channels/${channelId}/generate-drive-folders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  let data: GenerateDriveFoldersResponse;
  
  try {
    data = await response.json();
  } catch (parseError) {
    // Если не удалось распарсить JSON, возвращаем ошибку
    throw new Error("Не удалось обработать ответ сервера");
  }

  if (!response.ok) {
    // Извлекаем понятное сообщение об ошибке
    const errorMessage = data.message || data.error || `Ошибка ${response.status}: ${response.statusText}`;
    const error = new Error(errorMessage);
    // Добавляем код ошибки для более точной обработки
    (error as any).code = data.error || "UNKNOWN_ERROR";
    throw error;
  }

  return data;
}

/**
 * Создаёт структуру папок Google Drive для канала в мастере (до создания канала в БД)
 */
export async function generateDriveFoldersForWizard(params: {
  channelName: string;
  channelUuid?: string;
}): Promise<GenerateDriveFoldersResponse> {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE}/api/channels/wizard/generate-drive-folders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      channelName: params.channelName,
      channelUuid: params.channelUuid
    })
  });

  let data: GenerateDriveFoldersResponse;
  
  try {
    data = await response.json();
  } catch (parseError) {
    throw new Error("Не удалось обработать ответ сервера");
  }

  if (!response.ok) {
    const errorMessage = data.message || data.error || `Ошибка ${response.status}: ${response.statusText}`;
    const error = new Error(errorMessage);
    (error as any).code = data.error || "UNKNOWN_ERROR";
    throw error;
  }

  return data;
}

