/**
 * Утилиты для работы с email пользователя и registrationEmail
 */

import * as admin from "firebase-admin";
import { Logger } from "./logger";
import { getAdmin } from "../services/firebaseAdmin";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { emailToSlug } from "./fileUtils";

/**
 * Получает registrationEmail пользователя из Firestore
 * Если registrationEmail нет, создаёт его из текущего email
 * 
 * @param userId - ID пользователя
 * @param userEmail - Email пользователя (опционально, для оптимизации - избегает запрос к Firebase Auth)
 * @returns registrationEmail (первичный email при регистрации)
 */
export async function getOrCreateRegistrationEmail(userId: string, userEmail?: string): Promise<string> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("getOrCreateRegistrationEmail: Firestore not available, trying Firebase Auth", { userId });
    // Fallback: используем переданный userEmail или получаем из Firebase Auth
    if (userEmail) {
      Logger.info("getOrCreateRegistrationEmail: using provided userEmail", { userId, userEmail });
      return userEmail;
    }
    try {
      const adminInstance = getAdmin();
      if (adminInstance) {
        const userRecord = await adminInstance.auth().getUser(userId);
        const email = userRecord.email;
        if (email) {
          Logger.info("getOrCreateRegistrationEmail: using email from Firebase Auth", { userId, email });
          return email;
        }
      }
    } catch (error) {
      Logger.warn("getOrCreateRegistrationEmail: failed to get email from Firebase Auth", {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    return `${userId}@unknown.local`;
  }

  try {
    // Проверяем, есть ли registrationEmail в Firestore
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const userData = userSnap.data();
      if (userData?.registrationEmail && typeof userData.registrationEmail === "string") {
        Logger.info("getOrCreateRegistrationEmail: found registrationEmail in Firestore", {
          userId,
          registrationEmail: userData.registrationEmail
        });
        return userData.registrationEmail;
      }
    }

    // registrationEmail нет - используем переданный userEmail или получаем из Firebase Auth
    let currentEmail: string | null = userEmail || null;
    if (!currentEmail) {
      try {
        const adminInstance = getAdmin();
        if (adminInstance) {
          const userRecord = await adminInstance.auth().getUser(userId);
          currentEmail = userRecord.email || null;
        }
      } catch (authError) {
        Logger.warn("getOrCreateRegistrationEmail: failed to get email from Firebase Auth", {
          userId,
          error: authError instanceof Error ? authError.message : String(authError)
        });
      }
    }

    // Если email не найден, используем fallback
    const registrationEmail = currentEmail || `${userId}@unknown.local`;

    // Сохраняем registrationEmail в Firestore
    await userRef.set(
      {
        registrationEmail,
        registrationEmailSetAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    Logger.info("getOrCreateRegistrationEmail: created registrationEmail in Firestore", {
      userId,
      registrationEmail
    });

    return registrationEmail;
  } catch (error) {
    Logger.error("getOrCreateRegistrationEmail: error", {
      userId,
      error: error instanceof Error ? error.message : String(error)
    });

    // Fallback: пытаемся получить email из Firebase Auth
    try {
      const adminInstance = getAdmin();
      if (adminInstance) {
        const userRecord = await adminInstance.auth().getUser(userId);
        const email = userRecord.email;
        if (email) {
          return email;
        }
      }
    } catch (authError) {
      // Игнорируем ошибку
    }

    return `${userId}@unknown.local`;
  }
}

/**
 * Формирует userFolderKey из email и userId
 * Формат: {emailSlug}__{userId}
 * 
 * @param email - Email пользователя (registrationEmail)
 * @param userId - ID пользователя
 * @returns userFolderKey для использования в путях
 * 
 * @example
 * buildUserFolderKey('HotWell.kz@gmail.com', 'abc123') -> 'hotwell-kz-at-gmail-com__abc123'
 */
export function buildUserFolderKey(email: string, userId: string): string {
  const emailSlug = emailToSlug(email);
  return `${emailSlug}__${userId}`;
}

/**
 * Получает userFolderKey для пользователя
 * Автоматически получает registrationEmail и формирует ключ
 * 
 * @param userId - ID пользователя
 * @param userEmail - Email пользователя (опционально, для оптимизации - избегает запрос к Firebase Auth)
 * @returns userFolderKey
 */
export async function getUserFolderKey(userId: string, userEmail?: string): Promise<string> {
  const registrationEmail = await getOrCreateRegistrationEmail(userId, userEmail);
  const folderKey = buildUserFolderKey(registrationEmail, userId);

  Logger.info("getUserFolderKey: computed", {
    userId,
    registrationEmail,
    folderKey
  });

  return folderKey;
}

