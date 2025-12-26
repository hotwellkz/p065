/**
 * Сервис для управления job'ами Music Clips
 * Отслеживает прогресс генерации через стадии (STAGE_10, STAGE_20, etc.)
 */

import { Logger } from "../utils/logger";
import { db, isFirestoreAvailable } from "./firebaseAdmin";

export type MusicClipsJobStage =
  | "STAGE_10_REQUEST_ACCEPTED"
  | "STAGE_20_SUNO_REQUEST_SENT"
  | "STAGE_30_SUNO_TASK_CREATED"
  | "STAGE_40_SUNO_PENDING"
  | "STAGE_50_SUNO_SUCCESS"
  | "STAGE_90_FAILED"
  | "STAGE_99_TIMEOUT";

export interface MusicClipsJob {
  jobId: string;
  channelId: string;
  userId: string;
  stage: MusicClipsJobStage;
  sunoTaskId?: string | null;
  audioUrl?: string | null;
  errorMessage?: string | null;
  progressText?: string | null;
  createdAt: Date | any; // Firestore Timestamp
  updatedAt: Date | any; // Firestore Timestamp
}

/**
 * Генерирует уникальный jobId
 */
export function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Создает новый job в Firestore
 */
export async function createMusicClipsJob(
  jobId: string,
  channelId: string,
  userId: string,
  stage: MusicClipsJobStage = "STAGE_10_REQUEST_ACCEPTED"
): Promise<void> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("[MusicClipsJob] Firestore not available, cannot create job");
    return;
  }

  try {
    const jobData: Omit<MusicClipsJob, "createdAt" | "updatedAt"> & {
      createdAt: any;
      updatedAt: any;
    } = {
      jobId,
      channelId,
      userId,
      stage,
      sunoTaskId: null,
      audioUrl: null,
      errorMessage: null,
      progressText: getProgressText(stage),
      createdAt: require("firebase-admin").firestore.FieldValue.serverTimestamp(),
      updatedAt: require("firebase-admin").firestore.FieldValue.serverTimestamp()
    };

    await db.collection("musicClipsJobs").doc(jobId).set(jobData);

    Logger.info("[MusicClipsJob] Job created", {
      jobId,
      channelId,
      userId,
      stage
    });
  } catch (error: any) {
    Logger.error("[MusicClipsJob] Failed to create job", {
      jobId,
      channelId,
      userId,
      error: error?.message || String(error)
    });
    throw error;
  }
}

/**
 * Обновляет job в Firestore
 */
export async function updateMusicClipsJob(
  jobId: string,
  updates: Partial<Pick<MusicClipsJob, "stage" | "sunoTaskId" | "audioUrl" | "errorMessage" | "progressText">>
): Promise<void> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("[MusicClipsJob] Firestore not available, cannot update job");
    return;
  }

  try {
    const updateData: any = {
      ...updates,
      updatedAt: require("firebase-admin").firestore.FieldValue.serverTimestamp()
    };

    // Если обновляется stage, обновляем и progressText
    if (updates.stage) {
      updateData.progressText = getProgressText(updates.stage);
    }

    await db.collection("musicClipsJobs").doc(jobId).update(updateData);

    Logger.info("[MusicClipsJob] Job updated", {
      jobId,
      updates
    });
  } catch (error: any) {
    Logger.error("[MusicClipsJob] Failed to update job", {
      jobId,
      updates,
      error: error?.message || String(error)
    });
    throw error;
  }
}

/**
 * Получает job по jobId
 */
export async function getMusicClipsJob(jobId: string): Promise<MusicClipsJob | null> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("[MusicClipsJob] Firestore not available, cannot get job");
    return null;
  }

  try {
    const jobDoc = await db.collection("musicClipsJobs").doc(jobId).get();

    if (!jobDoc.exists) {
      return null;
    }

    const data = jobDoc.data();
    return {
      jobId: data?.jobId || jobId,
      channelId: data?.channelId || "",
      userId: data?.userId || "",
      stage: data?.stage || "STAGE_10_REQUEST_ACCEPTED",
      sunoTaskId: data?.sunoTaskId || null,
      audioUrl: data?.audioUrl || null,
      errorMessage: data?.errorMessage || null,
      progressText: data?.progressText || getProgressText(data?.stage || "STAGE_10_REQUEST_ACCEPTED"),
      createdAt: data?.createdAt,
      updatedAt: data?.updatedAt
    } as MusicClipsJob;
  } catch (error: any) {
    Logger.error("[MusicClipsJob] Failed to get job", {
      jobId,
      error: error?.message || String(error)
    });
    return null;
  }
}

/**
 * Находит job по sunoTaskId
 */
export async function findJobBySunoTaskId(sunoTaskId: string): Promise<MusicClipsJob | null> {
  if (!isFirestoreAvailable() || !db) {
    Logger.warn("[MusicClipsJob] Firestore not available, cannot find job");
    return null;
  }

  try {
    const snapshot = await db
      .collection("musicClipsJobs")
      .where("sunoTaskId", "==", sunoTaskId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      jobId: data?.jobId || doc.id,
      channelId: data?.channelId || "",
      userId: data?.userId || "",
      stage: data?.stage || "STAGE_10_REQUEST_ACCEPTED",
      sunoTaskId: data?.sunoTaskId || null,
      audioUrl: data?.audioUrl || null,
      errorMessage: data?.errorMessage || null,
      progressText: data?.progressText || getProgressText(data?.stage || "STAGE_10_REQUEST_ACCEPTED"),
      createdAt: data?.createdAt,
      updatedAt: data?.updatedAt
    } as MusicClipsJob;
  } catch (error: any) {
    Logger.error("[MusicClipsJob] Failed to find job by sunoTaskId", {
      sunoTaskId,
      error: error?.message || String(error)
    });
    return null;
  }
}

/**
 * Получает текстовое описание прогресса для стадии
 */
export function getProgressText(stage: MusicClipsJobStage): string {
  switch (stage) {
    case "STAGE_10_REQUEST_ACCEPTED":
      return "Запрос принят, отправляем запрос в Suno...";
    case "STAGE_20_SUNO_REQUEST_SENT":
      return "Запрос отправлен в Suno, ожидаем ответ...";
    case "STAGE_30_SUNO_TASK_CREATED":
      return "Задача создана в Suno, ожидаем генерацию...";
    case "STAGE_40_SUNO_PENDING":
      return "Генерация музыки в процессе (PENDING/GENERATING)...";
    case "STAGE_50_SUNO_SUCCESS":
      return "Музыка сгенерирована успешно!";
    case "STAGE_90_FAILED":
      return "Ошибка при генерации";
    case "STAGE_99_TIMEOUT":
      return "Превышено время ожидания";
    default:
      return "Обработка...";
  }
}

/**
 * Логирует переход на новую стадию
 */
export function logStageTransition(
  jobId: string,
  oldStage: MusicClipsJobStage | null,
  newStage: MusicClipsJobStage,
  context?: Record<string, any>
): void {
  Logger.info("[MusicClipsJob] Stage transition", {
    jobId,
    oldStage,
    newStage,
    progressText: getProgressText(newStage),
    ...context
  });
}

