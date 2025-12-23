import axios, { AxiosInstance } from "axios";
import { Logger } from "../utils/logger";
import type { Channel } from "../types/channel";
import { normalizeYoutubeTitle } from "../utils/youtubeTitleNormalizer";

interface BlottataPlatformIds {
  youtubeId?: string | null;
  tiktokId?: string | null;
  instagramId?: string | null;
  facebookId?: string | null;
  facebookPageId?: string | null;
  threadsId?: string | null;
  twitterId?: string | null;
  linkedinId?: string | null;
  pinterestId?: string | null;
  pinterestBoardId?: string | null;
  blueskyId?: string | null;
}

interface BlottataPublishResult {
  platform: string;
  success: boolean;
  error?: string;
  response?: any;
}

interface BlottataPublishOptions {
  channel: Channel;
  mediaUrl: string;
  description: string;
  title?: string;
}

/**
 * Сервис для публикации видео через Blottata API
 */
export class BlottataPublisherService {
  private apiKey: string;
  private httpClient: AxiosInstance;

  constructor(apiKey?: string) {
    // Используем переданный ключ или ключ из ENV
    this.apiKey = apiKey || process.env.BLOTATA_API_KEY || "";
    
    if (!this.apiKey) {
      Logger.warn("BlottataPublisherService: API key not provided, some operations may fail");
    }

    this.httpClient = axios.create({
      baseURL: "https://backend.blotato.com/v2",
      timeout: 60000, // 60 секунд для загрузки медиа
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  /**
   * Получает ID платформ из канала
   */
  private getPlatformIds(channel: Channel): BlottataPlatformIds {
    return {
      youtubeId: channel.blotataYoutubeId,
      tiktokId: channel.blotataTiktokId,
      instagramId: channel.blotataInstagramId,
      facebookId: channel.blotataFacebookId,
      facebookPageId: channel.blotataFacebookPageId,
      threadsId: channel.blotataThreadsId,
      twitterId: channel.blotataTwitterId,
      linkedinId: channel.blotataLinkedinId,
      pinterestId: channel.blotataPinterestId,
      pinterestBoardId: channel.blotataPinterestBoardId,
      blueskyId: channel.blotataBlueskyId
    };
  }

  /**
   * Загружает медиа в Blottata и получает URL для публикации
   */
  async uploadMedia(mediaUrl: string, apiKey?: string): Promise<string> {
    const key = apiKey || this.apiKey;
    
    if (!key) {
      throw new Error("BLOTATA_API_KEY_REQUIRED: Blottata API key is required");
    }

    try {
      Logger.info("BlottataPublisherService: Uploading media", { mediaUrl });

      const response = await this.httpClient.post(
        "/media",
        { url: mediaUrl },
        {
          headers: {
            "blotato-api-key": key
          }
        }
      );

      if (!response.data?.url) {
        throw new Error("Blottata did not return media URL");
      }

      Logger.info("BlottataPublisherService: Media uploaded successfully", {
        mediaUrl: response.data.url
      });

      return response.data.url;
    } catch (error: any) {
      Logger.error("BlottataPublisherService: Failed to upload media", {
        error: error?.message || String(error),
        status: error?.response?.status,
        data: error?.response?.data
      });
      throw new Error(
        `BLOTATA_MEDIA_UPLOAD_FAILED: ${error?.response?.data?.message || error?.message || "Unknown error"}`
      );
    }
  }

  /**
   * Публикует на YouTube через Blottata
   */
  async publishToYouTube(
    options: BlottataPublishOptions
  ): Promise<BlottataPublishResult> {
    const { channel, mediaUrl, description, title } = options;
    const platformIds = this.getPlatformIds(channel);
    const apiKey = channel.blotataApiKey || this.apiKey;

    if (!platformIds.youtubeId) {
      return {
        platform: "youtube",
        success: false,
        error: "YouTube ID not configured"
      };
    }

    if (!apiKey) {
      return {
        platform: "youtube",
        success: false,
        error: "Blottata API key not configured"
      };
    }

    try {
      Logger.info("BlottataPublisherService: Publishing to YouTube", {
        channelId: channel.id,
        youtubeId: platformIds.youtubeId
      });

      // Нормализуем title перед отправкой в YouTube API
      const normalizedTitle = normalizeYoutubeTitle(title || description);

      const postData = {
        post: {
          target: {
            targetType: "youtube",
            title: normalizedTitle,
            privacyStatus: "public",
            shouldNotifySubscribers: true
          },
          content: {
            text: description,
            platform: "youtube",
            mediaUrls: [mediaUrl]
          },
          accountId: platformIds.youtubeId
        }
      };

      const response = await this.httpClient.post("/posts", postData, {
        headers: {
          "blotato-api-key": apiKey
        }
      });

      Logger.info("BlottataPublisherService: Published to YouTube successfully", {
        channelId: channel.id,
        postId: response.data?.id
      });

      return {
        platform: "youtube",
        success: true,
        response: response.data
      };
    } catch (error: any) {
      Logger.error("BlottataPublisherService: Failed to publish to YouTube", {
        channelId: channel.id,
        error: error?.message || String(error),
        status: error?.response?.status,
        data: error?.response?.data
      });

      return {
        platform: "youtube",
        success: false,
        error: error?.response?.data?.message || error?.message || "Unknown error"
      };
    }
  }

  /**
   * Публикует на TikTok через Blottata
   */
  async publishToTikTok(
    options: BlottataPublishOptions
  ): Promise<BlottataPublishResult> {
    const { channel, mediaUrl, description } = options;
    const platformIds = this.getPlatformIds(channel);
    const apiKey = channel.blotataApiKey || this.apiKey;

    if (!platformIds.tiktokId) {
      return {
        platform: "tiktok",
        success: false,
        error: "TikTok ID not configured"
      };
    }

    if (!apiKey) {
      return {
        platform: "tiktok",
        success: false,
        error: "Blottata API key not configured"
      };
    }

    try {
      Logger.info("BlottataPublisherService: Publishing to TikTok", {
        channelId: channel.id,
        tiktokId: platformIds.tiktokId
      });

      const postData = {
        post: {
          target: {
            targetType: "tiktok",
            isYourBrand: false,
            disabledDuet: false,
            privacyLevel: "PUBLIC_TO_EVERYONE",
            isAiGenerated: false,
            disabledStitch: false,
            disabledComments: false,
            isBrandedContent: false
          },
          content: {
            text: description,
            platform: "tiktok",
            mediaUrls: [mediaUrl]
          },
          accountId: platformIds.tiktokId
        }
      };

      const response = await this.httpClient.post("/posts", postData, {
        headers: {
          "blotato-api-key": apiKey
        }
      });

      Logger.info("BlottataPublisherService: Published to TikTok successfully", {
        channelId: channel.id,
        postId: response.data?.id
      });

      return {
        platform: "tiktok",
        success: true,
        response: response.data
      };
    } catch (error: any) {
      Logger.error("BlottataPublisherService: Failed to publish to TikTok", {
        channelId: channel.id,
        error: error?.message || String(error),
        status: error?.response?.status,
        data: error?.response?.data
      });

      return {
        platform: "tiktok",
        success: false,
        error: error?.response?.data?.message || error?.message || "Unknown error"
      };
    }
  }

  /**
   * Публикует на Instagram через Blottata
   */
  async publishToInstagram(
    options: BlottataPublishOptions
  ): Promise<BlottataPublishResult> {
    const { channel, mediaUrl, description } = options;
    const platformIds = this.getPlatformIds(channel);
    const apiKey = channel.blotataApiKey || this.apiKey;

    if (!platformIds.instagramId) {
      return {
        platform: "instagram",
        success: false,
        error: "Instagram ID not configured"
      };
    }

    if (!apiKey) {
      return {
        platform: "instagram",
        success: false,
        error: "Blottata API key not configured"
      };
    }

    try {
      Logger.info("BlottataPublisherService: Publishing to Instagram", {
        channelId: channel.id,
        instagramId: platformIds.instagramId
      });

      const postData = {
        post: {
          target: {
            targetType: "instagram"
          },
          content: {
            text: description,
            platform: "instagram",
            mediaUrls: [mediaUrl]
          },
          accountId: platformIds.instagramId
        }
      };

      const response = await this.httpClient.post("/posts", postData, {
        headers: {
          "blotato-api-key": apiKey
        }
      });

      Logger.info("BlottataPublisherService: Published to Instagram successfully", {
        channelId: channel.id,
        postId: response.data?.id
      });

      return {
        platform: "instagram",
        success: true,
        response: response.data
      };
    } catch (error: any) {
      Logger.error("BlottataPublisherService: Failed to publish to Instagram", {
        channelId: channel.id,
        error: error?.message || String(error),
        status: error?.response?.status,
        data: error?.response?.data
      });

      return {
        platform: "instagram",
        success: false,
        error: error?.response?.data?.message || error?.message || "Unknown error"
      };
    }
  }

  /**
   * Публикует видео на все настроенные платформы
   */
  async publishToAllPlatforms(
    options: BlottataPublishOptions
  ): Promise<BlottataPublishResult[]> {
    const { channel, mediaUrl, description, title } = options;
    const platformIds = this.getPlatformIds(channel);
    const results: BlottataPublishResult[] = [];

    // Сначала загружаем медиа в Blottata
    let blotataMediaUrl: string;
    try {
      blotataMediaUrl = await this.uploadMedia(mediaUrl, channel.blotataApiKey || undefined);
    } catch (error: any) {
      Logger.error("BlottataPublisherService: Failed to upload media, aborting all publications", {
        error: error?.message || String(error)
      });
      // Возвращаем ошибку для всех платформ
      if (platformIds.youtubeId) {
        results.push({
          platform: "youtube",
          success: false,
          error: `Media upload failed: ${error?.message || "Unknown error"}`
        });
      }
      if (platformIds.tiktokId) {
        results.push({
          platform: "tiktok",
          success: false,
          error: `Media upload failed: ${error?.message || "Unknown error"}`
        });
      }
      if (platformIds.instagramId) {
        results.push({
          platform: "instagram",
          success: false,
          error: `Media upload failed: ${error?.message || "Unknown error"}`
        });
      }
      return results;
    }

    // Публикуем на все настроенные платформы параллельно
    const publishPromises: Promise<BlottataPublishResult>[] = [];

    if (platformIds.youtubeId) {
      publishPromises.push(
        this.publishToYouTube({
          ...options,
          mediaUrl: blotataMediaUrl
        })
      );
    }

    if (platformIds.tiktokId) {
      publishPromises.push(
        this.publishToTikTok({
          ...options,
          mediaUrl: blotataMediaUrl
        })
      );
    }

    if (platformIds.instagramId) {
      publishPromises.push(
        this.publishToInstagram({
          ...options,
          mediaUrl: blotataMediaUrl
        })
      );
    }

    // Выполняем публикации параллельно
    const publishResults = await Promise.allSettled(publishPromises);
    
    publishResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        const platform = "unknown";
        results.push({
          platform,
          success: false,
          error: result.reason?.message || "Unknown error"
        });
      }
    });

    return results;
  }
}

export const blottataPublisherService = new BlottataPublisherService();

