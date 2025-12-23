// Типы Channel для backend (совместимы с frontend)
export type SupportedPlatform =
  | "YOUTUBE_SHORTS"
  | "TIKTOK"
  | "INSTAGRAM_REELS"
  | "VK_CLIPS";

export type SupportedLanguage = "ru" | "en" | "kk";

export type GenerationMode = "script" | "prompt" | "video-prompt-only";

export type GenerationTransport = "telegram_global" | "telegram_user";

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

export interface Channel {
  id: string;
  name: string;
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
  createdAt?: any;
  updatedAt?: any;
}

