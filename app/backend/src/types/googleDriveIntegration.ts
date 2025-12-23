export type GoogleDriveIntegrationStatus = "not_connected" | "active" | "error";

export interface GoogleDriveIntegration {
  id: string;
  userId: string;
  email?: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number; // timestamp в миллисекундах
  status: GoogleDriveIntegrationStatus;
  lastError?: string | null;
  scopesVersion?: number; // Версия scopes, использованных при авторизации
  createdAt: Date;
  updatedAt: Date;
}

