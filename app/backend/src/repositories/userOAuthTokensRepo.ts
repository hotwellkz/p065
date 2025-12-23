import { db } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";

export interface UserOAuthTokens {
  userId: string;
  googleDriveAccessToken?: string;
  googleDriveRefreshToken?: string;
  googleDriveTokenExpiry?: number;
  updatedAt: Date;
}

/**
 * Сохраняет OAuth токены Google Drive для пользователя
 */
export async function saveUserOAuthTokens(
  userId: string,
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  }
): Promise<void> {
  if (!db) {
    throw new Error("Firestore is not available");
  }

  try {
    const userRef = db.collection("users").doc(userId);
    const tokensData: Partial<UserOAuthTokens> = {
      userId,
      updatedAt: new Date()
    };

    if (tokens.access_token) {
      tokensData.googleDriveAccessToken = tokens.access_token;
    }
    if (tokens.refresh_token) {
      tokensData.googleDriveRefreshToken = tokens.refresh_token;
    }
    if (tokens.expiry_date) {
      tokensData.googleDriveTokenExpiry = tokens.expiry_date;
    }

    await userRef.set(
      {
        ...tokensData,
        updatedAt: new Date()
      },
      { merge: true }
    );

    Logger.info("User OAuth tokens saved", { userId, hasAccessToken: !!tokens.access_token });
  } catch (error) {
    Logger.error("Failed to save user OAuth tokens", error);
    throw error;
  }
}

/**
 * Получает OAuth токены Google Drive для пользователя
 */
export async function getUserOAuthTokens(userId: string): Promise<UserOAuthTokens | null> {
  if (!db) {
    throw new Error("Firestore is not available");
  }

  try {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return null;
    }

    const data = userDoc.data();
    return {
      userId,
      googleDriveAccessToken: data?.googleDriveAccessToken,
      googleDriveRefreshToken: data?.googleDriveRefreshToken,
      googleDriveTokenExpiry: data?.googleDriveTokenExpiry,
      updatedAt: data?.updatedAt?.toDate() || new Date()
    };
  } catch (error) {
    Logger.error("Failed to get user OAuth tokens", error);
    throw error;
  }
}

/**
 * Обновляет access token для пользователя
 */
export async function updateUserAccessToken(
  userId: string,
  accessToken: string,
  expiryDate: number
): Promise<void> {
  if (!db) {
    throw new Error("Firestore is not available");
  }

  try {
    await db.collection("users").doc(userId).set(
      {
        googleDriveAccessToken: accessToken,
        googleDriveTokenExpiry: expiryDate,
        updatedAt: new Date()
      },
      { merge: true }
    );

    Logger.info("User access token updated", { userId });
  } catch (error) {
    Logger.error("Failed to update user access token", error);
    throw error;
  }
}


