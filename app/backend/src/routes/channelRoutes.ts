import { Router } from "express";
import { randomUUID } from "crypto";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";
import { authRequired } from "../middleware/auth";
import { runVideoGenerationForChannel } from "../services/videoGenerationService";
import { channelDeletionService } from "../services/channelDeletionService";
import type { Channel } from "../types/channel";

const router = Router();

// Типы для расписания
interface ChannelAutoSendSchedule {
  id: string;
  enabled: boolean;
  daysOfWeek: number[];
  time: string; // "HH:MM"
  promptsPerRun: number;
  lastRunAt?: string | null;
}

interface ChannelScheduleItem {
  id: string;
  index: number;
  name: string;
  times: string[];
  platform: string;
  isAutomationEnabled: boolean;
}

/**
 * PATCH /api/channels/reorder
 * Обновляет порядок каналов пользователя
 * Body: { orderedIds: string[] }
 */
router.patch("/reorder", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({
        error: "Invalid request",
        message: "orderedIds должен быть непустым массивом"
      });
    }

    // Проверяем, что все каналы принадлежат пользователю
    const channelsRef = db.collection("users").doc(userId).collection("channels");
    const channelsSnapshot = await channelsRef.get();
    const userChannelIds = channelsSnapshot.docs.map((doc) => doc.id);
    
    const invalidIds = orderedIds.filter((id) => !userChannelIds.includes(id));
    if (invalidIds.length > 0) {
      return res.status(403).json({
        error: "Forbidden",
        message: `Каналы ${invalidIds.join(", ")} не принадлежат пользователю`
      });
    }

    // Обновляем orderIndex для каждого канала
    const batch = db.batch();
    orderedIds.forEach((channelId, index) => {
      const channelRef = channelsRef.doc(channelId);
      batch.update(channelRef, { orderIndex: index });
    });

    await batch.commit();

    Logger.info("Channels reordered", {
      userId,
      channelCount: orderedIds.length
    });

    res.json({
      success: true,
      message: "Порядок каналов обновлён"
    });
  } catch (error: any) {
    Logger.error("Failed to reorder channels", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при обновлении порядка каналов"
    });
  }
});

/**
 * GET /api/channels/schedule
 * Возвращает список всех каналов пользователя с их расписанием
 */
/**
 * POST /api/channels/suggest-niche
 * Генерирует нишу для канала через OpenAI на основе контекста мастера
 */
router.post("/suggest-niche", authRequired, async (req, res) => {
  try {
    const { channelName, language, targetAudience, tone, platform } = req.body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_NOT_CONFIGURED",
        message: "OpenAI API ключ не настроен на сервере"
      });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Формируем промпт для генерации ниши
    let contextPrompt = "Предложи одну краткую нишу/тематику канала (2–6 слов) на том же языке, что и название канала.\n\n";
    
    if (channelName) {
      contextPrompt += `Название канала: ${channelName}\n`;
    }
    if (language) {
      contextPrompt += `Язык: ${language}\n`;
    }
    if (targetAudience) {
      contextPrompt += `Целевая аудитория: ${targetAudience}\n`;
    }
    if (tone) {
      contextPrompt += `Тон: ${tone}\n`;
    }
    if (platform) {
      contextPrompt += `Платформа: ${platform}\n`;
    }

    contextPrompt += "\nПримеры формата ответа: Юмор и жизненные скетчи, Кулинария для занятых, Технологии и гаджеты.\n";
    contextPrompt += "Верни только нишу, без пояснений, без пунктов списка, без кавычек.";

    const systemPrompt = `Ты — помощник по запуску контент-каналов. Твоя задача — предложить подходящую нишу для канала на основе предоставленных данных.`;

    const requestBody = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: contextPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 50
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `OpenAI API вернул ошибку: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("Пустой ответ от OpenAI API");
      }

      // Очищаем ответ от кавычек и лишних символов
      const niche = content.replace(/^["']|["']$/g, "").trim();

      Logger.info("suggest-niche success", {
        userId: req.user!.uid,
        tokensUsed: data.usage?.total_tokens
      });

      return res.json({
        success: true,
        niche
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({
          success: false,
          error: "TIMEOUT",
          message: "Превышено время ожидания ответа от OpenAI. Попробуйте ещё раз."
        });
      }

      Logger.error("suggest-niche error", error);

      if (error instanceof Error) {
        return res.status(500).json({
          success: false,
          error: "OPENAI_ERROR",
          message: error.message || "Ошибка при обращении к OpenAI"
        });
      }

      return res.status(500).json({
        success: false,
        error: "UNKNOWN_ERROR",
        message: "Неизвестная ошибка при генерации ниши"
      });
    }
  } catch (error: any) {
    Logger.error("suggest-niche endpoint error", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Внутренняя ошибка сервера"
    });
  }
});

/**
 * POST /api/channels/suggest-target-audience
 * Генерирует описание целевой аудитории для канала через OpenAI на основе контекста мастера
 */
router.post("/suggest-target-audience", authRequired, async (req, res) => {
  try {
    const { channelName, platform, language, niche, videoDuration, tone, additionalNotes } = req.body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_NOT_CONFIGURED",
        message: "OpenAI API ключ не настроен на сервере"
      });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Формируем промпт для генерации целевой аудитории
    let contextPrompt = "Ты — маркетолог и контент-стратег. Нужно кратко описать целевую аудиторию для нового канала.\n\n";
    contextPrompt += "Данные канала:\n";
    
    if (channelName) {
      contextPrompt += `— Название: ${channelName}\n`;
    }
    if (platform) {
      contextPrompt += `— Платформа: ${platform}\n`;
    }
    if (language) {
      contextPrompt += `— Язык: ${language}\n`;
    }
    if (niche) {
      contextPrompt += `— Ниша/тематика: ${niche}\n`;
    }
    if (tone) {
      contextPrompt += `— Тон: ${tone}\n`;
    }
    if (videoDuration) {
      contextPrompt += `— Длительность видео: ${videoDuration} сек\n`;
    }
    if (additionalNotes) {
      contextPrompt += `— Доп. сведения: ${additionalNotes}\n`;
    }

    contextPrompt += "\nСформулируй одну краткую, но понятную фразу описания ЦА в формате:\n";
    contextPrompt += "«Кто? (возраст/статус) + что любит/ищет».\n\n";
    contextPrompt += "Примеры:\n";
    contextPrompt += "— «Молодёжь 18–25 лет, которая любит короткие юмористические видео»\n";
    contextPrompt += "— «Занятые родители 25–40 лет, ищущие простые и быстрые рецепты»\n\n";
    contextPrompt += `Ответь одной фразой на ${language || "русском"} языке, без пояснений и списка, без кавычек.`;

    const systemPrompt = `Ты — маркетолог и контент-стратег. Твоя задача — предложить точное описание целевой аудитории для канала на основе предоставленных данных.`;

    const requestBody = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: contextPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 100
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `OpenAI API вернул ошибку: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("Пустой ответ от OpenAI API");
      }

      // Очищаем ответ от кавычек и лишних символов
      const targetAudience = content.replace(/^["']|["']$/g, "").trim();

      Logger.info("suggest-target-audience success", {
        userId: req.user!.uid,
        tokensUsed: data.usage?.total_tokens
      });

      return res.json({
        success: true,
        targetAudience
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({
          success: false,
          error: "TIMEOUT",
          message: "Превышено время ожидания ответа от OpenAI. Попробуйте ещё раз."
        });
      }

      Logger.error("suggest-target-audience error", error);

      if (error instanceof Error) {
        return res.status(500).json({
          success: false,
          error: "OPENAI_ERROR",
          message: error.message || "Ошибка при обращении к OpenAI"
        });
      }

      return res.status(500).json({
        success: false,
        error: "UNKNOWN_ERROR",
        message: "Неизвестная ошибка при генерации целевой аудитории"
      });
    }
  } catch (error: any) {
    Logger.error("suggest-target-audience endpoint error", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Внутренняя ошибка сервера"
    });
  }
});

/**
 * POST /api/channels/suggest-forbidden-topics
 * Генерирует список запрещённых тем для канала через OpenAI на основе контекста мастера
 */
router.post("/suggest-forbidden-topics", authRequired, async (req, res) => {
  try {
    const { channelName, platform, language, niche, targetAudience, tone, additionalNotes } = req.body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_NOT_CONFIGURED",
        message: "OpenAI API ключ не настроен на сервере"
      });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Формируем промпт для генерации запрещённых тем
    let contextPrompt = "Ты — редактор по контент-безопасности. Мы создаём канал с такими параметрами:\n\n";
    
    if (channelName) {
      contextPrompt += `— Название: ${channelName}\n`;
    }
    if (platform) {
      contextPrompt += `— Платформа: ${platform}\n`;
    }
    if (language) {
      contextPrompt += `— Язык: ${language}\n`;
    }
    if (niche) {
      contextPrompt += `— Ниша: ${niche}\n`;
    }
    if (targetAudience) {
      contextPrompt += `— Целевая аудитория: ${targetAudience}\n`;
    }
    if (tone) {
      contextPrompt += `— Тон: ${tone}\n`;
    }
    if (additionalNotes) {
      contextPrompt += `— Доп. сведения: ${additionalNotes}\n`;
    }

    contextPrompt += "\nНужно предложить список тем, которые лучше запретить для этого канала, ";
    contextPrompt += "чтобы не нарушать правила платформ и не разочаровать аудиторию.\n\n";
    contextPrompt += `Дай ответ одной строкой или несколькими через запятую на ${language || "русском"} языке.\n`;
    contextPrompt += "Формат: Политика, Насилие, Нецензурная лексика, ...\n";
    contextPrompt += "Не добавляй пояснений, только перечисление тем.";

    const systemPrompt = `Ты — редактор по контент-безопасности. Твоя задача — предложить список запрещённых тем для канала на основе его параметров, чтобы обеспечить безопасность контента и соответствие правилам платформ.`;

    const requestBody = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: contextPrompt
        }
      ],
      temperature: 0.5,
      max_tokens: 150
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `OpenAI API вернул ошибку: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("Пустой ответ от OpenAI API");
      }

      // Очищаем ответ от кавычек и лишних символов
      const forbiddenTopics = content.replace(/^["']|["']$/g, "").trim();

      Logger.info("suggest-forbidden-topics success", {
        userId: req.user!.uid,
        tokensUsed: data.usage?.total_tokens
      });

      return res.json({
        success: true,
        forbiddenTopics
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({
          success: false,
          error: "TIMEOUT",
          message: "Превышено время ожидания ответа от OpenAI. Попробуйте ещё раз."
        });
      }

      Logger.error("suggest-forbidden-topics error", error);

      if (error instanceof Error) {
        return res.status(500).json({
          success: false,
          error: "OPENAI_ERROR",
          message: error.message || "Ошибка при обращении к OpenAI"
        });
      }

      return res.status(500).json({
        success: false,
        error: "UNKNOWN_ERROR",
        message: "Неизвестная ошибка при генерации запрещённых тем"
      });
    }
  } catch (error: any) {
    Logger.error("suggest-forbidden-topics endpoint error", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Внутренняя ошибка сервера"
    });
  }
});

/**
 * POST /api/channels/suggest-additional-preferences
 * Генерирует дополнительные пожелания для канала через OpenAI на основе контекста мастера
 */
router.post("/suggest-additional-preferences", authRequired, async (req, res) => {
  try {
    const { 
      channelName, 
      platform, 
      language, 
      niche, 
      targetAudience, 
      tone, 
      forbiddenTopics, 
      generationMode, 
      videoDuration, 
      otherNotes 
    } = req.body;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: "OPENAI_NOT_CONFIGURED",
        message: "OpenAI API ключ не настроен на сервере"
      });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Формируем промпт для генерации дополнительных пожеланий
    let contextPrompt = "Ты — помощник по настройке контент-каналов. Нужно составить дополнительные пожелания для генерации сценариев/видео.\n\n";
    contextPrompt += "Данные канала:\n";
    
    if (channelName) {
      contextPrompt += `— Название: ${channelName}\n`;
    }
    if (platform) {
      contextPrompt += `— Платформа: ${platform}\n`;
    }
    if (language) {
      contextPrompt += `— Язык: ${language}\n`;
    }
    if (niche) {
      contextPrompt += `— Ниша: ${niche}\n`;
    }
    if (targetAudience) {
      contextPrompt += `— Целевая аудитория: ${targetAudience}\n`;
    }
    if (tone) {
      contextPrompt += `— Тон: ${tone}\n`;
    }
    if (forbiddenTopics) {
      contextPrompt += `— Запрещённые темы: ${forbiddenTopics}\n`;
    }
    if (generationMode) {
      contextPrompt += `— Режим генерации: ${generationMode}\n`;
    }
    if (videoDuration) {
      contextPrompt += `— Длительность видео: ${videoDuration} сек\n`;
    }
    if (otherNotes) {
      contextPrompt += `— Доп. заметки: ${otherNotes}\n`;
    }

    contextPrompt += "\nСформулируй 3–7 чётких пожеланий в одном текстовом блоке:\n";
    contextPrompt += "* стиль и подача (например: «простым языком», «бабушка рассказывает истории», «без сложных терминов»),\n";
    contextPrompt += "* частота шуток/реакций,\n";
    contextPrompt += "* темп видео,\n";
    contextPrompt += "* формат обращения к зрителям,\n";
    contextPrompt += "* любые особенности, подходящие для такой аудитории и ниши.\n\n";
    contextPrompt += `Пиши на ${language || "русском"} языке.\n`;
    contextPrompt += "Формат ответа: один текст, пункты можно разделить с новой строки или через маркеры «–».";

    const systemPrompt = `Ты — помощник по настройке контент-каналов. Твоя задача — предложить дополнительные пожелания для генерации сценариев и видео на основе параметров канала.`;

    const requestBody = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: contextPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `OpenAI API вернул ошибку: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("Пустой ответ от OpenAI API");
      }

      // Очищаем ответ от кавычек и лишних символов
      const additionalPreferences = content.replace(/^["']|["']$/g, "").trim();

      Logger.info("suggest-additional-preferences success", {
        userId: req.user!.uid,
        tokensUsed: data.usage?.total_tokens
      });

      return res.json({
        success: true,
        additionalPreferences
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return res.status(504).json({
          success: false,
          error: "TIMEOUT",
          message: "Превышено время ожидания ответа от OpenAI. Попробуйте ещё раз."
        });
      }

      Logger.error("suggest-additional-preferences error", error);

      if (error instanceof Error) {
        return res.status(500).json({
          success: false,
          error: "OPENAI_ERROR",
          message: error.message || "Ошибка при обращении к OpenAI"
        });
      }

      return res.status(500).json({
        success: false,
        error: "UNKNOWN_ERROR",
        message: "Неизвестная ошибка при генерации дополнительных пожеланий"
      });
    }
  } catch (error: any) {
    Logger.error("suggest-additional-preferences endpoint error", error);
    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Внутренняя ошибка сервера"
    });
  }
});

router.get("/schedule", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    
    // Получаем все каналы пользователя
    const channelsRef = db.collection("users").doc(userId).collection("channels");
    const channelsSnapshot = await channelsRef.get();
    
    const PLATFORM_NAMES: Record<string, string> = {
      YOUTUBE_SHORTS: "YouTube Shorts",
      TIKTOK: "TikTok",
      INSTAGRAM_REELS: "Instagram Reels",
      VK_CLIPS: "VK Клипы"
    };

    const scheduleItems: ChannelScheduleItem[] = channelsSnapshot.docs
      .map((doc, index) => {
        const channelData = doc.data() as any;
        const autoSendSchedules = (channelData.autoSendSchedules || []) as ChannelAutoSendSchedule[];
        
        // Извлекаем времена из включенных расписаний
        const times = autoSendSchedules
          .filter((schedule) => schedule.enabled && schedule.time)
          .map((schedule) => schedule.time)
          .sort(); // Сортируем по времени

        return {
          id: doc.id,
          index: index + 1,
          name: channelData.name || "Без названия",
          times: times,
          platform: PLATFORM_NAMES[channelData.platform] || channelData.platform || "Не указано",
          isAutomationEnabled: channelData.autoSendEnabled === true
        };
      })
      // Сортируем по orderIndex, если есть
      .sort((a, b) => {
        const aData = channelsSnapshot.docs.find((d) => d.id === a.id)?.data() as any;
        const bData = channelsSnapshot.docs.find((d) => d.id === b.id)?.data() as any;
        const aOrder = aData?.orderIndex ?? a.index;
        const bOrder = bData?.orderIndex ?? b.index;
        return aOrder - bOrder;
      })
      // Обновляем индексы после сортировки
      .map((item, index) => ({
        ...item,
        index: index + 1
      }));

    Logger.info("Channel schedule fetched", {
      userId,
      channelCount: scheduleItems.length
    });

    res.json(scheduleItems);
  } catch (error: any) {
    Logger.error("Failed to fetch channel schedule", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при получении расписания каналов"
    });
  }
});

/**
 * PATCH /api/channels/:id/schedule
 * Обновляет расписание канала (только времена)
 * Body: { times: string[] } - массив времён в формате "HH:MM"
 */
router.patch("/:id/schedule", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    const { times } = req.body;

    if (!Array.isArray(times)) {
      return res.status(400).json({
        error: "Invalid request",
        message: "times должен быть массивом"
      });
    }

    // Валидация и нормализация времён
    const MAX_SLOTS = 10;
    const validatedTimes: string[] = [];
    const seen = new Set<string>();

    for (const time of times) {
      if (typeof time !== "string" || !time.trim()) {
        continue; // Пропускаем пустые значения
      }

      // Проверка формата HH:MM
      if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({
          error: "Invalid time format",
          message: `Неверный формат времени: "${time}". Используйте формат HH:MM (например, "10:00")`
        });
      }

      const [hours, minutes] = time.split(":").map(Number);
      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return res.status(400).json({
          error: "Invalid time value",
          message: `Неверное значение времени: "${time}". Часы: 0-23, минуты: 0-59`
        });
      }

      // Удаляем дубликаты
      if (!seen.has(time)) {
        seen.add(time);
        validatedTimes.push(time);
      }
    }

    // Проверка лимита
    if (validatedTimes.length > MAX_SLOTS) {
      return res.status(400).json({
        error: "Too many time slots",
        message: `Максимальное количество слотов: ${MAX_SLOTS}`
      });
    }

    // Сортируем по возрастанию
    validatedTimes.sort();

    // Получаем канал
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelDoc = await channelRef.get();

    if (!channelDoc.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }

    const channelData = channelDoc.data() as any;
    const existingSchedules = (channelData.autoSendSchedules || []) as ChannelAutoSendSchedule[];

    // Обновляем расписания: обновляем времена в существующих включённых расписаниях
    // или создаём новые, если времён больше чем расписаний
    const updatedSchedules: ChannelAutoSendSchedule[] = [];
    
    // Сначала обновляем существующие включённые расписания
    const enabledSchedules = existingSchedules.filter(s => s.enabled);
    const disabledSchedules = existingSchedules.filter(s => !s.enabled);
    
    validatedTimes.forEach((time, index) => {
      if (index < enabledSchedules.length) {
        // Обновляем существующее расписание
        updatedSchedules.push({
          ...enabledSchedules[index],
          time: time
        });
      } else {
        // Создаём новое расписание
        updatedSchedules.push({
          id: randomUUID(),
          enabled: true,
          daysOfWeek: [1, 2, 3, 4, 5], // По умолчанию Пн-Пт
          time: time,
          promptsPerRun: 1
        });
      }
    });

    // Добавляем выключенные расписания обратно
    updatedSchedules.push(...disabledSchedules);

    // Обновляем канал
    await channelRef.update({
      autoSendSchedules: updatedSchedules,
      updatedAt: new Date()
    });

    Logger.info("Channel schedule updated", {
      userId,
      channelId,
      timesCount: validatedTimes.length
    });

    // Возвращаем обновлённое расписание в формате для таблицы
    const PLATFORM_NAMES: Record<string, string> = {
      YOUTUBE_SHORTS: "YouTube Shorts",
      TIKTOK: "TikTok",
      INSTAGRAM_REELS: "Instagram Reels",
      VK_CLIPS: "VK Клипы"
    };

    res.json({
      id: channelId,
      name: channelData.name || "Без названия",
      times: validatedTimes,
      platform: PLATFORM_NAMES[channelData.platform] || channelData.platform || "Не указано",
      isAutomationEnabled: channelData.autoSendEnabled === true
    });
  } catch (error: any) {
    Logger.error("Failed to update channel schedule", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при обновлении расписания канала"
    });
  }
});

/**
 * PATCH /api/channels/:id/automation
 * Обновляет статус автоматизации канала
 * Body: { autoSendEnabled: boolean }
 */
router.patch("/:id/automation", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    const { autoSendEnabled } = req.body;

    if (typeof autoSendEnabled !== "boolean") {
      return res.status(400).json({
        error: "Invalid request",
        message: "autoSendEnabled должен быть boolean"
      });
    }

    // Проверяем, что канал существует и принадлежит пользователю
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }

    // Обновляем только поле autoSendEnabled
    await channelRef.update({
      autoSendEnabled,
      updatedAt: new Date()
    });

    Logger.info("Channel automation updated", {
      userId,
      channelId,
      autoSendEnabled
    });

    res.json({
      success: true,
      autoSendEnabled,
      message: autoSendEnabled ? "Автоматизация включена" : "Автоматизация выключена"
    });
  } catch (error: any) {
    Logger.error("Failed to update channel automation", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при обновлении автоматизации канала"
    });
  }
});

/**
 * POST /api/channels/:id/run-custom-prompt
 * Запускает генерацию видео с кастомным промптом от пользователя
 * Body: { prompt: string, title?: string }
 */
router.post("/:id/run-custom-prompt", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    const { prompt, title } = req.body;

    // Валидация промпта
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({
        error: "Invalid request",
        message: "Промпт не может быть пустым"
      });
    }

    const MAX_PROMPT_LENGTH = 15000;
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        error: "Invalid request",
        message: `Промпт слишком длинный. Максимальная длина: ${MAX_PROMPT_LENGTH} символов`
      });
    }

    // Проверяем, что канал существует и принадлежит пользователю
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelSnap = await channelRef.get();

    if (!channelSnap.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }

    Logger.info("run-custom-prompt: starting video generation", {
      channelId,
      userId,
      promptLength: prompt.length,
      hasTitle: !!title
    });

    // Запускаем генерацию видео
    const result = await runVideoGenerationForChannel({
      channelId,
      userId,
      prompt: prompt.trim(),
      source: "custom_prompt",
      title: title?.trim() || undefined
    });

    if (!result.success) {
      Logger.error("run-custom-prompt: video generation failed", {
        channelId,
        userId,
        error: result.error
      });

      return res.status(500).json({
        error: "Video generation failed",
        message: result.error || "Ошибка при запуске генерации видео"
      });
    }

    Logger.info("run-custom-prompt: video generation started successfully", {
      channelId,
      userId,
      messageId: result.messageId,
      jobId: result.jobId
    });

    // Возвращаем информацию о запущенной задаче
    res.status(202).json({
      jobId: result.jobId || `custom_${channelId}_${Date.now()}`,
      status: "queued",
      messageId: result.messageId,
      chatId: result.chatId
    });
  } catch (error: any) {
    Logger.error("run-custom-prompt: unexpected error", {
      channelId: req.params.id,
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при запуске генерации видео"
    });
  }
});

/**
 * POST /api/channels/:id/test-blottata
 * Тестирует Blottata автоматизацию для канала
 * Body: { fileId?: string } - опциональный ID файла для тестирования
 */
router.post("/:id/test-blottata", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    const { fileId } = req.body;

    // Получаем канал
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelDoc = await channelRef.get();

    if (!channelDoc.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }

    const channelData = channelDoc.data() as any;
    const channel: Channel = {
      id: channelDoc.id,
      ...channelData,
      createdAt: channelData.createdAt || { seconds: 0, nanoseconds: 0 },
      updatedAt: channelData.updatedAt || { seconds: 0, nanoseconds: 0 }
    } as Channel;

    // Проверяем, включена ли Blottata
    if (!channel.blotataEnabled) {
      return res.status(400).json({
        error: "Blottata not enabled",
        message: "Blottata автоматизация не включена для этого канала"
      });
    }

    // Проверяем настройки
    if (!channel.driveInputFolderId) {
      return res.status(400).json({
        error: "Input folder not configured",
        message: "Не указана входная папка Google Drive"
      });
    }

    if (!channel.blotataApiKey && !process.env.BLOTATA_API_KEY) {
      return res.status(400).json({
        error: "API key not configured",
        message: "Не указан Blottata API ключ"
      });
    }

    const { processBlottataFile } = await import("../services/blottataFileProcessor");
    const { getNewFilesInFolder } = await import("../services/blottataDriveMonitor");
    const { getDriveClient } = await import("../services/googleDrive");

    let result;

    if (fileId) {
      // Тестируем конкретный файл
      Logger.info("test-blottata: Testing specific file", {
        channelId,
        fileId,
        userId
      });

      result = await processBlottataFile(channel, fileId);
    } else {
      // Тестируем первый файл из входной папки
      Logger.info("test-blottata: Testing first file from input folder", {
        channelId,
        folderId: channel.driveInputFolderId,
        userId
      });

      const files = await getNewFilesInFolder(channel.driveInputFolderId);

      if (files.length === 0) {
        return res.status(404).json({
          error: "No files found",
          message: "В входной папке нет файлов для тестирования"
        });
      }

      const testFile = files[0];
      result = await processBlottataFile(channel, testFile.id);
    }

    Logger.info("test-blottata: Test completed", {
      channelId,
      success: result.success,
      publishedPlatforms: result.publishedPlatforms,
      errors: result.errors
    });

    res.json({
      success: result.success,
      message: result.success
        ? `Файл успешно обработан. Опубликовано на: ${result.publishedPlatforms.join(", ")}`
        : "Обработка файла завершилась с ошибками",
      result: {
        fileId: result.fileId,
        fileName: result.fileName,
        publishedPlatforms: result.publishedPlatforms,
        errors: result.errors
      }
    });
  } catch (error: any) {
    Logger.error("test-blottata: Error", {
      channelId: req.params.id,
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при тестировании Blottata автоматизации"
    });
  }
});

/**
 * POST /api/channels/:id/test-youtube-title-description
 * Тестирует генерацию title и description для YouTube с учетом языка канала
 * Body: { fileName?: string } - опциональное имя файла для тестирования
 */
router.post("/:id/test-youtube-title-description", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    const { fileName = "test_video.mp4" } = req.body;

    // Получаем канал
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelDoc = await channelRef.get();

    if (!channelDoc.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }

    const channelData = channelDoc.data() as any;
    const channel: Channel = {
      id: channelDoc.id,
      ...channelData,
      createdAt: channelData.createdAt || { seconds: 0, nanoseconds: 0 },
      updatedAt: channelData.updatedAt || { seconds: 0, nanoseconds: 0 }
    } as Channel;

    const { generateYoutubeTitleAndDescription } = await import("../services/youtubeTitleDescriptionGenerator");

    Logger.info("test-youtube-title-description: Testing generation", {
      channelId,
      fileName,
      language: channel.language,
      userId
    });

    const result = await generateYoutubeTitleAndDescription(fileName, channel);

    // Импортируем нормализатор для проверки
    const { normalizeYoutubeTitle, MAX_YOUTUBE_TITLE_LENGTH } = await import("../utils/youtubeTitleNormalizer");
    const normalizedTitle = normalizeYoutubeTitle(result.title);

    Logger.info("test-youtube-title-description: Test completed", {
      channelId,
      language: channel.language,
      originalTitleLength: result.title.length,
      normalizedTitleLength: normalizedTitle.length,
      descriptionLength: result.description.length,
      isWithinLimit: normalizedTitle.length <= MAX_YOUTUBE_TITLE_LENGTH
    });

    res.json({
      success: true,
      channel: {
        id: channel.id,
        name: channel.name,
        language: channel.language
      },
      input: {
        fileName
      },
      result: {
        title: normalizedTitle,
        description: result.description,
        titleLength: normalizedTitle.length,
        descriptionLength: result.description.length,
        maxTitleLength: MAX_YOUTUBE_TITLE_LENGTH,
        isTitleWithinLimit: normalizedTitle.length <= MAX_YOUTUBE_TITLE_LENGTH
      }
    });
  } catch (error: any) {
    Logger.error("test-youtube-title-description: Error", {
      channelId: req.params.id,
      userId: req.user!.uid,
      error: error?.message || String(error),
      errorStack: error?.stack
    });

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при тестировании генерации title и description"
    });
  }
});

/**
 * GET /api/channels/export
 * Экспортирует все каналы пользователя в JSON-файл
 */
router.get("/export", authRequired, async (req, res) => {
  Logger.info("Channels export: request received", {
    userId: req.user?.uid,
    timestamp: new Date().toISOString()
  });

  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    
    // Получаем все каналы пользователя
    const channelsRef = db.collection("users").doc(userId).collection("channels");
    const channelsSnapshot = await channelsRef.get();
    
    // Трансформируем каналы в формат экспорта, исключая чувствительные данные
    const exportedChannels = channelsSnapshot.docs.map((doc) => {
      const data = doc.data() as any;
      return transformChannelForExport(data);
    });
    
    // Формируем финальный объект экспорта
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      channels: exportedChannels
    };
    
    // Формируем имя файла с датой
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `shorts-channels-${dateStr}.json`;
    
    Logger.info("Channels exported", {
      userId,
      channelCount: exportedChannels.length
    });
    
    // Устанавливаем заголовки для скачивания файла
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (error: any) {
    Logger.error("Failed to export channels", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при экспорте каналов"
    });
  }
});

/**
 * Вспомогательная функция для преобразования данных канала в формат экспорта
 */
function transformChannelForExport(data: any): any {
  return {
    name: data.name,
    platform: data.platform,
    language: data.language,
    targetDurationSec: data.targetDurationSec,
    niche: data.niche || "",
    audience: data.audience || "",
    tone: data.tone || "",
    blockedTopics: data.blockedTopics || "",
    generationMode: data.generationMode || "script",
    generationTransport: data.generationTransport || "telegram_global",
    telegramSyntaxPeer: data.telegramSyntaxPeer || null,
    preferences: data.preferences || null,
    extraNotes: data.extraNotes || null,
    timezone: data.timezone || null,
    autoSendEnabled: data.autoSendEnabled || false,
    autoSendSchedules: data.autoSendSchedules || [],
    autoDownloadToDriveEnabled: data.autoDownloadToDriveEnabled || false,
    autoDownloadDelayMinutes: data.autoDownloadDelayMinutes || 10,
    uploadNotificationEnabled: data.uploadNotificationEnabled || false,
    uploadNotificationChatId: data.uploadNotificationChatId || null,
    blotataEnabled: data.blotataEnabled || false,
    driveInputFolderId: data.driveInputFolderId || null,
    driveArchiveFolderId: data.driveArchiveFolderId || null,
    blotataYoutubeId: data.blotataYoutubeId || null,
    blotataTiktokId: data.blotataTiktokId || null,
    blotataInstagramId: data.blotataInstagramId || null,
    blotataFacebookId: data.blotataFacebookId || null,
    blotataFacebookPageId: data.blotataFacebookPageId || null,
    blotataThreadsId: data.blotataThreadsId || null,
    blotataTwitterId: data.blotataTwitterId || null,
    blotataLinkedinId: data.blotataLinkedinId || null,
    blotataPinterestId: data.blotataPinterestId || null,
    blotataPinterestBoardId: data.blotataPinterestBoardId || null,
    blotataBlueskyId: data.blotataBlueskyId || null,
    youtubeUrl: data.youtubeUrl || null,
    tiktokUrl: data.tiktokUrl || null,
    instagramUrl: data.instagramUrl || null,
    // googleDriveFolderId больше не используется (переход на локальное хранилище)
    // googleDriveFolderId: data.googleDriveFolderId || null
  };
}

/**
 * GET /api/channels/:id/export
 * Экспортирует один конкретный канал в JSON-файл
 */
router.get("/:id/export", authRequired, async (req, res) => {
  Logger.info("Channel export: request received", {
    userId: req.user?.uid,
    channelId: req.params.id,
    timestamp: new Date().toISOString()
  });

  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;
    
    // Получаем канал пользователя
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelDoc = await channelRef.get();
    
    if (!channelDoc.exists) {
      return res.status(404).json({
        error: "Channel not found",
        message: "Канал не найден"
      });
    }
    
    const data = channelDoc.data() as any;
    
    // Преобразуем канал в формат экспорта
    const exportedChannel = transformChannelForExport(data);
    
    // Формируем финальный объект экспорта (совместимый с форматом массового экспорта)
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      channels: [exportedChannel]
    };
    
    // Формируем имя файла: channel_<channelId>_<name>_shortsai.json
    const channelName = (data.name || "channel")
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `channel_${channelId}_${channelName}_shortsai.json`;
    
    Logger.info("Channel exported", {
      userId,
      channelId,
      channelName: data.name
    });
    
    // Устанавливаем заголовки для скачивания файла
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(exportData);
  } catch (error: any) {
    Logger.error("Failed to export channel", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при экспорте канала"
    });
  }
});

/**
 * POST /api/channels/import
 * Импортирует каналы из JSON-файла
 * Body: { version: number, exportedAt: string, channels: Array }
 */
router.post("/import", authRequired, async (req, res) => {
  Logger.info("Channels import: request received", {
    userId: req.user?.uid,
    contentLength: req.headers["content-length"],
    timestamp: new Date().toISOString()
  });

  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { version, channels } = req.body;
    
    // Проверяем размер тела запроса
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (contentLength > maxSize) {
      Logger.warn("Channels import: payload too large", {
        userId,
        contentLength,
        maxSize
      });
      return res.status(413).json({
        error: "Payload too large",
        message: `Размер файла превышает лимит (${(contentLength / (1024 * 1024)).toFixed(2)} MB). Максимальный размер: 10 MB`
      });
    }
    
    // Валидация формата
    if (version !== 1) {
      return res.status(400).json({
        error: "Invalid version",
        message: `Неподдерживаемая версия формата: ${version}. Поддерживается только версия 1.`
      });
    }
    
    if (!Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({
        error: "Invalid format",
        message: "Файл не содержит каналов для импорта"
      });
    }
    
    // Получаем существующие каналы пользователя для проверки конфликтов имён
    const channelsRef = db.collection("users").doc(userId).collection("channels");
    const existingChannelsSnapshot = await channelsRef.get();
    const existingChannelNames = new Set(
      existingChannelsSnapshot.docs.map((doc) => doc.data().name)
    );
    
    // Получаем максимальный orderIndex для новых каналов
    let maxOrderIndex = -1;
    existingChannelsSnapshot.docs.forEach((doc) => {
      const orderIndex = doc.data().orderIndex ?? 0;
      maxOrderIndex = Math.max(maxOrderIndex, orderIndex);
    });
    
    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ channelName: string; error: string }> = [];
    
    // Обрабатываем каждый канал
    for (const channelData of channels) {
      try {
        // Валидация обязательных полей
        if (!channelData.name || typeof channelData.name !== "string") {
          errors.push({
            channelName: channelData.name || "Без названия",
            error: "Отсутствует или некорректное имя канала"
          });
          continue;
        }
        
        if (!channelData.platform || !channelData.language || !channelData.targetDurationSec) {
          errors.push({
            channelName: channelData.name,
            error: "Отсутствуют обязательные поля: platform, language или targetDurationSec"
          });
          continue;
        }
        
        // Проверяем конфликт имён и добавляем суффикс при необходимости
        let finalName = channelData.name;
        if (existingChannelNames.has(finalName)) {
          let counter = 1;
          let candidateName = `${finalName} (imported)`;
          while (existingChannelNames.has(candidateName)) {
            counter++;
            candidateName = `${finalName} (imported ${counter})`;
          }
          finalName = candidateName;
        }
        
        // Добавляем имя в множество существующих для следующей итерации
        existingChannelNames.add(finalName);
        
        // Формируем данные для создания канала
        const newChannelData: any = {
          name: finalName,
          platform: channelData.platform,
          language: channelData.language,
          targetDurationSec: channelData.targetDurationSec,
          niche: channelData.niche || "",
          audience: channelData.audience || "",
          tone: channelData.tone || "",
          blockedTopics: channelData.blockedTopics || "",
          generationMode: channelData.generationMode || "script",
          generationTransport: channelData.generationTransport || "telegram_global",
          telegramSyntaxPeer: channelData.telegramSyntaxPeer || null,
          autoSendEnabled: channelData.autoSendEnabled || false,
          autoSendSchedules: channelData.autoSendSchedules || [],
          autoDownloadToDriveEnabled: channelData.autoDownloadToDriveEnabled || false,
          autoDownloadDelayMinutes: channelData.autoDownloadDelayMinutes || 10,
          uploadNotificationEnabled: channelData.uploadNotificationEnabled || false,
          uploadNotificationChatId: channelData.uploadNotificationChatId || null,
          blotataEnabled: channelData.blotataEnabled || false,
          driveInputFolderId: channelData.driveInputFolderId || null,
          driveArchiveFolderId: channelData.driveArchiveFolderId || null,
          blotataYoutubeId: channelData.blotataYoutubeId || null,
          blotataTiktokId: channelData.blotataTiktokId || null,
          blotataInstagramId: channelData.blotataInstagramId || null,
          blotataFacebookId: channelData.blotataFacebookId || null,
          blotataFacebookPageId: channelData.blotataFacebookPageId || null,
          blotataThreadsId: channelData.blotataThreadsId || null,
          blotataTwitterId: channelData.blotataTwitterId || null,
          blotataLinkedinId: channelData.blotataLinkedinId || null,
          blotataPinterestId: channelData.blotataPinterestId || null,
          blotataPinterestBoardId: channelData.blotataPinterestBoardId || null,
          blotataBlueskyId: channelData.blotataBlueskyId || null,
          youtubeUrl: channelData.youtubeUrl || null,
          tiktokUrl: channelData.tiktokUrl || null,
          instagramUrl: channelData.instagramUrl || null,
          // googleDriveFolderId больше не используется (переход на локальное хранилище)
          // googleDriveFolderId: channelData.googleDriveFolderId || null,
          orderIndex: ++maxOrderIndex,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Добавляем опциональные поля только если они есть
        if (channelData.preferences) {
          newChannelData.preferences = channelData.preferences;
        }
        if (channelData.extraNotes) {
          newChannelData.extraNotes = channelData.extraNotes;
        }
        if (channelData.timezone) {
          newChannelData.timezone = channelData.timezone;
        }
        
        // Создаём канал в Firestore
        await channelsRef.add(newChannelData);
        
        imported.push(finalName);
        
        Logger.info("Channel imported", {
          userId,
          originalName: channelData.name,
          finalName,
          wasRenamed: finalName !== channelData.name
        });
      } catch (error: any) {
        Logger.error("Failed to import channel", {
          userId,
          channelName: channelData.name,
          error: error?.message || String(error)
        });
        
        errors.push({
          channelName: channelData.name || "Без названия",
          error: error?.message || "Неизвестная ошибка при импорте"
        });
      }
    }
    
    Logger.info("Channels import completed", {
      userId,
      imported: imported.length,
      skipped: skipped.length,
      errors: errors.length
    });
    
    res.json({
      success: true,
      imported: imported.length,
      skipped: skipped.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error: any) {
    Logger.error("Failed to import channels", error);
    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при импорте каналов"
    });
  }
});

/**
 * POST /api/wizard/generate-drive-folders
 * Создаёт структуру папок для канала на backend-сервере
 * Body: { channelName: string, channelUuid?: string }
 * TODO: Переписать для работы с локальным хранилищем вместо Google Drive
 */
router.post("/wizard/generate-drive-folders", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      success: false,
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { channelName, channelUuid } = req.body as {
      channelName?: string;
      channelUuid?: string;
    };

    Logger.info("POST /api/channels/wizard/generate-drive-folders: start", {
      userId,
      channelName,
      channelUuid
    });

    if (!channelName || typeof channelName !== "string" || channelName.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "INVALID_CHANNEL_NAME",
        message: "Название канала обязательно"
      });
    }

    // TODO: Создаём папки на backend-сервере вместо Google Drive
    // Пока что возвращаем заглушку с локальными ID
    const rootFolderId = `local_${userId}_${channelUuid || Date.now()}_root`;
    const archiveFolderId = `local_${userId}_${channelUuid || Date.now()}_archive`;
    
    const folders = {
      rootFolderId,
      archiveFolderId,
      rootFolderName: `${channelName.trim()} — канал`,
      archiveFolderName: "uploaded"
    };

    Logger.info("Channel folders generated for wizard", {
      userId,
      channelName,
      rootFolderId: folders.rootFolderId,
      archiveFolderId: folders.archiveFolderId
    });

    res.json({
      success: true,
      rootFolderId: folders.rootFolderId,
      archiveFolderId: folders.archiveFolderId,
      rootFolderName: folders.rootFolderName,
      archiveFolderName: folders.archiveFolderName
    });
  } catch (error: any) {
    Logger.error("Error in /api/channels/wizard/generate-drive-folders", {
      error: error?.message || String(error),
      errorCode: error?.code,
      userId: req.user?.uid,
      stack: error?.stack
    });

    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Не удалось создать папки для канала"
    });
  }
});

/**
 * POST /api/channels/:id/generate-drive-folders
 * Создаёт структуру папок для канала на backend-сервере
 * TODO: Переписать для работы с локальным хранилищем вместо Google Drive
 */
router.post("/:id/generate-drive-folders", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      success: false,
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const channelId = req.params.id;

    Logger.info("POST /api/channels/:id/generate-drive-folders: start", {
      userId,
      channelId
    });

    // Проверяем, что канал существует и принадлежит пользователю
    const channelRef = db.collection("users").doc(userId).collection("channels").doc(channelId);
    const channelDoc = await channelRef.get();

    if (!channelDoc.exists) {
      Logger.warn("Channel not found", { userId, channelId });
      return res.status(404).json({
        success: false,
        error: "CHANNEL_NOT_FOUND",
        message: "Канал не найден"
      });
    }

    const channelData = channelDoc.data() as Channel;

    // TODO: Создаём папки на backend-сервере вместо Google Drive
    // Пока что возвращаем заглушку с локальными ID
    const rootFolderId = `local_${userId}_${channelId}_root`;
    const archiveFolderId = `local_${userId}_${channelId}_archive`;
    
    const folders = {
      rootFolderId,
      archiveFolderId,
      rootFolderName: `${channelData.name} — канал`,
      archiveFolderName: "uploaded"
    };

    // Обновляем канал с новыми folder ID (без googleDriveFolderId)
    await channelRef.update({
      driveInputFolderId: folders.rootFolderId,
      driveArchiveFolderId: folders.archiveFolderId,
      updatedAt: new Date()
    });

    Logger.info("Channel folders generated and channel updated", {
      userId,
      channelId,
      rootFolderId: folders.rootFolderId,
      archiveFolderId: folders.archiveFolderId
    });

    res.json({
      success: true,
      rootFolderId: folders.rootFolderId,
      archiveFolderId: folders.archiveFolderId,
      rootFolderName: folders.rootFolderName,
      archiveFolderName: folders.archiveFolderName
    });
  } catch (error: any) {
    Logger.error("Error in /api/channels/:id/generate-drive-folders", {
      error: error?.message || String(error),
      errorCode: error?.code,
      userId: req.user?.uid,
      channelId: req.params.id,
      stack: error?.stack
    });

    // Обработка специфичных ошибок
    if (error?.message?.includes("GOOGLE_DRIVE_NOT_CONNECTED")) {
      return res.status(400).json({
        success: false,
        error: "GOOGLE_DRIVE_NOT_CONNECTED",
        message: "Сначала подключите Google Drive в настройках аккаунта"
      });
    }

    if (error?.message?.includes("GOOGLE_DRIVE_SERVICE_ACCOUNT_NOT_CONFIGURED")) {
      return res.status(503).json({
        success: false,
        error: "SERVICE_ACCOUNT_NOT_CONFIGURED",
        message: "Сервисный аккаунт Google Drive не настроен"
      });
    }

    if (error?.message?.includes("GOOGLE_DRIVE_CREATE_FOLDER_FAILED")) {
      return res.status(500).json({
        success: false,
        error: "CREATE_FOLDER_FAILED",
        message: error.message.replace("GOOGLE_DRIVE_CREATE_FOLDER_FAILED: ", "")
      });
    }

    if (error?.message?.includes("GOOGLE_DRIVE_SHARE_FAILED")) {
      return res.status(500).json({
        success: false,
        error: "SHARE_FAILED",
        message: error.message.replace("GOOGLE_DRIVE_SHARE_FAILED: ", "")
      });
    }

    // Проверка на ошибки доступа Google Drive
    if (error?.code === 403 || error?.message?.includes("insufficient permissions")) {
      return res.status(403).json({
        success: false,
        error: "INSUFFICIENT_PERMISSIONS",
        message: "Ваш аккаунт Google не выдал необходимые разрешения. Переподключите Google Drive."
      });
    }

    return res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: error?.message || "Не удалось создать папки Google Drive"
    });
  }
});

/**
 * DELETE /api/channels/:channelId
 * Полностью удаляет канал и все связанные данные (Firestore + локальное хранилище)
 */
router.delete("/:channelId", authRequired, async (req, res) => {
  if (!isFirestoreAvailable() || !db) {
    return res.status(503).json({
      error: "Firestore is not available",
      message: "Firebase Admin не настроен"
    });
  }

  try {
    const userId = req.user!.uid;
    const { channelId } = req.params;

    if (!channelId) {
      return res.status(400).json({
        error: "Invalid request",
        message: "channelId обязателен"
      });
    }

    Logger.info("Channel deletion endpoint called", {
      userId,
      channelId
    });

    // Вызываем сервис каскадного удаления
    await channelDeletionService.deleteChannelCompletely(userId, channelId);

    Logger.info("Channel deletion completed successfully", {
      userId,
      channelId
    });

    res.json({
      success: true,
      message: "Канал и все связанные данные успешно удалены"
    });
  } catch (error: any) {
    Logger.error("Channel deletion failed", {
      userId: req.user!.uid,
      channelId: req.params.channelId,
      error: error?.message || String(error),
      stack: error?.stack
    });

    // Проверяем тип ошибки для правильного HTTP статуса
    if (error?.message?.includes("not found") || error?.message?.includes("not found")) {
      return res.status(404).json({
        error: "Not found",
        message: "Канал не найден"
      });
    }

    if (error?.message?.includes("Forbidden") || error?.message?.includes("не принадлежит")) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Канал не принадлежит текущему пользователю"
      });
    }

    res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Ошибка при удалении канала"
    });
  }
});

export default router;

