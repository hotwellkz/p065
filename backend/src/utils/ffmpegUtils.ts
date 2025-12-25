/**
 * Утилиты для работы с ffmpeg/ffprobe
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { Logger } from "./logger";

const execAsync = promisify(exec);

export interface VideoInfo {
  duration: number; // в секундах
  width: number;
  height: number;
  fps: number;
  codec: string;
}

export interface AudioInfo {
  duration: number; // в секундах
  codec: string;
  bitrate?: number;
}

/**
 * Получить информацию о видео через ffprobe
 */
export async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration,width,height,r_frame_rate,codec_name -of json "${videoPath}"`
    );

    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];

    if (!stream) {
      throw new Error("No video stream found");
    }

    // Парсим fps из r_frame_rate (например "30/1")
    let fps = 30;
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split("/").map(Number);
      if (den && den > 0) {
        fps = num / den;
      }
    }

    return {
      duration: parseFloat(stream.duration || "0"),
      width: parseInt(stream.width || "0"),
      height: parseInt(stream.height || "0"),
      fps,
      codec: stream.codec_name || "unknown"
    };
  } catch (error: any) {
    Logger.error("[ffmpegUtils] Failed to get video info", {
      videoPath,
      error: error?.message || String(error)
    });
    throw new Error(`Failed to get video info: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Получить информацию об аудио через ffprobe
 */
export async function getAudioInfo(audioPath: string): Promise<AudioInfo> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=duration,codec_name,bit_rate -of json "${audioPath}"`
    );

    const data = JSON.parse(stdout);
    const stream = data.streams?.[0];

    if (!stream) {
      throw new Error("No audio stream found");
    }

    return {
      duration: parseFloat(stream.duration || "0"),
      codec: stream.codec_name || "unknown",
      bitrate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined
    };
  } catch (error: any) {
    Logger.error("[ffmpegUtils] Failed to get audio info", {
      audioPath,
      error: error?.message || String(error)
    });
    throw new Error(`Failed to get audio info: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Обрезать аудио до указанной длительности
 * @param inputPath - Путь к исходному аудио
 * @param outputPath - Путь для сохранения обрезанного аудио
 * @param durationSec - Длительность в секундах
 */
export async function trimAudio(inputPath: string, outputPath: string, durationSec: number): Promise<void> {
  Logger.info("[ffmpegUtils] Trimming audio", {
    inputPath,
    outputPath,
    durationSec
  });

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const cmd = `ffmpeg -i "${inputPath}" -t ${durationSec} -c copy "${outputPath}" -y`;
    await execAsync(cmd);

    Logger.info("[ffmpegUtils] Audio trimmed", {
      outputPath
    });
  } catch (error: any) {
    Logger.error("[ffmpegUtils] Failed to trim audio", {
      inputPath,
      outputPath,
      durationSec,
      error: error?.message || String(error)
    });
    throw new Error(`Failed to trim audio: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Зациклить аудио и обрезать до указанной длительности
 * @param inputPath - Путь к исходному аудио
 * @param outputPath - Путь для сохранения
 * @param targetDurationSec - Целевая длительность в секундах
 */
export async function loopAndTrimAudio(inputPath: string, outputPath: string, targetDurationSec: number): Promise<void> {
  Logger.info("[ffmpegUtils] Looping and trimming audio", {
    inputPath,
    outputPath,
    targetDurationSec
  });

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    // Зацикливаем аудио и обрезаем до нужной длительности
    const cmd = `ffmpeg -stream_loop -1 -i "${inputPath}" -t ${targetDurationSec} -c copy "${outputPath}" -y`;
    await execAsync(cmd);

    Logger.info("[ffmpegUtils] Audio looped and trimmed", {
      outputPath
    });
  } catch (error: any) {
    Logger.error("[ffmpegUtils] Failed to loop and trim audio", {
      inputPath,
      outputPath,
      targetDurationSec,
      error: error?.message || String(error)
    });
    throw new Error(`Failed to loop and trim audio: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Склеить видео сегменты через concat
 * @param segmentsListPath - Путь к файлу со списком сегментов (формат concat)
 * @param outputPath - Путь для сохранения склеенного видео
 */
export async function concatSegments(segmentsListPath: string, outputPath: string): Promise<void> {
  Logger.info("[ffmpegUtils] Concatenating segments", {
    segmentsListPath,
    outputPath
  });

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const cmd = `ffmpeg -f concat -safe 0 -i "${segmentsListPath}" -c copy "${outputPath}" -y`;
    await execAsync(cmd);

    Logger.info("[ffmpegUtils] Segments concatenated", {
      outputPath
    });
  } catch (error: any) {
    Logger.error("[ffmpegUtils] Failed to concatenate segments", {
      segmentsListPath,
      outputPath,
      error: error?.message || String(error)
    });
    throw new Error(`Failed to concatenate segments: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Наложить аудио на видео
 * @param videoPath - Путь к видео
 * @param audioPath - Путь к аудио
 * @param outputPath - Путь для сохранения результата
 * @param durationSec - Опциональная длительность (обрезать до)
 */
export async function overlayAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  durationSec?: number
): Promise<void> {
  Logger.info("[ffmpegUtils] Overlaying audio", {
    videoPath,
    audioPath,
    outputPath,
    durationSec
  });

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    let cmd = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0`;
    
    if (durationSec) {
      cmd += ` -t ${durationSec}`;
    }
    
    cmd += ` "${outputPath}" -y`;

    await execAsync(cmd);

    Logger.info("[ffmpegUtils] Audio overlayed", {
      outputPath
    });
  } catch (error: any) {
    Logger.error("[ffmpegUtils] Failed to overlay audio", {
      videoPath,
      audioPath,
      outputPath,
      durationSec,
      error: error?.message || String(error)
    });
    throw new Error(`Failed to overlay audio: ${error?.message || "Unknown error"}`);
  }
}

/**
 * Проверить наличие ffmpeg и ffprobe
 */
export async function checkFfmpegAvailable(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  try {
    await execAsync("ffmpeg -version");
    await execAsync("ffprobe -version");
    return { ffmpeg: true, ffprobe: true };
  } catch (error) {
    Logger.error("[ffmpegUtils] ffmpeg/ffprobe not available", {
      error: error instanceof Error ? error.message : String(error)
    });
    return { ffmpeg: false, ffprobe: false };
  }
}

