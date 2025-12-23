import { Logger } from "../utils/logger";
import type { Channel } from "../types/channel";
import { normalizeYoutubeTitle, MAX_YOUTUBE_TITLE_LENGTH } from "../utils/youtubeTitleNormalizer";

const OPENAI_API_URL = process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/**
 * Названия языков для промптов
 */
const LANGUAGE_NAMES: Record<Channel["language"], string> = {
  ru: "Russian",
  en: "English",
  kk: "Kazakh"
};

/**
 * Промпты для генерации title и description на разных языках
 */
const PROMPTS = {
  ru: {
    system: `Ты — эксперт по маркетингу и копирайтингу в соцсетях. На основе названия видеофайла создай КОРОТКОЕ цепляющее название к ролику которое ОБЯЗАТЕЛЬНО вмещается в лимит 55 символов. Название должно быть коротким (до 55 символов), чётким и понятным. Используй 1-3 хештега релевантные теме. Стиль эмоциональный живой разговорный. Используй эмодзи. Продвигаемый регион Казахстан Алматы. Верни ТОЛЬКО название без дополнительных пояснений. Максимум 55 символов. ВАЖНО: Весь текст должен быть ТОЛЬКО на русском языке.`,
    user: (fileName: string) => `Создай цепляющее название для видео: "${fileName}"`
  },
  en: {
    system: `You are an expert in social media marketing and copywriting. Based on the video file name, create a SHORT catchy title for the video that MUST fit within the 55 character limit. Title must be short (max 55 characters), catchy and clear. Use 1-3 relevant hashtags. Style: emotional, lively, conversational. Use emojis. Promoted region: Kazakhstan, Almaty. Return ONLY the title without additional explanations. Maximum 55 characters. IMPORTANT: All text must be ONLY in English.`,
    user: (fileName: string) => `Create a catchy title for the video: "${fileName}"`
  },
  kk: {
    system: `Сіз әлеуметтік желілер маркетингі мен копирайтинг бойынша мамансыз. Бейне файл атауына негізделіп, 55 таңба шегіне МӘЖБҮРЛІ сыйғатын қысқа тартымды тақырып жасаңыз. Атауы 55 таңбадан аспауы керек. Тақырыпқа сәйкес 1-3 хештег пайдаланыңыз. Стиль: эмоционалды, тірі, әңгімелесу. Эмодзи пайдаланыңыз. Жарнама аймағы: Қазақстан, Алматы. Тек тақырыпты ғана қайтарыңыз, қосымша түсіндірмелерсіз. Максимум 55 таңба. МАҢЫЗДЫ: Барлық мәтін ТЕК қазақ тілінде болуы керек.`,
    user: (fileName: string) => `Бейне үшін тартымды тақырып жасаңыз: "${fileName}"`
  }
};

/**
 * Fallback значения для разных языков
 */
const FALLBACK_TITLES: Record<Channel["language"], string> = {
  ru: "Новое видео",
  en: "New video",
  kk: "Жаңа бейне"
};

/**
 * Определяет язык канала или возвращает дефолтный
 */
function getChannelLanguage(channel?: Channel): Channel["language"] {
  if (!channel || !channel.language) {
    Logger.warn("youtubeTitleDescriptionGenerator: Channel language not set, using default 'ru'");
    return "ru";
  }

  const lang = channel.language;
  if (lang !== "ru" && lang !== "en" && lang !== "kk") {
    Logger.warn("youtubeTitleDescriptionGenerator: Unknown language, using default 'ru'", {
      language: lang
    });
    return "ru";
  }

  return lang;
}

/**
 * Генерирует title и description для YouTube ролика на основе языка канала
 * 
 * Язык определяется из channel.language ("ru" | "en" | "kk"):
 * - ru → промпт и результат на русском
 * - en → промпт и результат на английском
 * - kk → промпт и результат на казахском
 * 
 * Если язык не указан или неизвестен, используется дефолтный "ru" с предупреждением в логах.
 * 
 * @param fileName - Название видеофайла
 * @param channel - Канал с настройками (обязательно должно быть поле language)
 * @returns Объект с title (до 55 символов для безопасной публикации) и description (до 70 символов)
 */
export async function generateYoutubeTitleAndDescription(
  fileName: string,
  channel?: Channel
): Promise<{ title: string; description: string }> {
  const lang = getChannelLanguage(channel);
  const languageName = LANGUAGE_NAMES[lang];
  const prompt = PROMPTS[lang];

  try {
    Logger.info("youtubeTitleDescriptionGenerator: Generating title and description", {
      fileName,
      language: lang,
      languageName,
      channelId: channel?.id
    });

    const requestBody = {
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: prompt.system
        },
        {
          role: "user",
          content: prompt.user(fileName)
        }
      ],
      temperature: 0.7,
      max_tokens: 150
    };

    // Используем прокси OpenAI API если настроен
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${response.status} ${errorData?.error?.message || response.statusText}`
      );
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content?.trim();

    if (!generatedText) {
      throw new Error("OpenAI returned empty response");
    }

    // Обрезаем до 70 символов если превышает (для description)
    const description = generatedText.length > 70 
      ? generatedText.substring(0, 67) + "..."
      : generatedText;

    // Нормализуем title: обрезаем до 55 символов для безопасной публикации на YouTube
    const title = normalizeYoutubeTitle(generatedText);

    Logger.info("youtubeTitleDescriptionGenerator: Title and description generated", {
      fileName,
      language: lang,
      titleLength: title.length,
      descriptionLength: description.length
    });

    return { title, description };
  } catch (error: any) {
    Logger.error("youtubeTitleDescriptionGenerator: Failed to generate title and description", {
      fileName,
      language: lang,
      error: error?.message || String(error)
    });

    // Fallback: используем имя файла без расширения
    const fallbackText = fileName
      .replace(/\.[^/.]+$/, "") // убираем расширение
      .replace(/[_-]/g, " ") // заменяем подчеркивания и дефисы на пробелы
      .substring(0, 70);

    const fallbackTitleRaw = fallbackText || FALLBACK_TITLES[lang];
    const fallbackDescription = fallbackText || FALLBACK_TITLES[lang];

    // Нормализуем fallback title тоже
    const fallbackTitle = normalizeYoutubeTitle(fallbackTitleRaw);

    return {
      title: fallbackTitle,
      description: fallbackDescription
    };
  }
}

/**
 * Генерирует только description (для обратной совместимости)
 * @deprecated Используйте generateYoutubeTitleAndDescription
 */
export async function generateVideoDescription(
  fileName: string,
  channel?: Channel
): Promise<string> {
  const { description } = await generateYoutubeTitleAndDescription(fileName, channel);
  return description;
}

