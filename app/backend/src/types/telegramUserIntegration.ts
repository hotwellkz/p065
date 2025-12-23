export type TelegramIntegrationStatus = 
  | "not_connected" 
  | "waiting_code" 
  | "active" 
  | "error";

export interface TelegramUserIntegration {
  id: string;
  userId: string;
  phoneNumber: string;
  sessionEncrypted: string; // зашифрованная StringSession
  status: TelegramIntegrationStatus;
  lastError?: string | null;
  meta?: {
    phoneCodeHash?: string;
    [key: string]: any;
  };
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}


