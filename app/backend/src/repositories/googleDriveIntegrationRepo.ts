import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import type { GoogleDriveIntegration, GoogleDriveIntegrationStatus } from "../types/googleDriveIntegration";
import { Logger } from "../utils/logger";

const COLLECTION = "googleDriveIntegrations";

export async function findGoogleDriveIntegrationByUserId(
  userId: string
): Promise<GoogleDriveIntegration | null> {
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
    const data = doc.data();
    
    return {
      id: doc.id,
      userId: data.userId,
      email: data.email,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiryDate: data.expiryDate,
      status: data.status || "active",
      lastError: data.lastError || null,
      scopesVersion: data.scopesVersion || 1, // Старые интеграции имеют версию 1
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date()
    } as GoogleDriveIntegration;
  } catch (error) {
    Logger.error("Error finding Google Drive integration", error);
    throw error;
  }
}

export async function createGoogleDriveIntegration(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiryDate: number,
  email?: string,
  scopesVersion?: number
): Promise<GoogleDriveIntegration> {
  try {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }
    
    const now = new Date();
    const data = {
      userId,
      email: email || null,
      accessToken,
      refreshToken,
      expiryDate,
      status: "active" as GoogleDriveIntegrationStatus,
      lastError: null,
      scopesVersion: scopesVersion || 2, // Новая версия по умолчанию
      createdAt: now,
      updatedAt: now
    };

    const docRef = await db.collection(COLLECTION).add(data);
    
    Logger.info("Google Drive integration created", {
      integrationId: docRef.id,
      userId,
      email: email || "not provided"
    });

    return {
      id: docRef.id,
      ...data
    } as GoogleDriveIntegration;
  } catch (error) {
    Logger.error("Error creating Google Drive integration", error);
    throw error;
  }
}

export async function updateGoogleDriveIntegration(
  integrationId: string,
  updates: Partial<{
    accessToken: string;
    refreshToken: string;
    expiryDate: number;
    email: string;
    status: GoogleDriveIntegrationStatus;
    lastError: string | null;
    scopesVersion: number;
  }>
): Promise<void> {
  try {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }
    
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (updates.accessToken !== undefined) {
      updateData.accessToken = updates.accessToken;
    }
    if (updates.refreshToken !== undefined) {
      updateData.refreshToken = updates.refreshToken;
    }
    if (updates.expiryDate !== undefined) {
      updateData.expiryDate = updates.expiryDate;
    }
    if (updates.email !== undefined) {
      updateData.email = updates.email || null;
    }
    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }
    if (updates.lastError !== undefined) {
      updateData.lastError = updates.lastError;
    }
    if (updates.scopesVersion !== undefined) {
      updateData.scopesVersion = updates.scopesVersion;
    }

    await db.collection(COLLECTION).doc(integrationId).update(updateData);

    Logger.info("Google Drive integration updated", {
      integrationId,
      updatedFields: Object.keys(updateData)
    });
  } catch (error) {
    Logger.error("Error updating Google Drive integration", error);
    throw error;
  }
}

export async function deleteGoogleDriveIntegration(integrationId: string): Promise<void> {
  try {
    if (!isFirestoreAvailable() || !db) {
      throw new Error("Firestore is not available");
    }
    
    await db.collection(COLLECTION).doc(integrationId).delete();
    
    Logger.info("Google Drive integration deleted", { integrationId });
  } catch (error) {
    Logger.error("Error deleting Google Drive integration", error);
    throw error;
  }
}

