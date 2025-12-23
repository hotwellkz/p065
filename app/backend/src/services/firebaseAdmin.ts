import * as admin from "firebase-admin";
import { Logger } from "../utils/logger";

let firebaseInitialized = false;
let firebaseError: Error | null = null;

// Инициализация Firebase Admin SDK
// Поддерживает два способа: через service account JSON или через переменные окружения
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson) {
      // Если есть JSON в переменной окружения (для Cloud Run / серверов)
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        Logger.info("Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT env variable");
      } catch (parseError) {
        firebaseError = parseError as Error;
        Logger.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON", parseError);
      }
    } else {
      // Попытка инициализации через Application Default Credentials (для локальной разработки)
      // или через переменные окружения по отдельности
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
      
      if (projectId && clientEmail && privateKey) {
        try {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey
            })
          });
          firebaseInitialized = true;
          Logger.info("Firebase Admin initialized from individual env variables");
        } catch (initError) {
          firebaseError = initError as Error;
          Logger.error("Failed to initialize Firebase Admin from env variables", initError);
        }
        } else {
          // Не пытаемся использовать Application Default Credentials без явной настройки
          // Это может привести к ошибкам при использовании Firestore
          Logger.warn(
            "Firebase Admin not initialized: no credentials provided. " +
            "Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY. " +
            "Endpoints requiring Firestore will return 503."
          );
          Logger.warn("Firebase Admin: missing env variables", {
            hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
            hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
            hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
            hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY
          });
          firebaseInitialized = false;
        }
    }
  } catch (error) {
    firebaseError = error as Error;
    Logger.error("Failed to initialize Firebase Admin", error);
  }
} else {
  firebaseInitialized = true;
}

// Экспортируем db с проверкой инициализации
export const db = firebaseInitialized ? admin.firestore() : null;

// Функция для проверки доступности Firestore
export function isFirestoreAvailable(): boolean {
  return firebaseInitialized && db !== null;
}

// Функция для получения информации о подключении
export function getFirestoreInfo(): {
  initialized: boolean;
  projectId?: string;
  error?: string;
} {
  if (!firebaseInitialized) {
    return {
      initialized: false,
      error: firebaseError?.message || "Firebase Admin not initialized"
    };
  }
  
  const projectId = process.env.FIREBASE_PROJECT_ID || 
    (admin.apps[0]?.options?.projectId as string | undefined);
  
  return {
    initialized: true,
    projectId: projectId || "unknown"
  };
}

// Функция для получения ошибки инициализации
export function getFirebaseError(): Error | null {
  return firebaseError;
}

// Функция для получения admin экземпляра (для использования в auth())
export function getAdmin(): typeof admin | null {
  return firebaseInitialized ? admin : null;
}

