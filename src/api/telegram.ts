import axios from "axios";
import { getAuth } from "firebase/auth";

const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

async function getAuthHeader() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Not authenticated");
  }
  // Получаем токен с принудительным обновлением, если он истек
  // forceRefresh: true гарантирует получение свежего токена
  const token = await user.getIdToken(true);
  return { Authorization: `Bearer ${token}` };
}

export async function telegramStart(phone: string) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/start`,
    { phone },
    { headers }
  );
  return res.data as { status: string };
}

export async function telegramConfirm(
  phone: string,
  code: string,
  password?: string
) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/confirm`,
    { phone, code, password },
    { headers }
  );
  return res.data as { status: string; phoneMasked?: string };
}

export async function telegramDisconnect() {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/disconnect`,
    {},
    { headers }
  );
  return res.data as { status: string };
}

export async function telegramStatus() {
  const headers = await getAuthHeader();
  const res = await axios.get(`${backendBaseUrl}/api/telegram/status`, {
    headers
  });
  return res.data as
    | { connected: false }
    | { connected: true; phoneMasked: string };
}

export async function telegramSendPrompt(channelId: string, prompt: string) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/sendPrompt`,
    { channelId, prompt },
    { headers }
  );
  return res.data as { status: string; error?: string };
}

export async function sendPromptToSyntx(prompt: string, channelId?: string) {
  try {
    const headers = await getAuthHeader();
    console.log("Отправка промпта в Syntx:", {
      channelId: channelId || "не указан (будет использован глобальный аккаунт)",
      promptLength: prompt.length,
      hasAuthHeader: !!headers.Authorization
    });
    
    const res = await axios.post(
      `${backendBaseUrl}/api/telegram/sendPromptToSyntx`,
      { prompt, channelId },
      { headers }
    );
    return res.data as { status: string; error?: string; message?: string };
  } catch (error: any) {
    // Улучшенная обработка ошибок с логированием
    if (error.response) {
      // Сервер ответил с ошибкой
      console.error("Ошибка при отправке в Syntx:", {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers,
        channelId
      });
      
      // Пробрасываем ошибку дальше для обработки в компоненте
      throw error;
    } else if (error.request) {
      // Запрос был отправлен, но ответа не получено
      console.error("Нет ответа от сервера при отправке в Syntx:", error.request);
      throw new Error("Не удалось подключиться к серверу. Проверьте подключение к интернету.");
    } else {
      // Ошибка при настройке запроса
      console.error("Ошибка при настройке запроса в Syntx:", error.message);
      throw error;
    }
  }
}

export async function fetchLatestVideoToDrive(channelId: string) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/fetchLatestVideoToDrive`,
    { channelId },
    { headers }
  );
  return res.data as {
    status: string;
    driveFileId?: string;
    webViewLink?: string;
    webContentLink?: string;
    error?: string;
    message?: string;
  };
}

export async function fetchAndSaveToServer(
  channelId: string,
  telegramMessageId?: number,
  videoTitle?: string
) {
  const headers = await getAuthHeader();
  const res = await axios.post(
    `${backendBaseUrl}/api/telegram/fetchAndSaveToServer`,
    { channelId, telegramMessageId, videoTitle },
    { headers }
  );
  return res.data as {
    status: string;
    success?: boolean;
    channelId?: string;
    channelName?: string;
    inputPath?: string;
    filename?: string;
    channelSlug?: string;
    fileName?: string;
    message?: string;
    storage?: {
      userEmail: string;
      userDir: string;
      inputDir: string;
      archiveDir: string;
      filePath: string;
      fileName: string;
    };
  };
}


