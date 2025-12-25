// Типы Channel для backend (совместимы с frontend)
export type SupportedPlatform =
  | "YOUTUBE_SHORTS"
  | "TIKTOK"
  | "INSTAGRAM_REELS"
  | "VK_CLIPS";

export type SupportedLanguage = "ru" | "en" | "kk";

export type GenerationMode = "script" | "prompt" | "video-prompt-only";

export type GenerationTransport = "telegram_global" | "telegram_user";

export type ChannelType = "shorts" | "music_clips";

export type PreferencesMode = "cyclic" | "random" | "fixed";

export interface PreferenceVariant {
  id: string;
  text: string;
  order: number;
}

export interface ChannelPreferences {
  variants: PreferenceVariant[];
  mode: PreferencesMode;
  lastUsedIndex?: number;
}

export interface ChannelAutoSendSchedule {
  id: string;
  enabled: boolean;
  daysOfWeek: number[];
  time: string;
  promptsPerRun: number;
  lastRunAt?: string | null;
}

export interface MusicClipsSettings {
  targetDurationSec: number; // Целевая длительность финального видео (например 60)
  clipSec: number; // Длительность одного сегмента (по умолчанию 10)
  segmentDelayMs: number; // Задержка между запусками сегментов (по умолчанию 30000)
  maxParallelSegments: number; // Максимум параллельных сегментов (по умолчанию 1)
  maxRetries: number; // Максимум попыток для сегмента (по умолчанию 3)
  retryDelayMs: number; // Задержка между ретраями (по умолчанию 60000)
  sunoPrompt: string; // Промпт для генерации музыки через Suno
  styleTags?: string[]; // Опциональные теги стиля для Suno
  platforms?: {
    youtube?: boolean;
    tiktok?: boolean;
    instagram?: boolean;
  };
  language?: string; // Опциональный язык
}

export interface Channel {
  id: string;
  name: string;
  type?: ChannelType; // Тип канала: "shorts" (по умолчанию) или "music_clips"
  platform: SupportedPlatform;
  language: SupportedLanguage;
  targetDurationSec: number;
  niche: string;
  audience: string;
  tone: string;
  blockedTopics: string;
  extraNotes?: string;
  generationMode?: GenerationMode;
  generationTransport?: GenerationTransport; // Источник отправки промптов: telegram_global или telegram_user
  telegramSyntaxPeer?: string | null; // Username или ID чата Syntax (например @SyntaxAI)
  preferences?: ChannelPreferences;
  autoSendSchedule?: ChannelAutoSendSchedule[];
  googleDriveFolderId?: string;
  driveInputFolderId?: string;
  driveArchiveFolderId?: string;
  blotataEnabled?: boolean;
  blotataApiKey?: string;
  blotataYoutubeId?: string;
  blotataTiktokId?: string;
  blotataInstagramId?: string;
  blotataFacebookId?: string;
  blotataFacebookPageId?: string;
  blotataThreadsId?: string;
  blotataTwitterId?: string;
  blotataLinkedinId?: string;
  blotataPinterestId?: string;
  blotataPinterestBoardId?: string;
  blotataBlueskyId?: string;
  musicClipsSettings?: MusicClipsSettings; // Настройки для каналов типа music_clips
  createdAt?: any;
  updatedAt?: any;
}

