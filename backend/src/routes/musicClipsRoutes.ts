/**
 * API routes для Music Clips
 */

import express from "express";
import * as path from "path";
import * as fs from "fs/promises";
import { createReadStream } from "fs";
import { Logger } from "../utils/logger";
import { processMusicClipsChannel } from "../services/musicClipsPipeline";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { getStorageService } from "../services/storageService";
import { getSunoClient } from "../services/sunoClient";
import type { Channel } from "../types/channel";

const router = express.Router();

/**
 * POST /api/music-clips/channels/:channelId/runOnce
 * Запускает пайплайн для одного канала (без расписания)
 */
router.post("/channels/:channelId/runOnce", async (req, res) => {
  const { channelId } = req.params;
  const userId = req.body.userId || req.headers["x-user-id"] as string;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: "User ID is required"
    });
  }

  Logger.info("[MusicClipsAPI] runOnce requested", {
    channelId,
    userId
  });

  try {
    // Проверяем доступность Firestore
    if (!isFirestoreAvailable() || !db) {
      return res.status(500).json({
        success: false,
        error: "Firebase Admin is not configured"
      });
    }

    // Получаем канал
    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId);

    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return res.status(404).json({
        success: false,
        error: "Channel not found"
      });
    }

    const channelData = channelSnap.data();
    const channel: Channel & { ownerId?: string } = {
      id: channelId,
      ownerId: userId,
      ...channelData,
      createdAt: channelData?.createdAt || { seconds: 0, nanoseconds: 0 },
      updatedAt: channelData?.updatedAt || { seconds: 0, nanoseconds: 0 }
    } as Channel & { ownerId?: string };

    // Проверяем тип канала
    const channelType = channel.type || "shorts";
    if (channelType !== "music_clips") {
      return res.status(400).json({
        success: false,
        error: "Channel is not of type music_clips"
      });
    }

    // Проверяем настройки
    if (!channel.musicClipsSettings || !channel.musicClipsSettings.sunoPrompt) {
      return res.status(400).json({
        success: false,
        error: "musicClipsSettings.sunoPrompt is not configured"
      });
    }

    // Проверяем конфигурацию Suno API
    const sunoClient = getSunoClient();
    if (!sunoClient.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: "SUNO_API_KEY_NOT_CONFIGURED",
        message: "Set SUNO_API_KEY in environment"
      });
    }

    // (Опционально) Проверяем кредиты перед запуском
    try {
      const credits = await sunoClient.getCredits();
      if (credits.credits <= 0) {
        Logger.warn("[MusicClipsAPI] No credits available", {
          channelId,
          userId,
          credits: credits.credits
        });
        return res.status(402).json({
          success: false,
          error: "SUNO_NO_CREDITS",
          message: "Недостаточно кредитов Suno для генерации. Пополните баланс.",
          credits: credits.credits
        });
      }
      Logger.info("[MusicClipsAPI] Credits available", {
        channelId,
        credits: credits.credits
      });
    } catch (error: any) {
      Logger.warn("[MusicClipsAPI] Failed to check credits, continuing anyway", {
        channelId,
        userId,
        error: error?.message || String(error)
      });
      // Продолжаем выполнение, если проверка кредитов не удалась
    }

    // Запускаем пайплайн
    const result = await processMusicClipsChannel(channel, userId);

    // Если пайплайн вернул PROCESSING (асинхронный taskId)
    if (result.status === "PROCESSING" && result.taskId) {
      Logger.info("[MusicClipsAPI] Returning PROCESSING status", {
        channelId,
        userId,
        taskId: result.taskId
      });
      return res.status(202).json({
        success: true,
        ok: true,
        status: "PROCESSING",
        taskId: result.taskId,
        message: "Генерация запущена, используйте GET /api/music-clips/tasks/:taskId для проверки статуса"
      });
    }

    // Если пайплайн вернул FAILED
    if (result.status === "FAILED") {
      Logger.error("[MusicClipsAPI] Pipeline failed", {
        channelId,
        userId,
        error: result.error,
        taskId: result.taskId
      });
      return res.status(502).json({
        success: false,
        ok: false,
        status: "FAILED",
        error: result.error || "Pipeline failed",
        taskId: result.taskId,
        message: result.error || "Генерация музыки провалилась"
      });
    }

    // Успешное завершение
    if (result.success) {
      Logger.info("[MusicClipsAPI] Pipeline completed successfully", {
        channelId,
        userId,
        publishedPlatforms: result.publishedPlatforms
      });
      return res.json({
        success: true,
        ok: true,
        status: "DONE",
        trackPath: result.trackPath,
        finalVideoPath: result.finalVideoPath,
        publishedPlatforms: result.publishedPlatforms
      });
    }

    // Неожиданный результат
    Logger.error("[MusicClipsAPI] Unexpected pipeline result", {
      channelId,
      userId,
      result
    });
    return res.status(500).json({
      success: false,
      ok: false,
      error: result.error || "Pipeline failed with unknown error"
    });
  } catch (error: any) {
    const requestId = req.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    Logger.error("[MusicClipsAPI] runOnce error", {
      requestId,
      channelId,
      userId,
      error: error?.message || String(error),
      code: error?.code,
      status: error?.status,
      stack: error?.stack?.substring(0, 500)
    });

    // Специальная обработка для ошибки конфигурации Suno
    if (error?.code === "SUNO_API_KEY_NOT_CONFIGURED" || error?.message?.includes("SUNO_API_KEY")) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: "SUNO_API_KEY_NOT_CONFIGURED",
        message: "Set SUNO_API_KEY in environment",
        requestId
      });
    }

    // Обработка ошибки отсутствия кредитов
    if (error?.code === "SUNO_NO_CREDITS" || error?.message?.includes("credits") || error?.message?.includes("SUNO_NO_CREDITS")) {
      return res.status(402).json({
        success: false,
        ok: false,
        error: "SUNO_NO_CREDITS",
        message: "Недостаточно кредитов Suno для генерации. Пополните баланс.",
        requestId
      });
    }

    // Обработка ошибки отсутствия taskId (неверный формат ответа от Suno)
    if (error?.code === "SUNO_NO_TASK_ID") {
      Logger.error("[MusicClipsAPI] Suno did not return taskId", {
        requestId,
        channelId,
        userId,
        responseData: error?.responseData ? JSON.stringify(error.responseData).substring(0, 4096) : undefined
      });
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_NO_TASK_ID",
        message: "Suno API вернул неожиданный формат ответа (отсутствует taskId). Проверьте логи для деталей.",
        requestId
      });
    }

    // Обработка ошибок Suno API
    if (error?.code === "SUNO_AUTH_ERROR") {
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_AUTH_ERROR",
        message: "Suno auth failed. Проверьте SUNO_API_KEY.",
        requestId
      });
    }

    if (error?.code === "SUNO_RATE_LIMITED") {
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_RATE_LIMITED",
        message: "Suno rate limit exceeded. Попробуйте позже.",
        retryAfterSec: error?.retryAfterSec || 60,
        requestId
      });
    }

    if (error?.code === "SUNO_ENDPOINT_NOT_FOUND") {
      // 404 от Suno - неверный endpoint/baseURL
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_ENDPOINT_NOT_FOUND",
        message: "Неверный endpoint Suno (проверь SUNO_API_BASE_URL и пути)",
        code: error?.code,
        status: error?.status,
        requestId
      });
    }

    if (error?.code === "SUNO_UNAVAILABLE") {
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_UNAVAILABLE",
        message: "Suno is temporarily unavailable. Try later.",
        retryAfterSec: error?.retryAfterSec || 30,
        requestId
      });
    }

    if (error?.code === "SUNO_CLIENT_ERROR") {
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_CLIENT_ERROR",
        message: error?.message || "Suno API client error",
        status: error?.status,
        requestId
      });
    }

    if (error?.code === "SUNO_AUTH_ERROR") {
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_AUTH_ERROR",
        message: "Suno API authentication failed. Check SUNO_API_KEY.",
        status: error?.status,
        requestId
      });
    }

    if (error?.code === "SUNO_UNEXPECTED_RESPONSE") {
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_UNEXPECTED_RESPONSE",
        message: "Suno API вернул неожиданный формат ответа. Проверьте логи для деталей.",
        code: error?.code,
        requestId
      });
    }

    if (error?.code === "SUNO_FAILED") {
      return res.status(502).json({
        success: false,
        ok: false,
        error: "SUNO_FAILED",
        message: "Suno вернул ошибку генерации",
        details: error?.details,
        requestId
      });
    }

    // Для остальных ошибок Suno возвращаем 502 (Bad Gateway), а не 500
    if (error?.code?.startsWith("SUNO_")) {
      return res.status(502).json({
        success: false,
        ok: false,
        error: error?.code || "SUNO_ERROR",
        message: error?.message || "Suno API error",
        status: error?.status,
        requestId
      });
    }

    // Для внутренних ошибок возвращаем 500
    return res.status(500).json({
      success: false,
      ok: false,
      error: error?.message || "Internal server error",
      code: error?.code,
      requestId
    });
  }
});

/**
 * GET /api/music-clips/media/:userFolderKey/:channelFolderKey/:fileName
 * Отдаёт медиа-файлы из music_clips хранилища
 */
router.get("/media/:userFolderKey/:channelFolderKey/:fileName", async (req, res) => {
  const { userFolderKey, channelFolderKey, fileName } = req.params;

  try {
    // Проверка безопасности
    if (!userFolderKey || !channelFolderKey || !fileName) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    if (userFolderKey.includes("..") || channelFolderKey.includes("..") || fileName.includes("..") ||
        userFolderKey.includes("/") || channelFolderKey.includes("/") || fileName.includes("/")) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const storage = getStorageService();
    const musicClipsRoot = storage.getMusicClipsRoot();

    // Пробуем найти файл в разных местах
    const finalPath = path.join(musicClipsRoot, "users", userFolderKey, "channels", channelFolderKey, "inbox", "final", fileName);
    const uploadedPath = path.join(musicClipsRoot, "users", userFolderKey, "channels", channelFolderKey, "uploaded", fileName);
    const trackPath = path.join(musicClipsRoot, "users", userFolderKey, "channels", channelFolderKey, "inbox", "track", fileName);

    let filePath: string | null = null;
    let fileExists = false;

    for (const testPath of [finalPath, uploadedPath, trackPath]) {
      try {
        await fs.access(testPath);
        const stats = await fs.stat(testPath);
        if (stats.isFile()) {
          filePath = testPath;
          fileExists = true;
          break;
        }
      } catch {
        // Продолжаем поиск
      }
    }

    if (!fileExists || !filePath) {
      return res.status(404).json({ error: "File not found" });
    }

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return res.status(404).json({ error: "Not a file" });
    }

    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".mp3": "audio/mpeg",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      ".webm": "video/webm",
      ".m4v": "video/x-m4v"
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    // Обработка Range-запросов
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const fileStream = createReadStream(filePath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stats.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": contentType,
      });

      fileStream.pipe(res);
    } else {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stats.size);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");

      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
    }
  } catch (error: any) {
    Logger.error("[MusicClipsAPI] Error serving media file", {
      userFolderKey,
      channelFolderKey,
      fileName,
      error: error?.message || String(error)
    });
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: error?.message || "Unknown error"
      });
    }
  }
});

/**
 * GET /api/music-clips/tasks/:taskId
 * Проверка статуса задачи Suno
 */
router.get("/tasks/:taskId", async (req, res) => {
  const { taskId } = req.params;
  const userId = req.headers["x-user-id"] as string;
  const requestId = req.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!userId) {
    return res.status(401).json({
      success: false,
      ok: false,
      error: "User ID is required",
      requestId
    });
  }

  Logger.info("[MusicClipsAPI] getTaskStatus requested", {
    requestId,
    taskId,
    userId
  });

  try {
    const { getSunoClient } = await import("../services/sunoClient");
    const sunoClient = getSunoClient();

    if (!sunoClient.isConfigured()) {
      return res.status(503).json({
        success: false,
        ok: false,
        error: "SUNO_API_KEY_NOT_CONFIGURED",
        message: "Set SUNO_API_KEY in environment",
        requestId
      });
    }

    const recordInfo = await sunoClient.getRecordInfo(taskId);

    if (recordInfo.status === "SUCCESS" && recordInfo.audioUrl) {
      Logger.info("[MusicClipsAPI] Task completed successfully", {
        requestId,
        taskId,
        userId,
        audioUrl: recordInfo.audioUrl.substring(0, 100) + "..."
      });
      return res.json({
        success: true,
        ok: true,
        status: "DONE",
        taskId,
        audioUrl: recordInfo.audioUrl,
        title: recordInfo.title,
        duration: recordInfo.duration,
        metadata: recordInfo.metadata,
        requestId
      });
    }

    if (recordInfo.status === "FAILED") {
      Logger.error("[MusicClipsAPI] Task failed", {
        requestId,
        taskId,
        userId,
        errorMessage: recordInfo.errorMessage
      });
      return res.json({
        success: false,
        ok: false,
        status: "FAILED",
        taskId,
        error: "SUNO_FAILED",
        message: "Suno вернул ошибку генерации",
        errorMessage: recordInfo.errorMessage,
        requestId
      });
    }

    // PENDING или GENERATING
    Logger.debug("[MusicClipsAPI] Task still processing", {
      requestId,
      taskId,
      userId,
      status: recordInfo.status
    });
    return res.json({
      success: true,
      ok: true,
      status: "PROCESSING",
      taskId,
      message: "Генерация ещё выполняется",
      requestId
    });
  } catch (error: any) {
    Logger.error("[MusicClipsAPI] getTaskStatus error", {
      requestId,
      taskId,
      userId,
      error: error?.message || String(error),
      code: error?.code,
      stack: error?.stack?.substring(0, 500)
    });

    if (error?.code === "SUNO_TASK_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        ok: false,
        error: "TASK_NOT_FOUND",
        message: `Task ${taskId} not found`,
        requestId
      });
    }

    // Для других ошибок Suno возвращаем 502, но с ok: false в теле
    return res.status(502).json({
      success: false,
      ok: false,
      error: error?.code || "SUNO_ERROR",
      message: error?.message || "Failed to get task status",
      requestId
    });
  }
});

/**
 * GET /api/music-clips/diagnostics/suno
 * Диагностический endpoint для проверки доступности Suno API
 */
router.get("/diagnostics/suno", async (req, res) => {
  try {
    const sunoClient = getSunoClient();
    const pingResult = await sunoClient.ping();

    const statusCode = pingResult.ok ? 200 : 503;
    return res.status(statusCode).json({
      ok: pingResult.ok,
      suno: {
        configured: sunoClient.isConfigured(),
        available: pingResult.ok,
        latency: pingResult.latency,
        error: pingResult.error,
        status: pingResult.status
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    Logger.error("[MusicClipsAPI] Diagnostics error", {
      error: error?.message || String(error)
    });

    return res.status(503).json({
      ok: false,
      error: error?.message || "Diagnostics failed",
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/music-clips/health
 * Health check endpoint для проверки конфигурации Music Clips
 */
router.get("/health", async (req, res) => {
  try {
    const sunoClient = getSunoClient();
    const isSunoConfigured = sunoClient.isConfigured();
    const storage = getStorageService();
    const musicClipsRoot = storage.getMusicClipsRoot();

    const health = {
      ok: isSunoConfigured,
      suno: {
        configured: isSunoConfigured,
        reason: isSunoConfigured ? null : "SUNO_API_KEY is not set in environment"
      },
      storage: {
        root: musicClipsRoot,
        available: true
      },
      timestamp: new Date().toISOString()
    };

    const statusCode = isSunoConfigured ? 200 : 503;
    return res.status(statusCode).json(health);
  } catch (error: any) {
    Logger.error("[MusicClipsAPI] Health check error", {
      error: error?.message || String(error)
    });

    return res.status(503).json({
      ok: false,
      error: error?.message || "Health check failed",
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

