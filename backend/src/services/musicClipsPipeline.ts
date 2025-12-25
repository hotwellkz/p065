/**
 * Пайплайн для генерации Music Clips
 * 
 * Процесс:
 * 1. Генерация музыки через Suno API
 * 2. Генерация видео-сегментов (по 10 сек)
 * 3. Склейка сегментов
 * 4. Наложение музыки
 * 5. Публикация через BlotatoPublisherService
 * 6. Перенос в uploaded после успеха
 */

import * as fs from "fs/promises";
import * as path from "path";
import { Logger } from "../utils/logger";
import { Channel, MusicClipsSettings } from "../types/channel";
import { getStorageService } from "./storageService";
import { getSunoClient } from "./sunoClient";
import {
  getAudioInfo,
  getVideoInfo,
  trimAudio,
  loopAndTrimAudio,
  concatSegments,
  overlayAudio
} from "../utils/ffmpegUtils";
import { blottataPublisherService } from "./blottataPublisherService";
import { runVideoGenerationForChannel } from "./videoGenerationService";
import { db, isFirestoreAvailable } from "./firebaseAdmin";

export interface MusicClipsPipelineResult {
  success: boolean;
  error?: string;
  trackPath?: string;
  finalVideoPath?: string;
  publishedPlatforms?: string[];
}

/**
 * Получить настройки music_clips для канала с дефолтами
 */
function getMusicClipsSettings(channel: Channel): MusicClipsSettings {
  const defaults: MusicClipsSettings = {
    targetDurationSec: 60,
    clipSec: 10,
    segmentDelayMs: 30000,
    maxParallelSegments: 1,
    maxRetries: 3,
    retryDelayMs: 60000,
    sunoPrompt: "",
    styleTags: [],
    platforms: {
      youtube: true,
      tiktok: false,
      instagram: false
    },
    language: channel.language || "ru"
  };

  if (!channel.musicClipsSettings) {
    return defaults;
  }

  return {
    ...defaults,
    ...channel.musicClipsSettings,
    platforms: {
      ...defaults.platforms,
      ...channel.musicClipsSettings.platforms
    }
  };
}

/**
 * Генерация видео-сегмента через существующий генератор
 * Для music_clips используем упрощенный промпт на основе настроек канала
 * 
 * ПРИМЕЧАНИЕ: Текущая реализация требует доработки:
 * 1. Интеграция с системой генерации видео (Telegram/Syntx)
 * 2. Ожидание завершения генерации
 * 3. Скачивание готового файла в outputPath
 * 
 * Для MVP можно использовать заглушку или упрощенную генерацию
 */
async function generateVideoSegment(
  channel: Channel,
  userId: string,
  segmentIndex: number,
  totalSegments: number,
  settings: MusicClipsSettings,
  outputPath: string
): Promise<void> {
  Logger.info("[MusicClips] Generating video segment", {
    channelId: channel.id,
    segmentIndex,
    totalSegments,
    outputPath
  });

  // Генерируем промпт для сегмента на основе настроек канала
  const segmentPrompt = `Create a ${settings.clipSec}-second vertical video segment ${segmentIndex + 1} of ${totalSegments} for music clip. Style: ${channel.tone || "dynamic"}. Niche: ${channel.niche || "general"}.`;

  try {
    // Используем существующий генератор видео
    // ВАЖНО: Для полноценной работы нужно:
    // 1. Дождаться завершения генерации (polling или webhook)
    // 2. Скачать готовый файл из Telegram/Syntx
    // 3. Сохранить в outputPath
    const result = await runVideoGenerationForChannel({
      channelId: channel.id,
      userId,
      prompt: segmentPrompt,
      source: "music_clips_pipeline",
      title: `Music Clip Segment ${segmentIndex + 1}`
    });

    if (!result.success) {
      throw new Error(result.error || "Video generation failed");
    }

    Logger.info("[MusicClips] Video segment generation initiated", {
      channelId: channel.id,
      segmentIndex,
      messageId: result.messageId
    });

    // TODO: Реализовать ожидание и скачивание
    // Временная заглушка - в продакшене нужно интегрировать с системой генерации
    // Для тестирования можно создать простой сегмент через ffmpeg или использовать существующие видео
    throw new Error("Video segment generation requires integration with video generation service. See TODO in generateVideoSegment function.");
  } catch (error: any) {
    Logger.error("[MusicClips] Failed to generate video segment", {
      channelId: channel.id,
      segmentIndex,
      error: error?.message || String(error)
    });
    throw error;
  }
}

/**
 * Основной пайплайн обработки music_clips канала
 */
export async function processMusicClipsChannel(
  channel: Channel & { ownerId?: string },
  userId: string
): Promise<MusicClipsPipelineResult> {
  const startTime = Date.now();
  Logger.info("[MusicClips] Starting pipeline", {
    channelId: channel.id,
    channelName: channel.name,
    userId
  });

  if (!channel.ownerId) {
    return {
      success: false,
      error: "Channel ownerId is missing"
    };
  }

  try {
    // Получаем настройки
    const settings = getMusicClipsSettings(channel);

    if (!settings.sunoPrompt) {
      return {
        success: false,
        error: "sunoPrompt is not configured in musicClipsSettings"
      };
    }

    // Получаем пути к хранилищу
    const storage = getStorageService();
    const userEmail = `${channel.ownerId}@unknown.local`; // Fallback, лучше получить из Firebase Auth
    const userFolderKey = await storage.resolveUserFolderKey(channel.ownerId, userEmail);
    const channelFolderKey = await storage.resolveChannelFolderKey(channel.ownerId, channel.id);

    // Создаём директории
    await storage.ensureMusicClipsDirs(userFolderKey, channelFolderKey);

    const trackDir = storage.resolveMusicClipsTrackDir(userFolderKey, channelFolderKey);
    const segmentsDir = storage.resolveMusicClipsSegmentsDir(userFolderKey, channelFolderKey);
    const renderDir = storage.resolveMusicClipsRenderDir(userFolderKey, channelFolderKey);
    const finalDir = storage.resolveMusicClipsFinalDir(userFolderKey, channelFolderKey);

    Logger.info("[MusicClips] Directories ensured", {
      trackDir,
      segmentsDir,
      renderDir,
      finalDir
    });

    // ========== ШАГ A: Генерация музыки ==========
    Logger.info("[MusicClips] Step A: Generating music", {
      sunoPrompt: settings.sunoPrompt.substring(0, 100) + "...",
      styleTags: settings.styleTags
    });

    const sunoClient = getSunoClient();
    const trackResult = await sunoClient.createTrack(settings.sunoPrompt, settings.styleTags);

    // Скачиваем трек
    const trackRawPath = path.join(trackDir, "track_raw.mp3");
    await sunoClient.downloadAudio(trackResult.audioUrl, trackRawPath);

    // Получаем длительность трека
    const audioInfo = await getAudioInfo(trackRawPath);
    Logger.info("[MusicClips] Track downloaded", {
      trackRawPath,
      duration: audioInfo.duration
    });

    // Приводим аудио к targetDurationSec
    const trackTargetPath = path.join(trackDir, "track_target.mp3");
    if (audioInfo.duration > settings.targetDurationSec) {
      // Обрезаем
      await trimAudio(trackRawPath, trackTargetPath, settings.targetDurationSec);
    } else if (audioInfo.duration < settings.targetDurationSec) {
      // Зацикливаем и обрезаем
      await loopAndTrimAudio(trackRawPath, trackTargetPath, settings.targetDurationSec);
    } else {
      // Копируем как есть
      await fs.copyFile(trackRawPath, trackTargetPath);
    }

    Logger.info("[MusicClips] Track prepared", {
      trackTargetPath,
      targetDuration: settings.targetDurationSec
    });

    // ========== ШАГ B: Генерация видео-сегментов ==========
    const segmentsCount = Math.ceil(settings.targetDurationSec / settings.clipSec);
    Logger.info("[MusicClips] Step B: Generating video segments", {
      segmentsCount,
      clipSec: settings.clipSec,
      targetDurationSec: settings.targetDurationSec
    });

    const segmentPaths: string[] = [];
    const activeGenerations: Promise<void>[] = [];
    let currentParallel = 0;

    for (let i = 0; i < segmentsCount; i++) {
      const segmentPath = path.join(segmentsDir, `seg_${String(i).padStart(3, "0")}.mp4`);

      // Проверяем, существует ли сегмент и валиден ли он
      try {
        const exists = await fs.access(segmentPath).then(() => true).catch(() => false);
        if (exists) {
          const videoInfo = await getVideoInfo(segmentPath);
          if (videoInfo.duration > 0) {
            Logger.info("[MusicClips] Segment already exists, skipping", {
              segmentIndex: i,
              segmentPath,
              duration: videoInfo.duration
            });
            segmentPaths.push(segmentPath);
            continue;
          }
        }
      } catch (error) {
        // Сегмент не существует или невалиден, генерируем
      }

      // Ожидаем, если достигнут лимит параллельных
      while (currentParallel >= settings.maxParallelSegments) {
        await Promise.race(activeGenerations);
        activeGenerations.splice(0, 1);
        currentParallel--;
      }

      // Генерируем сегмент с ретраями
      const generateSegment = async (): Promise<void> => {
        let lastError: Error | null = null;
        for (let retry = 0; retry < settings.maxRetries; retry++) {
          try {
            if (retry > 0) {
              Logger.info("[MusicClips] Retrying segment generation", {
                segmentIndex: i,
                retry,
                maxRetries: settings.maxRetries
              });
              await new Promise(resolve => setTimeout(resolve, settings.retryDelayMs));
            }

            await generateVideoSegment(channel, userId, i, segmentsCount, settings, segmentPath);
            segmentPaths.push(segmentPath);
            return;
          } catch (error: any) {
            lastError = error;
            Logger.warn("[MusicClips] Segment generation failed, will retry", {
              segmentIndex: i,
              retry,
              error: error?.message || String(error)
            });
          }
        }
        throw lastError || new Error("Segment generation failed after retries");
      };

      activeGenerations.push(generateSegment());
      currentParallel++;

      // Задержка между запусками
      if (i < segmentsCount - 1) {
        await new Promise(resolve => setTimeout(resolve, settings.segmentDelayMs));
      }
    }

    // Ждём завершения всех генераций
    await Promise.all(activeGenerations);

    if (segmentPaths.length !== segmentsCount) {
      throw new Error(`Failed to generate all segments: ${segmentPaths.length}/${segmentsCount}`);
    }

    Logger.info("[MusicClips] All segments generated", {
      segmentsCount: segmentPaths.length
    });

    // ========== ШАГ C: Склейка сегментов ==========
    Logger.info("[MusicClips] Step C: Concatenating segments");

    // Создаём список для concat
    const segmentsListPath = path.join(renderDir, "segments.txt");
    const segmentsListContent = segmentPaths
      .map(segPath => `file '${segPath.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(segmentsListPath, segmentsListContent, "utf-8");

    const stitchedPath = path.join(renderDir, "stitched.mp4");
    await concatSegments(segmentsListPath, stitchedPath);

    Logger.info("[MusicClips] Segments concatenated", {
      stitchedPath
    });

    // ========== ШАГ D: Наложение аудио ==========
    Logger.info("[MusicClips] Step D: Overlaying audio");

    const finalPath = path.join(finalDir, "final.mp4");
    await overlayAudio(stitchedPath, trackTargetPath, finalPath, settings.targetDurationSec);

    Logger.info("[MusicClips] Audio overlayed", {
      finalPath
    });

    // ========== ШАГ E: Публикация ==========
    Logger.info("[MusicClips] Step E: Publishing");

    // Формируем mediaUrl (нужен публичный URL)
    let publicBaseUrl = process.env.PUBLIC_BASE_URL ||
      process.env.BACKEND_URL ||
      process.env.FRONTEND_ORIGIN?.replace(":5173", `:${process.env.PORT || 8080}`) ||
      null;

    if (!publicBaseUrl) {
      throw new Error("PUBLIC_BASE_URL or BACKEND_URL must be set for publishing");
    }

    // Формируем mediaUrl для публикации
    const mediaUrl = `${publicBaseUrl}/api/music-clips/media/${userFolderKey}/${channelFolderKey}/final.mp4`;

    // Генерируем title и description
    const title = `Music Clip - ${channel.name}`;
    const description = `Generated music clip for ${channel.name}`;

    const publishResults = await blottataPublisherService.publishToAllPlatforms({
      channel,
      mediaUrl,
      description,
      title,
      userId
    });

    const successfulPlatforms: string[] = [];
    const errors: string[] = [];

    publishResults.forEach(result => {
      if (result.success) {
        successfulPlatforms.push(result.platform);
      } else {
        errors.push(`${result.platform}: ${result.error || "Unknown error"}`);
      }
    });

    if (successfulPlatforms.length === 0) {
      throw new Error(`All platforms failed: ${errors.join("; ")}`);
    }

    Logger.info("[MusicClips] Published successfully", {
      successfulPlatforms,
      errors: errors.length > 0 ? errors : undefined
    });

    // ========== ШАГ F: Перенос в uploaded ==========
    Logger.info("[MusicClips] Step F: Moving to uploaded");

    const uploadedDir = storage.resolveMusicClipsUploadedDir(userFolderKey, channelFolderKey);
    const timestamp = Date.now();
    const uploadedFinalPath = path.join(uploadedDir, `final_${timestamp}.mp4`);
    const uploadedTrackPath = path.join(uploadedDir, `track_${timestamp}.mp3`);

    await fs.rename(finalPath, uploadedFinalPath);
    await fs.copyFile(trackTargetPath, uploadedTrackPath);

    Logger.info("[MusicClips] Files moved to uploaded", {
      uploadedFinalPath,
      uploadedTrackPath
    });

    const duration = Date.now() - startTime;
    Logger.info("[MusicClips] Pipeline completed successfully", {
      channelId: channel.id,
      duration,
      publishedPlatforms: successfulPlatforms
    });

    return {
      success: true,
      trackPath: uploadedTrackPath,
      finalVideoPath: uploadedFinalPath,
      publishedPlatforms: successfulPlatforms
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    Logger.error("[MusicClips] Pipeline failed", {
      channelId: channel.id,
      duration,
      error: error?.message || String(error),
      stack: error?.stack
    });

    return {
      success: false,
      error: error?.message || "Unknown error"
    };
  }
}

