import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { encrypt, decrypt } from "../crypto/aes";

const router = Router();

/**
 * GET /api/user-settings
 * Получает настройки пользователя
 */
router.get("/", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      success: false,
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const settingsRef = db.collection("users").doc(userId).collection("settings").doc("account");
    const settingsDoc = await settingsRef.get();

    if (!settingsDoc.exists) {
      return res.json({
        success: true,
        settings: {
          defaultBlottataApiKey: null,
          hasDefaultBlottataApiKey: false,
          hasSeenChannelWizard: false
        }
      });
    }

    const data = settingsDoc.data();
    let defaultBlottataApiKey: string | null = null;

    // Расшифровываем API ключ, если он есть
    if (data?.defaultBlottataApiKeyEncrypted) {
      try {
        defaultBlottataApiKey = decrypt(data.defaultBlottataApiKeyEncrypted);
      } catch (decryptError: any) {
        Logger.error("Failed to decrypt defaultBlottataApiKey", {
          userId,
          error: decryptError?.message || String(decryptError)
        });
        // Если не удалось расшифровать, возвращаем null
        defaultBlottataApiKey = null;
      }
    }

    return res.json({
      success: true,
      settings: {
        defaultBlottataApiKey: defaultBlottataApiKey ? "****" : null, // Возвращаем маскированное значение
        hasDefaultBlottataApiKey: !!defaultBlottataApiKey,
        hasSeenChannelWizard: data?.hasSeenChannelWizard ?? false
      }
    });
  } catch (error: any) {
    Logger.error("Error in GET /api/user-settings", {
      error: error?.message || String(error),
      userId: req.user?.uid,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Ошибка при получении настроек"
    });
  }
});

/**
 * PUT /api/user-settings
 * Обновляет настройки пользователя
 */
router.put("/", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      success: false,
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { defaultBlottataApiKey, hasSeenChannelWizard } = req.body;

    Logger.info("PUT /api/user-settings: updating settings", {
      userId,
      hasDefaultBlottataApiKey: !!defaultBlottataApiKey,
      hasSeenChannelWizard
    });

    const settingsRef = db.collection("users").doc(userId).collection("settings").doc("account");
    
    const updateData: any = {
      updatedAt: new Date()
    };

    // Если передан ключ, шифруем и сохраняем
    if (defaultBlottataApiKey !== undefined) {
      if (defaultBlottataApiKey === null || defaultBlottataApiKey === "") {
        // Удаляем ключ
        updateData.defaultBlottataApiKeyEncrypted = null;
      } else {
        // Шифруем и сохраняем
        try {
          const encrypted = encrypt(defaultBlottataApiKey.trim());
          updateData.defaultBlottataApiKeyEncrypted = encrypted;
        } catch (encryptError: any) {
          Logger.error("Failed to encrypt defaultBlottataApiKey", {
            userId,
            error: encryptError?.message || String(encryptError)
          });
          return res.status(500).json({
            success: false,
            error: "ENCRYPTION_FAILED",
            message: "Не удалось зашифровать API ключ"
          });
        }
      }
    }

    // Если передан флаг hasSeenChannelWizard, сохраняем его
    if (hasSeenChannelWizard !== undefined) {
      updateData.hasSeenChannelWizard = Boolean(hasSeenChannelWizard);
    }

    await settingsRef.set(updateData, { merge: true });

    Logger.info("User settings updated successfully", {
      userId,
      hasDefaultBlottataApiKey: defaultBlottataApiKey !== null && defaultBlottataApiKey !== ""
    });

    return res.json({
      success: true,
      message: "Настройки сохранены"
    });
  } catch (error: any) {
    Logger.error("Error in PUT /api/user-settings", {
      error: error?.message || String(error),
      userId: req.user?.uid,
      stack: error?.stack
    });

    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Ошибка при сохранении настроек"
    });
  }
});

/**
 * GET /api/user-settings/default-blottata-api-key
 * Получает расшифрованный API ключ для использования при создании канала
 * (используется только на backend, не экспортируется в frontend)
 */
export async function getDefaultBlottataApiKey(userId: string): Promise<string | null> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("Firestore is not available, cannot get default Blottata API key", { userId });
    return null;
  }

  try {
    const settingsRef = db.collection("users").doc(userId).collection("settings").doc("account");
    const settingsDoc = await settingsRef.get();

    if (!settingsDoc.exists) {
      return null;
    }

    const data = settingsDoc.data();
    if (!data?.defaultBlottataApiKeyEncrypted) {
      return null;
    }

    try {
      return decrypt(data.defaultBlottataApiKeyEncrypted);
    } catch (decryptError: any) {
      Logger.error("Failed to decrypt defaultBlottataApiKey", {
        userId,
        error: decryptError?.message || String(decryptError)
      });
      return null;
    }
  } catch (error: any) {
    Logger.error("Error getting default Blottata API key", {
      userId,
      error: error?.message || String(error)
    });
    return null;
  }
}

export default router;

