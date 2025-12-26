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
import { getSunoClient, SunoTrackResult } from "./sunoClient";
import { getSunoQueue } from "./sunoQueue";
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
import {
  MusicClipsJobStage,
  updateMusicClipsJob,
  logStageTransition,
  findJobBySunoTaskId
} from "./musicClipsJobService";

/**
 * Сохранить taskId в канал для последующего polling
 */
async function saveMusicClipsTaskId(
  channel: Channel & { ownerId?: string },
  userId: string,
  taskId: string
): Promise<void> {
  if (!isFirestoreAvailable() || !db || !channel.ownerId) {
    Logger.warn("[MusicClips] Cannot save jobId: Firestore not available");
    return;
  }

  try {
    const channelRef = db
      .collection("users")
      .doc(channel.ownerId)
      .collection("channels")
      .doc(channel.id);

    const channelSnap = await channelRef.get();
    if (!channelSnap.exists) {
      Logger.warn("[MusicClips] Cannot save jobId: channel not found", {
        channelId: channel.id
      });
      return;
    }

    const currentData = channelSnap.data();
    const currentSettings = currentData?.musicClipsSettings || {};

    await channelRef.update({
      musicClipsSettings: {
        ...currentSettings,
        lastJobId: taskId, // Сохраняем taskId в lastJobId для совместимости
        lastJobStatus: "processing"
      },
      updatedAt: require("firebase-admin").firestore.FieldValue.serverTimestamp()
    });

    Logger.info("[MusicClips] TaskId saved to channel", {
      channelId: channel.id,
      taskId
    });
  } catch (error: any) {
    Logger.error("[MusicClips] Failed to save taskId", {
      channelId: channel.id,
      taskId,
      error: error?.message || String(error)
    });
  }
}

export interface MusicClipsPipelineResult {
  success: boolean;
  error?: string;
  trackPath?: string;
  finalVideoPath?: string;
  publishedPlatforms?: string[];
  taskId?: string; // ID задачи Suno для асинхронного flow
  status?: "PROCESSING" | "DONE" | "FAILED"; // Статус для асинхронного flow
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
 * Основной пайплайн обработки music_clips канала с таймаутом
 */
/**
 * Запускает пайплайн с отслеживанием через job
 * Вызывается асинхронно из runOnce endpoint
 */
export async function processMusicClipsChannelWithJob(
  channel: Channel & { ownerId?: string },
  userId: string,
  jobId: string
): Promise<void> {
  try {
    // Обновляем стадию: отправляем запрос в Suno
    await updateMusicClipsJob(jobId, { stage: "STAGE_20_SUNO_REQUEST_SENT" });
    logStageTransition(jobId, "STAGE_10_REQUEST_ACCEPTED", "STAGE_20_SUNO_REQUEST_SENT");

    // Запускаем внутренний пайплайн
    await processMusicClipsChannelInternalWithJob(channel, userId, jobId);
  } catch (error: any) {
    Logger.error("[MusicClips] Pipeline error in processMusicClipsChannelWithJob", {
      jobId,
      channelId: channel.id,
      userId,
      error: error?.message || String(error)
    });

    // Обновляем job с ошибкой
    await updateMusicClipsJob(jobId, {
      stage: "STAGE_90_FAILED",
      errorMessage: error?.message || String(error)
    });
    logStageTransition(jobId, null, "STAGE_90_FAILED", { error: error?.message });
  }
}

export async function processMusicClipsChannel(
  channel: Channel & { ownerId?: string },
  userId: string
): Promise<MusicClipsPipelineResult> {
  // Общий таймаут для всего пайплайна (по умолчанию 30 минут)
  const pipelineTimeout = Number(process.env.MUSIC_CLIPS_PIPELINE_TIMEOUT_MS) || 1800000;

  return Promise.race([
    processMusicClipsChannelInternal(channel, userId),
    new Promise<MusicClipsPipelineResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Pipeline timeout after ${pipelineTimeout}ms`));
      }, pipelineTimeout);
    })
  ]);
}

/**
 * Внутренняя реализация пайплайна с job tracking
 */
async function processMusicClipsChannelInternalWithJob(
  channel: Channel & { ownerId?: string },
  userId: string,
  jobId: string
): Promise<void> {
  const startTime = Date.now();
  Logger.info("[MusicClips] Starting pipeline with job tracking", {
    jobId,
    channelId: channel.id,
    channelName: channel.name,
    userId
  });

  if (!channel.ownerId) {
    await updateMusicClipsJob(jobId, {
      stage: "STAGE_90_FAILED",
      errorMessage: "Channel ownerId is missing"
    });
    return;
  }

  try {
    // Получаем настройки
    const settings = getMusicClipsSettings(channel);

    if (!settings.sunoPrompt) {
      await updateMusicClipsJob(jobId, {
        stage: "STAGE_90_FAILED",
        errorMessage: "sunoPrompt is not configured in musicClipsSettings"
      });
      return;
    }

    // Получаем пути к хранилищу
    const storage = getStorageService();
    const userEmail = `${channel.ownerId}@unknown.local`;
    const userFolderKey = await storage.resolveUserFolderKey(channel.ownerId, userEmail);
    const channelFolderKey = await storage.resolveChannelFolderKey(channel.ownerId, channel.id);

    // Создаём директории
    await storage.ensureMusicClipsDirs(userFolderKey, channelFolderKey);

    const trackDir = storage.resolveMusicClipsTrackDir(userFolderKey, channelFolderKey);
    const segmentsDir = storage.resolveMusicClipsSegmentsDir(userFolderKey, channelFolderKey);
    const renderDir = storage.resolveMusicClipsRenderDir(userFolderKey, channelFolderKey);
    const finalDir = storage.resolveMusicClipsFinalDir(userFolderKey, channelFolderKey);

    Logger.info("[MusicClips] Directories ensured", {
      jobId,
      trackDir,
      segmentsDir,
      renderDir,
      finalDir
    });

    // ========== ШАГ A: Генерация музыки ==========
    Logger.info("[MusicClips] Step A: Generating music", {
      jobId,
      sunoPrompt: settings.sunoPrompt.substring(0, 100) + "...",
      styleTags: settings.styleTags
    });

    const sunoClient = getSunoClient();
    const sunoQueue = getSunoQueue();

    // Формируем полный промпт с тегами стиля
    let fullPrompt = settings.sunoPrompt;
    if (settings.styleTags && settings.styleTags.length > 0) {
      const tagsStr = settings.styleTags.join(", ");
      fullPrompt = `${settings.sunoPrompt} [${tagsStr}]`;
    }

    // Проверяем кредиты
    try {
      const credits = await sunoClient.getCredits();
      if (credits.credits <= 0) {
        await updateMusicClipsJob(jobId, {
          stage: "STAGE_90_FAILED",
          errorMessage: "SUNO_NO_CREDITS: Недостаточно кредитов Suno"
        });
        return;
      }
      Logger.info("[MusicClips] Credits available", {
        jobId,
        credits: credits.credits
      });
    } catch (error: any) {
      if (error?.code === "SUNO_NO_CREDITS") {
        await updateMusicClipsJob(jobId, {
          stage: "STAGE_90_FAILED",
          errorMessage: "SUNO_NO_CREDITS: Недостаточно кредитов Suno"
        });
        return;
      }
      Logger.warn("[MusicClips] Failed to check credits, continuing anyway", {
        jobId,
        error: error?.message || String(error)
      });
    }

    // Вызываем generate
    const generateResult = await sunoQueue.add(() => 
      sunoClient.generate({
        prompt: fullPrompt,
        customMode: false,
        instrumental: false,
        model: "V4_5ALL"
      })
    );

    const taskId = generateResult.taskId;

    // Обновляем job: задача создана в Suno
    await updateMusicClipsJob(jobId, {
      stage: "STAGE_30_SUNO_TASK_CREATED",
      sunoTaskId: taskId
    });
    logStageTransition(jobId, "STAGE_20_SUNO_REQUEST_SENT", "STAGE_30_SUNO_TASK_CREATED", { taskId });

    // Сохраняем taskId в канал для совместимости
    await saveMusicClipsTaskId(channel, userId, taskId);

    Logger.info("[MusicClips] Task created", {
      jobId,
      taskId,
      channelId: channel.id
    });

    // Запускаем server-side polling как fallback (если callback не придет)
    startServerSidePolling(jobId, taskId, channel, userId, settings).catch((error: any) => {
      Logger.error("[MusicClips] Server-side polling error", {
        jobId,
        taskId,
        error: error?.message || String(error)
      });
    });

    // Пытаемся дождаться результата (короткий таймаут 30 сек)
    const waitTimeoutMs = Number(process.env.MUSIC_CLIPS_SUNO_WAIT_TIMEOUT_MS) || 30000;
    const pollIntervalMs = Number(process.env.MUSIC_CLIPS_SUNO_POLL_INTERVAL_MS) || 3000;

    try {
      // Обновляем стадию: ожидаем генерацию
      await updateMusicClipsJob(jobId, { stage: "STAGE_40_SUNO_PENDING" });
      logStageTransition(jobId, "STAGE_30_SUNO_TASK_CREATED", "STAGE_40_SUNO_PENDING");

      const recordInfo = await sunoClient.waitForResult(taskId, {
        pollIntervalMs,
        timeoutMs: waitTimeoutMs
      });

      if (recordInfo.status === "SUCCESS" && recordInfo.audioUrl) {
        // Обновляем job: успех
        await updateMusicClipsJob(jobId, {
          stage: "STAGE_50_SUNO_SUCCESS",
          audioUrl: recordInfo.audioUrl
        });
        logStageTransition(jobId, "STAGE_40_SUNO_PENDING", "STAGE_50_SUNO_SUCCESS", { audioUrl: recordInfo.audioUrl.substring(0, 100) });

        // Продолжаем обработку (скачивание, обработка аудио и т.д.)
        await processAudioAndVideo(jobId, channel, userId, recordInfo.audioUrl, settings, {
          trackDir,
          segmentsDir,
          renderDir,
          finalDir
        });
      } else if (recordInfo.status === "FAILED") {
        await updateMusicClipsJob(jobId, {
          stage: "STAGE_90_FAILED",
          errorMessage: recordInfo.errorMessage || "Suno generation failed"
        });
        logStageTransition(jobId, "STAGE_40_SUNO_PENDING", "STAGE_90_FAILED", { error: recordInfo.errorMessage });
      }
      // Если PENDING/GENERATING - callback или server-side polling обновит статус
    } catch (error: any) {
      // Таймаут или ошибка - но не обновляем job, т.к. может прийти callback
      Logger.warn("[MusicClips] Wait timeout or error, but continuing (callback or polling will update)", {
        jobId,
        taskId,
        error: error?.message || String(error)
      });
    }
  } catch (error: any) {
    Logger.error("[MusicClips] Pipeline error", {
      jobId,
      channelId: channel.id,
      userId,
      error: error?.message || String(error),
      stack: error?.stack?.substring(0, 500)
    });

    await updateMusicClipsJob(jobId, {
      stage: "STAGE_90_FAILED",
      errorMessage: error?.message || String(error)
    });
    logStageTransition(jobId, null, "STAGE_90_FAILED", { error: error?.message });
  }
}

/**
 * Server-side polling как fallback, если callback не придет
 */
async function startServerSidePolling(
  jobId: string,
  taskId: string,
  channel: Channel & { ownerId?: string },
  userId: string,
  settings: MusicClipsSettings
): Promise<void> {
  const maxWaitTime = 10 * 60 * 1000; // 10 минут
  const pollInterval = 12 * 1000; // 12 секунд
  const startTime = Date.now();

  Logger.info("[MusicClips] Starting server-side polling", {
    jobId,
    taskId,
    maxWaitTime,
    pollInterval
  });

  while (Date.now() - startTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    try {
      const { getMusicClipsJob } = await import("./musicClipsJobService");
      const job = await getMusicClipsJob(jobId);

      // Если job уже завершен (SUCCESS или FAILED), прекращаем polling
      if (job && (job.stage === "STAGE_50_SUNO_SUCCESS" || job.stage === "STAGE_90_FAILED")) {
        Logger.info("[MusicClips] Server-side polling stopped: job completed", {
          jobId,
          taskId,
          stage: job.stage
        });
        return;
      }

      // Проверяем статус в Suno
      const sunoClient = getSunoClient();
      const recordInfo = await sunoClient.getRecordInfo(taskId);

      if (recordInfo.status === "SUCCESS" && recordInfo.audioUrl) {
        // Обновляем job
        await updateMusicClipsJob(jobId, {
          stage: "STAGE_50_SUNO_SUCCESS",
          audioUrl: recordInfo.audioUrl
        });
        logStageTransition(jobId, "STAGE_40_SUNO_PENDING", "STAGE_50_SUNO_SUCCESS", { source: "server-side-polling" });

        // Продолжаем обработку
        const storage = getStorageService();
        const userEmail = `${channel.ownerId}@unknown.local`;
        const userFolderKey = await storage.resolveUserFolderKey(channel.ownerId, userEmail);
        const channelFolderKey = await storage.resolveChannelFolderKey(channel.ownerId, channel.id);
        await storage.ensureMusicClipsDirs(userFolderKey, channelFolderKey);

        const trackDir = storage.resolveMusicClipsTrackDir(userFolderKey, channelFolderKey);
        const segmentsDir = storage.resolveMusicClipsSegmentsDir(userFolderKey, channelFolderKey);
        const renderDir = storage.resolveMusicClipsRenderDir(userFolderKey, channelFolderKey);
        const finalDir = storage.resolveMusicClipsFinalDir(userFolderKey, channelFolderKey);

        await processAudioAndVideo(jobId, channel, userId, recordInfo.audioUrl, settings, {
          trackDir,
          segmentsDir,
          renderDir,
          finalDir
        });

        return;
      } else if (recordInfo.status === "FAILED") {
        await updateMusicClipsJob(jobId, {
          stage: "STAGE_90_FAILED",
          errorMessage: recordInfo.errorMessage || "Suno generation failed"
        });
        logStageTransition(jobId, "STAGE_40_SUNO_PENDING", "STAGE_90_FAILED", { source: "server-side-polling" });
        return;
      }
      // Если PENDING/GENERATING - продолжаем polling
    } catch (error: any) {
      Logger.warn("[MusicClips] Server-side polling error (continuing)", {
        jobId,
        taskId,
        error: error?.message || String(error)
      });
      // Продолжаем polling
    }
  }

  // Таймаут
  Logger.warn("[MusicClips] Server-side polling timeout", {
    jobId,
    taskId,
    elapsed: Date.now() - startTime
  });

  await updateMusicClipsJob(jobId, {
    stage: "STAGE_99_TIMEOUT",
    errorMessage: "Превышено время ожидания генерации (10 минут). Проверьте статус в Suno или попробуйте снова."
  });
  logStageTransition(jobId, "STAGE_40_SUNO_PENDING", "STAGE_99_TIMEOUT");
}

/**
 * Обработка аудио и видео после получения audioUrl
 */
async function processAudioAndVideo(
  jobId: string,
  channel: Channel & { ownerId?: string },
  userId: string,
  audioUrl: string,
  settings: MusicClipsSettings,
  dirs: {
    trackDir: string;
    segmentsDir: string;
    renderDir: string;
    finalDir: string;
  }
): Promise<void> {
  try {
    const sunoClient = getSunoClient();

    // Скачиваем трек
    const trackRawPath = path.join(dirs.trackDir, "track_raw.mp3");
    await sunoClient.downloadAudio(audioUrl, trackRawPath);

    // Получаем длительность трека
    const audioInfo = await getAudioInfo(trackRawPath);
    Logger.info("[MusicClips] Track downloaded", {
      jobId,
      trackRawPath,
      duration: audioInfo.duration
    });

    // Приводим аудио к targetDurationSec
    const trackTargetPath = path.join(dirs.trackDir, "track_target.mp3");
    if (audioInfo.duration > settings.targetDurationSec) {
      await trimAudio(trackRawPath, trackTargetPath, settings.targetDurationSec);
    } else if (audioInfo.duration < settings.targetDurationSec) {
      await loopAndTrimAudio(trackRawPath, trackTargetPath, settings.targetDurationSec);
    } else {
      await fs.copyFile(trackRawPath, trackTargetPath);
    }

    Logger.info("[MusicClips] Track processed", {
      jobId,
      trackTargetPath,
      targetDuration: settings.targetDurationSec
    });

    // TODO: Генерация видео-сегментов, склейка, наложение музыки, публикация
    // Это требует интеграции с системой генерации видео

    Logger.info("[MusicClips] Pipeline completed (audio ready, video generation TODO)", {
      jobId
    });
  } catch (error: any) {
    Logger.error("[MusicClips] Error processing audio/video", {
      jobId,
      error: error?.message || String(error)
    });
    throw error;
  }
}

/**
 * Внутренняя реализация пайплайна (legacy, для совместимости)
 */
async function processMusicClipsChannelInternal(
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
    const sunoQueue = getSunoQueue();

    // Формируем полный промпт с тегами стиля
    let fullPrompt = settings.sunoPrompt;
    if (settings.styleTags && settings.styleTags.length > 0) {
      const tagsStr = settings.styleTags.join(", ");
      fullPrompt = `${settings.sunoPrompt} [${tagsStr}]`;
    }

    // (Опционально) Проверяем кредиты
    try {
      const credits = await sunoClient.getCredits();
      if (credits.credits <= 0) {
        Logger.warn("[MusicClips] No credits available", {
          channelId: channel.id,
          userId,
          credits: credits.credits
        });
        const error = new Error("SUNO_NO_CREDITS") as Error & { code?: string };
        error.code = "SUNO_NO_CREDITS";
        throw error;
      }
      Logger.info("[MusicClips] Credits available", {
        channelId: channel.id,
        userId,
        credits: credits.credits
      });
    } catch (error: any) {
      // Если это ошибка отсутствия кредитов, пробрасываем дальше
      if (error?.code === "SUNO_NO_CREDITS" || error?.message?.includes("SUNO_NO_CREDITS")) {
        throw error;
      }
      Logger.warn("[MusicClips] Failed to check credits, continuing anyway", {
        channelId: channel.id,
        userId,
        error: error?.message || String(error)
      });
      // Продолжаем выполнение, если проверка кредитов не удалась
    }

    // Используем новый generate API через очередь
    // callBackUrl будет автоматически добавлен из ENV (PUBLIC_BASE_URL + SUNO_CALLBACK_PATH)
    const generateResult = await sunoQueue.add(() => 
      sunoClient.generate({
        prompt: fullPrompt,
        customMode: false,
        instrumental: false,
        model: "V4_5ALL"
        // callBackUrl не передаем явно - будет взят из ENV через getCallBackUrl()
      })
    );

    const taskId = generateResult.taskId;

    // Сохраняем taskId в канал для последующего polling
    await saveMusicClipsTaskId(channel, userId, taskId);

    Logger.info("[MusicClips] Task created", {
      taskId,
      channelId: channel.id
    });

    // Пытаемся дождаться результата (короткий таймаут 20-40 сек)
    const waitTimeoutMs = Number(process.env.MUSIC_CLIPS_SUNO_WAIT_TIMEOUT_MS) || 30000; // 30 секунд по умолчанию
    const pollIntervalMs = Number(process.env.MUSIC_CLIPS_SUNO_POLL_INTERVAL_MS) || 3000; // 3 секунды

    try {
      const recordInfo = await sunoClient.waitForResult(taskId, {
        pollIntervalMs,
        timeoutMs: waitTimeoutMs
      });

      if (recordInfo.status === "SUCCESS" && recordInfo.audioUrl) {
        Logger.info("[MusicClips] Track generated successfully", {
          taskId,
          audioUrl: recordInfo.audioUrl.substring(0, 100) + "..."
        });

        // Скачиваем трек
        const trackRawPath = path.join(trackDir, "track_raw.mp3");
        await sunoClient.downloadAudio(recordInfo.audioUrl, trackRawPath);

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

        Logger.info("[MusicClips] Track processed", {
          trackTargetPath,
          targetDuration: settings.targetDurationSec
        });

        // Продолжаем с остальным pipeline (сегменты, склейка, наложение, публикация)
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

        let publicBaseUrl = process.env.PUBLIC_BASE_URL ||
          process.env.BACKEND_URL ||
          process.env.FRONTEND_ORIGIN?.replace(":5173", `:${process.env.PORT || 8080}`) ||
          null;

        if (!publicBaseUrl) {
          throw new Error("PUBLIC_BASE_URL or BACKEND_URL must be set for publishing");
        }

        const mediaUrl = `${publicBaseUrl}/api/music-clips/media/${userFolderKey}/${channelFolderKey}/final.mp4`;
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

        return {
          success: true,
          trackPath: uploadedTrackPath,
          finalVideoPath: uploadedFinalPath,
          publishedPlatforms: successfulPlatforms
        };

      } else if (recordInfo.status === "FAILED") {
        Logger.error("[MusicClips] Track generation failed", {
          taskId,
          errorMessage: recordInfo.errorMessage
        });
        return {
          success: false,
          error: `Suno generation failed: ${recordInfo.errorMessage || "Unknown error"}`,
          taskId,
          status: "FAILED"
        };
      } else {
        // PENDING или GENERATING - возвращаем PROCESSING
        Logger.info("[MusicClips] Track generation still in progress", {
          channelId: channel.id,
          userId,
          taskId,
          status: recordInfo.status
        });
        return {
          success: true, // success: true, потому что задача создана успешно
          taskId,
          status: "PROCESSING"
        };
      }
    } catch (error: any) {
      if (error?.code === "SUNO_POLLING_TIMEOUT") {
        // Timeout - возвращаем PROCESSING для последующего polling
        Logger.info("[MusicClips] Polling timeout, returning PROCESSING", {
          channelId: channel.id,
          userId,
          taskId,
          elapsedMs: waitTimeoutMs
        });
        return {
          success: true, // success: true, потому что задача создана успешно
          taskId,
          status: "PROCESSING"
        };
      }
      throw error;
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    Logger.error("[MusicClips] Pipeline failed", {
      channelId: channel.id,
      userId,
      duration,
      error: error?.message || String(error),
      stack: error?.stack
    });

    // Пробрасываем ошибку кредитов дальше
    if (error?.code === "SUNO_NO_CREDITS") {
      throw error;
    }

    return {
      success: false,
      error: error?.message || "Unknown error"
    };
  }
}

