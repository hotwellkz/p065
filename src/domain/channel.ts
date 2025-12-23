import {
  Timestamp,
  serverTimestamp,
  type FirestoreDataConverter
} from "firebase/firestore";

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
  id: string; // uuid
  text: string;
  order: number; // порядок отображения
}

export interface ChannelPreferences {
  variants: PreferenceVariant[];
  mode: PreferencesMode;
  lastUsedIndex?: number; // для циклического режима
}

export interface ChannelAutoSendSchedule {
  id: string; // uuid
  enabled: boolean; // включен ли этот конкретный слот
  daysOfWeek: number[]; // 0–6 (вс, пн, вт, ...), локальная неделя
  time: string; // "HH:MM" в локальном времени пользователя (24h формат)
  promptsPerRun: number; // сколько промптов генерировать за один запуск
  lastRunAt?: string | null; // ISO-дата последнего запуска
}

export interface Channel {
  id: string;
  name: string;
  // TODO: slug can be added later for prettier file names, currently not stored explicitly
  platform: SupportedPlatform;
  language: SupportedLanguage;
  targetDurationSec: number;
  niche: string;
  audience: string;
  tone: string;
  blockedTopics: string;
  extraNotes?: string; // Устаревшее поле, оставлено для обратной совместимости
  preferences?: ChannelPreferences; // Новая система мульти-пожеланий
  generationMode?: GenerationMode; // По умолчанию "script" для обратной совместимости
  generationTransport?: GenerationTransport; // Источник отправки промптов: telegram_global или telegram_user
  telegramSyntaxPeer?: string | null; // Username или ID чата Syntax (например @SyntaxAI)
  youtubeUrl?: string | null; // Ссылка на YouTube канал
  tiktokUrl?: string | null; // Ссылка на TikTok канал
  instagramUrl?: string | null; // Ссылка на Instagram канал
  // Настройки Telegram / SyntX
  telegramAutoSendEnabled?: boolean;
  telegramAutoScheduleEnabled?: boolean;
  // Google Drive: папка, куда будут сохраняться видео из SyntX для этого канала
  googleDriveFolderId?: string;
  // Автоотправка в Syntx по расписанию
  autoSendEnabled?: boolean; // общий флаг: включена ли автоматика для канала
  timezone?: string; // IANA-таймзона пользователя, например "Asia/Almaty"
  autoSendSchedules?: ChannelAutoSendSchedule[]; // массив расписаний
  // Автоматическое скачивание видео в Google Drive
  autoDownloadToDriveEnabled?: boolean; // по умолчанию false
  autoDownloadDelayMinutes?: number; // по умолчанию 10, min 1, max 60
  // Уведомления о загрузке видео в Google Drive
  uploadNotificationEnabled?: boolean; // по умолчанию false
  uploadNotificationChatId?: string | null; // необязательный chatId для уведомлений
  // Автоматическая публикация через Blotato
  blotataEnabled?: boolean; // включена ли автопубликация через Blotato
  driveInputFolderId?: string; // ID папки Google Drive, где появляются готовые видео для этого канала
  driveArchiveFolderId?: string; // ID папки Google Drive, куда переносить отработанные файлы
  blotataApiKey?: string; // API ключ для Blotato (может быть переопределен на уровне канала)
  blotataYoutubeId?: string | null; // ID YouTube аккаунта в Blotato
  blotataTiktokId?: string | null; // ID TikTok аккаунта в Blotato
  blotataInstagramId?: string | null; // ID Instagram аккаунта в Blotato
  blotataFacebookId?: string | null;
  blotataFacebookPageId?: string | null;
  blotataThreadsId?: string | null;
  blotataTwitterId?: string | null;
  blotataLinkedinId?: string | null;
  blotataPinterestId?: string | null;
  blotataPinterestBoardId?: string | null;
  blotataBlueskyId?: string | null;
  // Порядок отображения каналов (для drag & drop)
  orderIndex?: number; // чем меньше число, тем выше в списке
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ChannelCreatePayload = Omit<
  Channel,
  "id" | "createdAt" | "updatedAt"
>;

type ChannelFirestoreData = Omit<Channel, "id">;

export const channelConverter: FirestoreDataConverter<Channel> = {
  toFirestore(channel: Channel): ChannelFirestoreData {
    const { id, ...rest } = channel;
    
    // Создаём объект для сохранения
    // Firestore не поддерживает undefined, поэтому удаляем все undefined значения
    const data: any = {
      name: rest.name,
      platform: rest.platform,
      language: rest.language,
      targetDurationSec: rest.targetDurationSec,
      niche: rest.niche,
      audience: rest.audience,
      tone: rest.tone,
      blockedTopics: rest.blockedTopics,
      generationMode: rest.generationMode || "script",
      // generationTransport устанавливается при создании канала на основе статуса Telegram пользователя
      // Если не указан явно, используем telegram_global для обратной совместимости
      generationTransport: rest.generationTransport ?? "telegram_global",
      telegramSyntaxPeer: rest.telegramSyntaxPeer ?? null,
      // Явно устанавливаем autoSendEnabled, чтобы Firestore сохранил его
      // Для существующих каналов сохраняем текущее значение
      autoSendEnabled: rest.autoSendEnabled ?? false,
      autoSendSchedules: rest.autoSendSchedules ?? [],
      createdAt: rest.createdAt ?? (serverTimestamp() as unknown as Timestamp),
      updatedAt: serverTimestamp() as unknown as Timestamp
    };
    
    // Добавляем опциональные поля только если они не undefined
    // Firestore не поддерживает undefined, но поддерживает null
    if (rest.timezone !== undefined) {
      data.timezone = rest.timezone;
    }
    if (rest.extraNotes !== undefined) {
      data.extraNotes = rest.extraNotes;
    }
    if (rest.preferences !== undefined) {
      data.preferences = rest.preferences;
      
      // Отладочный лог (только в development)
      if (import.meta.env.DEV) {
        console.log("💾 toFirestore - Saving preferences:", {
          channelId: rest.id || "new",
          mode: rest.preferences.mode,
          lastUsedIndex: rest.preferences.lastUsedIndex,
          variantsCount: rest.preferences.variants.length
        });
      }
    }
    if (rest.googleDriveFolderId !== undefined) {
      data.googleDriveFolderId = rest.googleDriveFolderId;
    }
    if (rest.youtubeUrl !== undefined) {
      data.youtubeUrl = rest.youtubeUrl;
    }
    if (rest.tiktokUrl !== undefined) {
      data.tiktokUrl = rest.tiktokUrl;
    }
    if (rest.instagramUrl !== undefined) {
      data.instagramUrl = rest.instagramUrl;
    }
    if (rest.generationTransport !== undefined) {
      data.generationTransport = rest.generationTransport;
    }
    if (rest.telegramSyntaxPeer !== undefined) {
      data.telegramSyntaxPeer = rest.telegramSyntaxPeer;
    }
    if (rest.telegramAutoSendEnabled !== undefined) {
      data.telegramAutoSendEnabled = rest.telegramAutoSendEnabled;
    }
    if (rest.telegramAutoScheduleEnabled !== undefined) {
      data.telegramAutoScheduleEnabled = rest.telegramAutoScheduleEnabled;
    }
    if (rest.autoDownloadToDriveEnabled !== undefined) {
      data.autoDownloadToDriveEnabled = rest.autoDownloadToDriveEnabled;
    }
    if (rest.autoDownloadDelayMinutes !== undefined) {
      data.autoDownloadDelayMinutes = rest.autoDownloadDelayMinutes;
    }
    if (rest.uploadNotificationEnabled !== undefined) {
      data.uploadNotificationEnabled = rest.uploadNotificationEnabled;
    }
    if (rest.uploadNotificationChatId !== undefined) {
      data.uploadNotificationChatId = rest.uploadNotificationChatId;
    }
    if (rest.orderIndex !== undefined) {
      data.orderIndex = rest.orderIndex;
    }
    if (rest.blotataEnabled !== undefined) {
      data.blotataEnabled = rest.blotataEnabled;
    }
    if (rest.driveInputFolderId !== undefined) {
      data.driveInputFolderId = rest.driveInputFolderId;
    }
    if (rest.driveArchiveFolderId !== undefined) {
      data.driveArchiveFolderId = rest.driveArchiveFolderId;
    }
    if (rest.blotataApiKey !== undefined) {
      data.blotataApiKey = rest.blotataApiKey;
    }
    if (rest.blotataYoutubeId !== undefined) {
      data.blotataYoutubeId = rest.blotataYoutubeId;
    }
    if (rest.blotataTiktokId !== undefined) {
      data.blotataTiktokId = rest.blotataTiktokId;
    }
    if (rest.blotataInstagramId !== undefined) {
      data.blotataInstagramId = rest.blotataInstagramId;
    }
    if (rest.blotataFacebookId !== undefined) {
      data.blotataFacebookId = rest.blotataFacebookId;
    }
    if (rest.blotataFacebookPageId !== undefined) {
      data.blotataFacebookPageId = rest.blotataFacebookPageId;
    }
    if (rest.blotataThreadsId !== undefined) {
      data.blotataThreadsId = rest.blotataThreadsId;
    }
    if (rest.blotataTwitterId !== undefined) {
      data.blotataTwitterId = rest.blotataTwitterId;
    }
    if (rest.blotataLinkedinId !== undefined) {
      data.blotataLinkedinId = rest.blotataLinkedinId;
    }
    if (rest.blotataPinterestId !== undefined) {
      data.blotataPinterestId = rest.blotataPinterestId;
    }
    if (rest.blotataPinterestBoardId !== undefined) {
      data.blotataPinterestBoardId = rest.blotataPinterestBoardId;
    }
    if (rest.blotataBlueskyId !== undefined) {
      data.blotataBlueskyId = rest.blotataBlueskyId;
    }
    
    return data;
  },
  fromFirestore(snapshot, options): Channel {
    const data = snapshot.data(options) as ChannelFirestoreData;
    const channel: Channel = {
      id: snapshot.id,
      generationMode: data.generationMode || "script", // Значение по умолчанию для старых каналов
      ...data
    };
    
    // Миграция: если есть extraNotes, но нет preferences, создаём preferences из extraNotes
    if (!channel.preferences && channel.extraNotes) {
      channel.preferences = {
        variants: [{
          id: crypto.randomUUID(),
          text: channel.extraNotes,
          order: 1
        }],
        mode: "fixed",
        lastUsedIndex: 0
      };
    }
    
    // Если preferences есть, но пустые, создаём дефолтный вариант
    if (channel.preferences && channel.preferences.variants.length === 0) {
      channel.preferences = {
        variants: [{
          id: crypto.randomUUID(),
          text: "",
          order: 1
        }],
        mode: channel.preferences.mode || "cyclic",
        lastUsedIndex: 0
      };
    }
    
    // Убеждаемся, что lastUsedIndex установлен
    if (channel.preferences && channel.preferences.lastUsedIndex === undefined) {
      channel.preferences.lastUsedIndex = 0;
    }
    
    // Отладочный лог (только в development)
    if (import.meta.env.DEV && channel.preferences) {
      console.log("📥 fromFirestore - Loaded preferences:", {
        channelId: channel.id,
        mode: channel.preferences.mode,
        lastUsedIndex: channel.preferences.lastUsedIndex,
        variantsCount: channel.preferences.variants.length
      });
    }
    
    return channel;
  }
};

export const createEmptyChannel = (): Channel => {
  const now = Timestamp.now();
  return {
    id: "",
    name: "",
    platform: "YOUTUBE_SHORTS",
    language: "ru",
    targetDurationSec: 15,
    niche: "",
    audience: "",
    tone: "",
    blockedTopics: "",
    extraNotes: "",
    preferences: {
      variants: [{
        id: crypto.randomUUID(),
        text: "",
        order: 1
      }],
      mode: "cyclic",
      lastUsedIndex: 0
    },
    generationMode: "script",
    youtubeUrl: null,
    tiktokUrl: null,
    instagramUrl: null,
    googleDriveFolderId: undefined,
    telegramAutoSendEnabled: false,
    telegramAutoScheduleEnabled: false,
    autoSendEnabled: true, // По умолчанию включено для новых каналов
    timezone: "Asia/Almaty", // По умолчанию Asia/Almaty для новых каналов
    autoSendSchedules: [], // Будет заполнено при создании канала, если пусто
    autoDownloadToDriveEnabled: true, // По умолчанию включено для новых каналов
    autoDownloadDelayMinutes: 10,
    uploadNotificationEnabled: false,
    uploadNotificationChatId: null,
    blotataEnabled: true, // По умолчанию включено для новых каналов
    driveInputFolderId: undefined,
    driveArchiveFolderId: undefined,
    blotataApiKey: undefined,
    blotataYoutubeId: null,
    blotataTiktokId: null,
    blotataInstagramId: null,
    blotataFacebookId: null,
    blotataFacebookPageId: null,
    blotataThreadsId: null,
    blotataTwitterId: null,
    blotataLinkedinId: null,
    blotataPinterestId: null,
    blotataPinterestBoardId: null,
    blotataBlueskyId: null,
    orderIndex: 0,
    createdAt: now,
    updatedAt: now
  };
};

