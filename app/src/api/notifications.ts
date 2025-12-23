import { getAuth } from "firebase/auth";
import { API_BASE_URL } from "../config/api";

export type NotificationType = 
  | "video_uploaded" 
  | "video_download_failed" 
  | "video_upload_failed" 
  | "generation_error"
  | "automation_error";

export type NotificationStatus = "success" | "error" | "info";

export interface Notification {
  id: string;
  userId: string;
  channelId: string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  createdAt: Date;
  updatedAt: Date;
  isRead: boolean;
  driveFileUrl?: string;
  telegramMessageUrl?: string;
  metadata?: {
    fileName?: string;
    scheduleId?: string;
    timeSlot?: string;
    errorDetails?: string;
  };
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  limit: number;
  offset: number;
}

export interface UnreadCountResponse {
  count: number;
}

async function getAuthToken(): Promise<string | null> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken();
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("User not authenticated");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Unknown error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response;
}

/**
 * Получить список уведомлений
 */
export async function fetchNotifications(options?: {
  status?: NotificationStatus;
  isRead?: boolean;
  limit?: number;
  offset?: number;
}): Promise<NotificationsResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.append("status", options.status);
  if (options?.isRead !== undefined) params.append("isRead", String(options.isRead));
  if (options?.limit) params.append("limit", String(options.limit));
  if (options?.offset) params.append("offset", String(options.offset));

  const url = `${API_BASE_URL}/api/notifications${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetchWithAuth(url);
  const data = await response.json();

  // Преобразуем строки дат в объекты Date
  return {
    ...data,
    notifications: data.notifications.map((n: any) => ({
      ...n,
      createdAt: new Date(n.createdAt),
      updatedAt: new Date(n.updatedAt)
    }))
  };
}

/**
 * Получить количество непрочитанных уведомлений
 */
export async function fetchUnreadCount(): Promise<number> {
  const url = `${API_BASE_URL}/api/notifications/unread-count`;
  const response = await fetchWithAuth(url);
  const data: UnreadCountResponse = await response.json();
  return data.count;
}

/**
 * Пометить уведомление как прочитанное
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const url = `${API_BASE_URL}/api/notifications/${notificationId}/read`;
  await fetchWithAuth(url, {
    method: "PATCH"
  });
}

/**
 * Пометить все уведомления как прочитанные
 */
export async function markAllNotificationsAsRead(): Promise<void> {
  const url = `${API_BASE_URL}/api/notifications/read-all`;
  await fetchWithAuth(url, {
    method: "PATCH"
  });
}



