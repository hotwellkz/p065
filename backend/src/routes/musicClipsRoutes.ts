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

    // Запускаем пайплайн
    const result = await processMusicClipsChannel(channel, userId);

    if (result.success) {
      return res.json({
        success: true,
        trackPath: result.trackPath,
        finalVideoPath: result.finalVideoPath,
        publishedPlatforms: result.publishedPlatforms
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || "Pipeline failed"
      });
    }
  } catch (error: any) {
    Logger.error("[MusicClipsAPI] runOnce error", {
      channelId,
      userId,
      error: error?.message || String(error)
    });

    return res.status(500).json({
      success: false,
      error: error?.message || "Internal server error"
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

export default router;

