import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import type { TelegramUserIntegration, TelegramIntegrationStatus } from "../types/telegramUserIntegration";
import { Logger } from "../utils/logger";

const COLLECTION = "telegramUserIntegrations";

export async function findTelegramIntegrationByUserId(
  userId: string
): Promise<TelegramUserIntegration | null> {
  try {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }
    const snapshot = await db
      .collection(COLLECTION)
      .where("userId", "==", userId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    } as TelegramUserIntegration;
  } catch (error) {
    Logger.error("Error finding telegram integration", error);
    throw error;
  }
}

export async function createTelegramIntegration(
  userId: string,
  phoneNumber: string,
  status: TelegramIntegrationStatus,
  sessionEncrypted: string = "",
  meta?: Record<string, any>
): Promise<TelegramUserIntegration> {
  try {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }
    const now = new Date();

    const data = {
      userId,
      phoneNumber,
      sessionEncrypted,
      status,
      meta: meta || {},
      createdAt: now,
      updatedAt: now
    };

    const docRef = await db.collection(COLLECTION).add(data);
    
    return {
      id: docRef.id,
      ...data
    } as TelegramUserIntegration;
  } catch (error) {
    Logger.error("Error creating telegram integration", error);
    throw error;
  }
}

export async function updateTelegramIntegration(
  integrationId: string,
  updates: Partial<{
    status: TelegramIntegrationStatus;
    sessionEncrypted: string;
    lastError: string | null;
    meta: Record<string, any> | null;
  }>
): Promise<void> {
  try {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }
    
    // Подготавливаем данные для обновления, удаляя undefined значения
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }
    if (updates.sessionEncrypted !== undefined) {
      updateData.sessionEncrypted = updates.sessionEncrypted;
    }
    if (updates.lastError !== undefined) {
      updateData.lastError = updates.lastError;
    }
    if (updates.meta !== undefined) {
      // Если meta содержит undefined значения, удаляем их
      if (updates.meta === null) {
        updateData.meta = null;
      } else {
        const cleanedMeta: Record<string, any> = {};
        for (const [key, value] of Object.entries(updates.meta)) {
          if (value !== undefined) {
            cleanedMeta[key] = value;
          }
        }
        updateData.meta = cleanedMeta;
      }
    }
    
    Logger.info("Updating telegram integration", {
      integrationId,
      updateKeys: Object.keys(updateData),
      hasStatus: updateData.status !== undefined,
      hasSession: updateData.sessionEncrypted !== undefined
    });
    
    await db.collection(COLLECTION).doc(integrationId).update(updateData);
    
    Logger.info("Telegram integration updated successfully", { integrationId });
  } catch (error) {
    Logger.error("Error updating telegram integration", {
      integrationId,
      error: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}

export async function deleteTelegramIntegration(
  integrationId: string
): Promise<void> {
  try {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }
    await db.collection(COLLECTION).doc(integrationId).delete();
  } catch (error) {
    Logger.error("Error deleting telegram integration", error);
    throw error;
  }
}

