/**
 * Webhooks routes для внешних сервисов
 */

import express from "express";
import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";

const router = express.Router();

/**
 * POST /api/webhooks/suno/music
 * Callback endpoint для получения результатов генерации от Suno
 */
router.post("/suno/music", async (req, res) => {
  const requestId = req.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Безопасное логирование body (без секретов, до 8KB)
  const bodyStr = typeof req.body === "object" 
    ? JSON.stringify(req.body, null, 2).substring(0, 8192)
    : String(req.body).substring(0, 8192);

  Logger.info("[Webhooks][Suno] Callback received", {
    requestId,
    method: req.method,
    path: req.path,
    headers: {
      "content-type": req.headers["content-type"],
      "user-agent": req.headers["user-agent"],
      "x-forwarded-for": req.headers["x-forwarded-for"]
    },
    bodyKeys: typeof req.body === "object" && req.body !== null ? Object.keys(req.body) : [],
    bodyPreview: bodyStr
  });

  try {
    // Извлекаем taskId из body
    // Формат может быть разным, проверяем несколько вариантов
    const taskId = req.body?.taskId || 
                   req.body?.data?.taskId || 
                   req.body?.task_id || 
                   req.body?.data?.task_id ||
                   null;

    if (!taskId) {
      Logger.warn("[Webhooks][Suno] No taskId in body", {
        requestId,
        bodyKeys: typeof req.body === "object" && req.body !== null ? Object.keys(req.body) : []
      });
      // Все равно возвращаем 200, чтобы Suno не повторял запрос
      return res.status(200).json({
        status: "received",
        message: "Callback received but taskId not found",
        requestId
      });
    }

    // Извлекаем статус и данные
    const status = req.body?.status || 
                   req.body?.data?.status || 
                   "UNKNOWN";
    
    const audioUrl = req.body?.audio_url || 
                     req.body?.data?.audio_url ||
                     req.body?.data?.response?.data?.[0]?.audio_url ||
                     null;

    const title = req.body?.title || 
                  req.body?.data?.title ||
                  req.body?.data?.response?.data?.[0]?.title ||
                  null;

    const duration = req.body?.duration || 
                     req.body?.data?.duration ||
                     req.body?.data?.response?.data?.[0]?.duration ||
                     null;

    Logger.info("[Webhooks][Suno] Processing callback", {
      requestId,
      taskId,
      status,
      hasAudioUrl: !!audioUrl,
      title,
      duration
    });

    // Обновляем job через jobService
    try {
      const { findJobBySunoTaskId, updateMusicClipsJob, logStageTransition } = await import("../services/musicClipsJobService");
      const job = await findJobBySunoTaskId(taskId);

      if (job) {
        if (status === "SUCCESS" && audioUrl) {
          await updateMusicClipsJob(job.jobId, {
            stage: "STAGE_50_SUNO_SUCCESS",
            audioUrl: audioUrl
          });
          logStageTransition(job.jobId, job.stage, "STAGE_50_SUNO_SUCCESS", { source: "callback", audioUrl: audioUrl.substring(0, 100) });

          Logger.info("[Webhooks][Suno] Job updated: SUCCESS", {
            requestId,
            jobId: job.jobId,
            taskId,
            audioUrl: audioUrl.substring(0, 100) + "..."
          });
        } else if (status === "FAILED") {
          await updateMusicClipsJob(job.jobId, {
            stage: "STAGE_90_FAILED",
            errorMessage: `Suno generation failed: ${title || "Unknown error"}`
          });
          logStageTransition(job.jobId, job.stage, "STAGE_90_FAILED", { source: "callback" });

          Logger.info("[Webhooks][Suno] Job updated: FAILED", {
            requestId,
            jobId: job.jobId,
            taskId
          });
        } else {
          // PENDING/GENERATING - обновляем только стадию
          await updateMusicClipsJob(job.jobId, {
            stage: "STAGE_40_SUNO_PENDING"
          });
        }
      } else {
        Logger.warn("[Webhooks][Suno] Job not found for taskId", {
          requestId,
          taskId
        });

        // Fallback: обновляем канал (legacy)
        if (isFirestoreAvailable() && db) {
          const usersRef = db.collection("users");
          const usersSnapshot = await usersRef.get();
          
          for (const userDoc of usersSnapshot.docs) {
            const channelsRef = userDoc.ref.collection("channels");
            const channelsSnapshot = await channelsRef.get();
            
            for (const channelDoc of channelsSnapshot.docs) {
              const channelData = channelDoc.data();
              const lastJobId = channelData?.musicClipsSettings?.lastJobId;
              
              if (lastJobId === taskId) {
                const currentSettings = channelData.musicClipsSettings || {};
                await channelDoc.ref.update({
                  musicClipsSettings: {
                    ...currentSettings,
                    lastJobId: taskId,
                    lastJobStatus: status === "SUCCESS" ? "completed" : status === "FAILED" ? "failed" : "processing",
                    lastJobAudioUrl: audioUrl || null,
                    lastJobTitle: title || null,
                    lastJobDuration: duration || null,
                    lastJobUpdatedAt: require("firebase-admin").firestore.FieldValue.serverTimestamp()
                  },
                  updatedAt: require("firebase-admin").firestore.FieldValue.serverTimestamp()
                });
                break;
              }
            }
          }
        }
      }
    } catch (error: any) {
      Logger.error("[Webhooks][Suno] Failed to update job", {
        requestId,
        taskId,
        error: error?.message || String(error)
      });
      // Не прерываем выполнение
    }

    // Возвращаем успешный ответ
    return res.status(200).json({
      status: "received",
      taskId,
      message: "Callback processed successfully",
      requestId
    });

  } catch (error: any) {
    Logger.error("[Webhooks][Suno] Error processing callback", {
      requestId,
      error: error?.message || String(error),
      stack: error?.stack?.substring(0, 500)
    });

    // Все равно возвращаем 200, чтобы Suno не повторял запрос
    // Но логируем ошибку для отладки
    return res.status(200).json({
      status: "received",
      message: "Callback received but processing failed",
      error: error?.message || "Unknown error",
      requestId
    });
  }
});

export default router;

