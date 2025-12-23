import { Router } from "express";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";

const router = Router();

/**
 * Тестовый эндпоинт для проверки подключения к Firestore
 * GET /api/test/firestore
 */
router.get("/firestore", async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const results: any = {
      firestoreAvailable: true,
      projectId: process.env.FIREBASE_PROJECT_ID || "not set",
      tests: {}
    };

    // Тест 1: Попытка прочитать коллекцию users
    try {
      const usersSnapshot = await db.collection("users").limit(5).get();
      results.tests.usersCollection = {
        success: true,
        count: usersSnapshot.docs.length,
        empty: usersSnapshot.empty,
        userIds: usersSnapshot.docs.map(doc => doc.id)
      };
    } catch (error) {
      results.tests.usersCollection = {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Тест 2: Попытка прочитать один документ пользователя (если есть)
    if (results.tests.usersCollection.success && results.tests.usersCollection.count > 0) {
      const firstUserId = results.tests.usersCollection.userIds[0];
      try {
        const userDoc = await db.collection("users").doc(firstUserId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          results.tests.userDocument = {
            success: true,
            userId: firstUserId,
            hasData: !!userData,
            dataKeys: userData ? Object.keys(userData) : []
          };

          // Тест 3: Попытка прочитать каналы этого пользователя
          try {
            const channelsSnapshot = await db
              .collection("users")
              .doc(firstUserId)
              .collection("channels")
              .limit(5)
              .get();
            
            results.tests.userChannels = {
              success: true,
              count: channelsSnapshot.docs.length,
              empty: channelsSnapshot.empty,
              channelIds: channelsSnapshot.docs.map(doc => doc.id)
            };

            // Тест 4: Проверка каналов с autoSendEnabled
            if (channelsSnapshot.docs.length > 0) {
              const channelsWithAutoSend = channelsSnapshot.docs
                .map(doc => {
                  const data = doc.data();
                  return {
                    id: doc.id,
                    name: data.name,
                    autoSendEnabled: data.autoSendEnabled,
                    autoSendEnabledType: typeof data.autoSendEnabled,
                    timezone: data.timezone,
                    schedulesCount: Array.isArray(data.autoSendSchedules) ? data.autoSendSchedules.length : 0
                  };
                })
                .filter(ch => ch.autoSendEnabled === true);

              results.tests.channelsWithAutoSend = {
                success: true,
                count: channelsWithAutoSend.length,
                channels: channelsWithAutoSend
              };
            }
          } catch (error) {
            results.tests.userChannels = {
              success: false,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        } else {
          results.tests.userDocument = {
            success: false,
            error: "Document does not exist"
          };
        }
      } catch (error) {
        results.tests.userDocument = {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    Logger.info("TEST /api/test/firestore: results", results);
    return res.json(results);
  } catch (error) {
    Logger.error("TEST /api/test/firestore: error", error);
    return res.status(500).json({
      error: "Failed to test Firestore",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;


