import { db, isFirestoreAvailable } from "./firebaseAdmin";
import { Logger } from "../utils/logger";
import { generateChannelPrompt } from "../utils/promptGenerator";
import type { Channel, ChannelPreferences } from "../types/channel";

const PLATFORM_NAMES: Record<Channel["platform"], string> = {
  YOUTUBE_SHORTS: "YouTube Shorts",
  TIKTOK: "TikTok",
  INSTAGRAM_REELS: "Instagram Reels",
  VK_CLIPS: "VK Клипы"
};

const LANGUAGE_NAMES: Record<Channel["language"], string> = {
  ru: "Русский",
  en: "English",
  kk: "Қазақша"
};

/**
 * Получает текущий вариант пожеланий согласно режиму
 */
function getCurrentPreferenceVariant(
  preferences: Channel["preferences"]
): string {
  if (!preferences || preferences.variants.length === 0) {
    return "";
  }

  const { variants, mode, lastUsedIndex = 0 } = preferences;

  switch (mode) {
    case "fixed":
      return variants[0]?.text || "";
    case "random":
      const randomIndex = Math.floor(Math.random() * variants.length);
      return variants[randomIndex]?.text || "";
    case "cyclic":
    default:
      const currentIndex = lastUsedIndex % variants.length;
      return variants[currentIndex]?.text || "";
  }
}

/**
 * Получает канал из Firestore
 */
async function getChannelFromFirestore(
  userId: string,
  channelId: string
): Promise<Channel | null> {
  if (!isFirestoreAvailable() || !db) {
    throw new Error("Firestore is not available");
  }

  const channelRef = db
    .collection("users")
    .doc(userId)
    .collection("channels")
    .doc(channelId);

  const channelSnap = await channelRef.get();

  if (!channelSnap.exists) {
    return null;
  }

  const data = channelSnap.data() as any;
  return {
    id: channelSnap.id,
    ...data
  } as Channel;
}

/**
 * Строит промпт для автогенерации идеи и сценариев
 * Полностью персонализированный промпт на основе настроек канала
 */
function buildAutoGeneratePrompt(channel: Channel): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];

  // Получаем вариант пожеланий
  const preferenceText = channel.preferences 
    ? getCurrentPreferenceVariant(channel.preferences)
    : channel.extraNotes;

  // Формируем детальный контекст канала с акцентом на уникальность
  const contextParts: string[] = [];
  
  // 1. НАЗВАНИЕ КАНАЛА - критически важно
  if (channel.name && channel.name.trim()) {
    contextParts.push(`**НАЗВАНИЕ КАНАЛА:** "${channel.name}"`);
    contextParts.push(`⚠️ КРИТИЧЕСКИ ВАЖНО: Идея должна быть УНИКАЛЬНОЙ для канала "${channel.name}".`);
    contextParts.push(`Название канала - это ключевой индикатор тематики. Если канал называется "Бабушка и Дедушка" → идея должна быть в их стиле. Если "Мемы про котиков" → идея про котиков. Если "Стройка" → идея про стройку.`);
    contextParts.push(`НЕ используй универсальные шаблоны, которые подходят для любого канала.`);
  }
  
  // 2. ТЕМАТИКА/НИША - основа генерации
  if (channel.niche && channel.niche.trim()) {
    contextParts.push(`**ТЕМАТИКА/НИША:** "${channel.niche}"`);
    contextParts.push(`Идея ДОЛЖНА быть строго в рамках тематики "${channel.niche}".`);
    contextParts.push(`Примеры соответствия:`);
    contextParts.push(`- Если ниша "мемы" → идея должна быть мемной, вирусной, смешной`);
    contextParts.push(`- Если ниша "животные" → идея должна быть про животных, их поведение, забавные ситуации`);
    contextParts.push(`- Если ниша "строительство" → идея должна быть связана со стройкой, инструментами, ремонтом`);
    contextParts.push(`- Если ниша "кулинария" → идея должна быть про готовку, рецепты, еду`);
    contextParts.push(`НЕ генерируй идеи, которые не относятся к нише "${channel.niche}".`);
  }
  
  // 3. ЯЗЫК
  contextParts.push(`**ЯЗЫК:** ${languageName}`);
  contextParts.push(`Все реплики, текст и диалоги должны быть на языке: ${languageName}.`);
  
  // 4. ПЛАТФОРМА
  contextParts.push(`**ПЛАТФОРМА:** ${platformName}`);
  contextParts.push(`Формат контента должен соответствовать специфике ${platformName}.`);
  
  // 5. ДЛИТЕЛЬНОСТЬ
  contextParts.push(`**ДЛИТЕЛЬНОСТЬ:** ${channel.targetDurationSec} секунд`);
  contextParts.push(`Сценарий должен точно укладываться в ${channel.targetDurationSec} секунд.`);
  
  // 6. ЦЕЛЕВАЯ АУДИТОРИЯ
  if (channel.audience && channel.audience.trim()) {
    contextParts.push(`**ЦЕЛЕВАЯ АУДИТОРИЯ:** ${channel.audience}`);
    contextParts.push(`Идея должна быть интересна и понятна аудитории: ${channel.audience}.`);
  }
  
  // 7. ТОН/СТИЛЬ
  if (channel.tone && channel.tone.trim()) {
    contextParts.push(`**ТОН/СТИЛЬ:** "${channel.tone}"`);
    contextParts.push(`Весь контент должен быть в тоне "${channel.tone}".`);
    contextParts.push(`Примеры:`);
    contextParts.push(`- Если тон "Юмор" → идея должна быть смешной, с юмором, возможно абсурдной`);
    contextParts.push(`- Если тон "Серьёзно" → идея должна быть серьёзной, информативной, без шуток`);
    contextParts.push(`- Если тон "Детское" → идея должна быть детской, понятной детям, яркой`);
    contextParts.push(`- Если тон "Вдохновляющее" → идея должна вдохновлять, мотивировать`);
  }
  
  // 8. ЗАПРЕЩЁННЫЕ ТЕМЫ
  if (channel.blockedTopics && channel.blockedTopics.trim()) {
    contextParts.push(`**ЗАПРЕЩЁННЫЕ ТЕМЫ (НИКОГДА не используй):** ${channel.blockedTopics}`);
  }
  
  // 9. ДОПОЛНИТЕЛЬНЫЕ ПОЖЕЛАНИЯ (выбранная вариация)
  if (preferenceText && preferenceText.trim()) {
    contextParts.push(`**ДОПОЛНИТЕЛЬНЫЕ ТРЕБОВАНИЯ (ОБЯЗАТЕЛЬНО учитывай):**`);
    contextParts.push(preferenceText);
    contextParts.push(`Эти требования имеют ВЫСОКИЙ ПРИОРИТЕТ. Идея должна им строго соответствовать.`);
  }

  // Формируем финальный промпт
  const contextString = contextParts.join("\n\n");

  return `Ты — профессиональный сценарист, специализирующийся на создании уникальных идей для коротких вертикальных видео.

ТВОЯ ЗАДАЧА: создать УНИКАЛЬНУЮ идею ролика, которая:
- Строго соответствует настройкам ЭТОГО конкретного канала
- НЕ является универсальным шаблоном
- НЕ повторяет стандартные идеи
- Полностью соответствует тематике канала

${contextString}

**КРИТИЧЕСКИ ВАЖНЫЕ ТРЕБОВАНИЯ:**

1. **УНИКАЛЬНОСТЬ ДЛЯ КАНАЛА:** Идея должна быть уникальной для этого конкретного канала. Если канал про мемы → идея про мемы. Если про животных → идея про животных. Если канал называется "Бабушка и Дедушка" → идея должна быть в их стиле, с их персонажами. Если канал про строительство → идея должна быть связана со стройкой, инструментами, ремонтом.

2. **ТЕМАТИЧНОСТЬ:** Идея ОБЯЗАТЕЛЬНО должна быть связана с тематикой канала "${channel.niche}". НЕ используй общие шаблоны, которые не относятся к этой нише. НЕ генерируй универсальные идеи типа "что-то происходит на кухне", если канал не про кулинарию.

3. **СООТВЕТСТВИЕ НАСТРОЙКАМ:** Идея должна учитывать ВСЕ параметры канала: язык (${languageName}), тон (${channel.tone || "соответствующий каналу"}), аудиторию (${channel.audience || "общая"}), длительность (${channel.targetDurationSec} секунд), дополнительные требования.

4. **ЗАПРЕТ НА ШАБЛОНЫ:** ЗАПРЕЩЕНО использовать универсальные идеи, которые подходят для любого канала. Каждая идея должна быть персонализирована под этот конкретный канал.

5. **РАЗНООБРАЗИЕ:** При каждом запросе генерируй РАЗНУЮ идею. Не повторяй предыдущие идеи. Используй разные углы, разные ситуации, разные подходы в рамках тематики канала.

**ЗАДАЧА:**

1. Придумай ОДНУ яркую, уникальную идею ролика, которая:
   - Полностью соответствует тематике "${channel.niche}"
   - Учитывает все настройки канала выше
   - Является уникальной, а не шаблонной
   - Укладывается в ${channel.targetDurationSec} секунд
   - На языке: ${languageName}
   - В тоне: ${channel.tone || "соответствующем каналу"}
   ${channel.name ? `- Соответствует стилю канала "${channel.name}"` : ""}

2. Создай 1-3 детальных сценария для этой идеи.

Каждый сценарий должен содержать:
- Детальное описание действий по секундам (0-${channel.targetDurationSec} секунд)
- Реплики персонажей на языке ${languageName}
- Эмоции и реакции персонажей
- Визуальные детали и движения камеры
- Точную разбивку по времени

**ФОРМАТ ОТВЕТА (JSON):**

{
  "idea": "Уникальная идея ролика, строго соответствующая тематике канала "${channel.niche}" (1-2 предложения)",
  "scripts": [
    "Сценарий 1: [детальное описание с репликами, действиями, эмоциями, разбивкой по секундам 0-${channel.targetDurationSec}с]",
    "Сценарий 2: [детальное описание с репликами, действиями, эмоциями, разбивкой по секундам 0-${channel.targetDurationSec}с]",
    "Сценарий 3: [детальное описание с репликами, действиями, эмоциями, разбивкой по секундам 0-${channel.targetDurationSec}с] (опционально)"
  ]
}

**ВАЖНО:** Верни ТОЛЬКО валидный JSON, без дополнительных комментариев, без markdown-разметки, только чистый JSON.`;
}

/**
 * Парсит ответ от OpenAI для автогенерации
 */
function parseAutoGenerateResponse(responseText: string): {
  idea: string;
  scripts: string[];
} {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        idea: parsed.idea || "",
        scripts: Array.isArray(parsed.scripts) ? parsed.scripts : []
      };
    }
    throw new Error("JSON не найден в ответе");
  } catch (error) {
    Logger.error("Ошибка парсинга JSON:", error);
    // Fallback: пытаемся извлечь идею и сценарии из текста
    const ideaMatch = responseText.match(/иде[яи][:]\s*(.+?)(?:\n|$)/i);
    const scripts: string[] = [];
    
    const lines = responseText.split("\n").filter((line) => line.trim());
    let currentScript = "";
    let inScript = false;
    
    for (const line of lines) {
      if (line.match(/сценарий\s*\d+[:]/i)) {
        if (currentScript) {
          scripts.push(currentScript.trim());
        }
        currentScript = line + "\n";
        inScript = true;
      } else if (inScript) {
        currentScript += line + "\n";
      }
    }
    
    if (currentScript) {
      scripts.push(currentScript.trim());
    }
    
    return {
      idea: ideaMatch ? ideaMatch[1].trim() : "Идея не найдена",
      scripts: scripts.length > 0 ? scripts : [responseText]
    };
  }
}

/**
 * Генерирует промпт для канала через OpenAI API
 */
async function callOpenAIProxy(
  requestBody: Record<string, unknown>
): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API ключ не настроен на сервере");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

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

    const data = await response
      .json()
      .catch(() => ({ error: { message: "Не удалось распарсить ответ от OpenAI API" } }));

    if (!response.ok) {
      throw new Error(data.error?.message || `OpenAI API ошибка: ${response.status}`);
    }

    return data;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Превышено время ожидания ответа от OpenAI API");
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Неизвестная ошибка при обработке запроса");
  }
}

/**
 * Строит промпт для генерации VIDEO_PROMPT на основе идеи
 * Использует универсальный генератор промптов
 */
function buildVideoPromptGenerationPrompt(channel: Channel, idea: string): string {
  const { systemPrompt, userPrompt } = generateChannelPrompt(channel, "video-prompt-only", idea);
  
  // Для генерации VIDEO_PROMPT нужны дополнительные инструкции
  const lang = channel.language;
  const languageName = LANGUAGE_NAMES[channel.language];
  
  const additionalInstructions = {
    ru: `**Требования к VIDEO_PROMPT:**

1. Укажи длительность: "${channel.targetDurationSec}-секундное видео, вертикальный формат 9:16"
2. Стиль съёмки: выбери на основе тона "${channel.tone}"
3. Локация и сеттинг: укажи тип локации (кухня, улица, комната и т.д.), сезон/погоду если релевантно
4. Персонажи: опиши внешний вид главных персонажей
5. Движение камеры: выбери статичную камеру, лёгкое движение камеры от руки или плавный панорамный кадр на основе динамики сюжета
6. Действия по временным отрезкам: кратко опиши ключевые действия для каждого временного отрезка (0-2с, 2-4с и т.д.)
7. Реплики: укажи, что персонажи говорят на ${languageName} языке, включи ключевые реплики
8. Запреты: без текстовых наложений, без субтитров, без логотипов, без водяных знаков, без текста на экране

**Формат ответа:**

Верни ТОЛЬКО текст VIDEO_PROMPT, без дополнительных комментариев, без JSON, просто готовый промпт для Sora/Veo. ВСЁ должно быть на русском языке, включая все технические указания, описания и требования.`,
    en: `**VIDEO_PROMPT Requirements:**

1. Specify duration: "${channel.targetDurationSec}-second video, vertical 9:16 aspect ratio"
2. Shooting style: choose based on tone "${channel.tone}"
3. Location and setting: specify location type (kitchen, street, room, etc.), season/weather if relevant
4. Characters: describe the appearance of main characters
5. Camera movement: choose static camera, slight handheld movement or smooth pan based on story dynamics
6. Actions by time segments: briefly describe key actions for each time segment (0-2s, 2-4s, etc.)
7. Dialogue: specify that characters speak in ${languageName}, include key dialogue
8. Restrictions: no text overlays, no subtitles, no logos, no watermarks, no text on screen

**Response Format:**

Return ONLY the VIDEO_PROMPT text, without additional comments, without JSON, just a ready prompt for Sora/Veo. EVERYTHING must be in English, including all technical instructions, descriptions and requirements.`,
    kk: `**VIDEO_PROMPT талаптары:**

1. Ұзақтықты көрсет: "${channel.targetDurationSec} секундтық бейне, тік 9:16 формат"
2. Түсіру стилі: "${channel.tone}" тоны негізінде таңда
3. Орналасу және декорация: орналасу түрін көрсет (аспазхана, көше, бөлме және т.б.), мезгіл/ауа райын релевантты болса көрсет
4. Кейіпкерлер: негізгі кейіпкерлердің сыртқы түрін сипатта
5. Камера қозғалысы: сценарий динамикасы негізінде статикалық камера, қолдан ұстағандағы жеңіл қозғалыс немесе тегіс панорамалық кадрды таңда
6. Уақыт сегменттері бойынша әрекеттер: әр уақыт сегменті үшін негізгі әрекеттерді қысқаша сипатта (0-2с, 2-4с және т.б.)
7. Репликалар: кейіпкерлер ${languageName} тілінде сөйлейтінін көрсет, негізгі репликаларды қос
8. Тыйымдар: мәтін қабаттары жоқ, субтитрлер жоқ, логотиптер жоқ, су белгілері жоқ, экранда мәтін жоқ

**Жауап форматы:**

Тек VIDEO_PROMPT мәтінін қайтар, қосымша түсініктемелерсіз, JSON-сыз, тек Sora/Veo үшін дайын промпт. БАРЛЫҒЫ қазақ тілінде болуы керек, барлық техникалық нұсқаулар, сипаттамалар және талаптарды қоса алғанда.`
  };

  return `${systemPrompt}

${additionalInstructions[lang]}`;
}

/**
 * Генерирует VIDEO_PROMPT на основе идеи (для режима video-prompt-only)
 */
async function generateVideoPromptFromIdea(
  channel: Channel,
  idea: string
): Promise<string> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const videoPromptText = buildVideoPromptGenerationPrompt(channel, idea);

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: videoPromptText
      },
      {
        role: "user",
        content: idea
          ? `Создай VIDEO_PROMPT для идеи: "${idea}"`
          : "Создай VIDEO_PROMPT для этого канала."
      }
    ],
    temperature: 0.7,
    max_tokens: 1500
  };

  const data = await callOpenAIProxy(requestBody);
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Пустой ответ от OpenAI API при генерации VIDEO_PROMPT");
  }

  // Очищаем ответ от возможных JSON-обёрток или лишних комментариев
  let videoPrompt = content.trim();
  
  // Удаляем возможные JSON-обёртки
  const jsonMatch = videoPrompt.match(/\{[\s\S]*"videoPrompt"[\s\S]*:[\s\S]*"([^"]+)"[\s\S]*\}/i);
  if (jsonMatch) {
    videoPrompt = jsonMatch[1];
  } else {
    // Удаляем возможные markdown-коды
    videoPrompt = videoPrompt.replace(/```[\w]*\n?/g, "").replace(/```/g, "");
    // Удаляем возможные заголовки типа "VIDEO_PROMPT:" или "Prompt:"
    videoPrompt = videoPrompt.replace(/^(VIDEO_PROMPT|Prompt|Промпт)[:\s]*/i, "");
  }

  return videoPrompt.trim();
}

/**
 * Генерирует промпт для канала (использует ту же логику, что и кнопка "ИИ-идея")
 * @param channelId - ID канала
 * @param userId - ID владельца канала
 * @returns Объект с промптом (videoPrompt для режима video-prompt-only, сценарий для script, videoPrompt для prompt)
 */
export async function generatePromptForChannel(
  channelId: string,
  userId: string
): Promise<{ prompt: string; title?: string }> {
  Logger.info("Generating prompt for channel", { channelId, userId });

  // Получаем канал из Firestore
  const channel = await getChannelFromFirestore(userId, channelId);
  if (!channel) {
    throw new Error(`Канал с ID ${channelId} не найден`);
  }

  const mode = channel.generationMode || "script";

  Logger.info("Channel generation mode", { channelId, mode });

  // Используем универсальный генератор промптов
  const { systemPrompt, userPrompt: baseUserPrompt } = generateChannelPrompt(channel, mode);
  
  // Для автогенерации нужен JSON формат, поэтому используем buildAutoGeneratePrompt
  const systemPromptForAuto = buildAutoGeneratePrompt(channel);
  const userPrompt = "Придумай идею и создай сценарии для этого канала.";

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const supportsJsonMode = model.includes("gpt-4") || model.includes("o3");

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: systemPromptForAuto
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    temperature: 1.0, // Увеличена для большей вариативности и уникальности идей
    max_tokens: 2500 // Увеличено для более детальных сценариев
  };

  if (supportsJsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  try {
    // Шаг 1: Генерируем идею и сценарии
    const data = await callOpenAIProxy(requestBody);
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    const result = parseAutoGenerateResponse(content);
    const idea = result.idea || "";

    if (!idea) {
      throw new Error("Не удалось сгенерировать идею");
    }

    let prompt: string;
    let promptType: "scenario" | "videoPrompt" | "both";

    // Шаг 2: В зависимости от режима формируем текст для отправки
    if (mode === "video-prompt-only") {
      // Для режима "video-prompt-only" генерируем и отправляем только VIDEO_PROMPT
      Logger.info("Generating VIDEO_PROMPT for video-prompt-only mode", { channelId });
      prompt = await generateVideoPromptFromIdea(channel, idea);
      promptType = "videoPrompt";
    } else if (mode === "prompt") {
      // Для режима "prompt" генерируем VIDEO_PROMPT на основе первого сценария
      if (result.scripts.length === 0) {
        throw new Error("Не удалось сгенерировать сценарий для режима 'prompt'");
      }
      
      Logger.info("Generating VIDEO_PROMPT for prompt mode", { channelId });
      
      // Создаём упрощённый сценарий для генерации VIDEO_PROMPT
      const simplifiedScenario = {
        title: idea,
        durationSeconds: channel.targetDurationSec,
        steps: [
          {
            secondFrom: 0,
            secondTo: channel.targetDurationSec,
            description: result.scripts[0],
            dialog: []
          }
        ]
      };

      // Генерируем VIDEO_PROMPT на основе сценария
      const videoPromptText = buildVideoPromptGenerationPrompt(channel, `${idea}\n\nСценарий:\n${result.scripts[0]}`);
      
      const videoRequestBody: Record<string, unknown> = {
        model,
        messages: [
          {
            role: "system",
            content: videoPromptText
          },
          {
            role: "user",
            content: `Создай VIDEO_PROMPT для следующего сценария:\n\n${result.scripts[0]}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      };

      const videoData = await callOpenAIProxy(videoRequestBody);
      const videoContent = videoData.choices?.[0]?.message?.content;

      if (!videoContent) {
        throw new Error("Пустой ответ от OpenAI API при генерации VIDEO_PROMPT");
      }

      // Очищаем ответ от возможных JSON-обёрток или лишних комментариев
      let videoPrompt = videoContent.trim();
      const jsonMatch = videoPrompt.match(/\{[\s\S]*"videoPrompt"[\s\S]*:[\s\S]*"([^"]+)"[\s\S]*\}/i);
      if (jsonMatch) {
        videoPrompt = jsonMatch[1];
      } else {
        videoPrompt = videoPrompt.replace(/```[\w]*\n?/g, "").replace(/```/g, "");
        videoPrompt = videoPrompt.replace(/^(VIDEO_PROMPT|Prompt|Промпт)[:\s]*/i, "");
      }

      prompt = videoPrompt.trim();
      promptType = "videoPrompt";
    } else {
      // Для режима "script" отправляем первый сценарий
      prompt = result.scripts[0] || idea;
      promptType = "scenario";
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new Error("Не удалось сгенерировать промпт");
    }

    Logger.info("Prompt generated successfully", {
      channelId,
      mode,
      promptType,
      promptLength: prompt.length,
      idea: idea.substring(0, 100) + "..."
    });

    return {
      prompt: prompt.trim(),
      title: idea || undefined
    };
  } catch (error) {
    Logger.error("Failed to generate prompt", { channelId, mode, error });
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Неизвестная ошибка при генерации промпта");
  }
}

