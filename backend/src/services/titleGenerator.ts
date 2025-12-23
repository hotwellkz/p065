import { Logger } from "../utils/logger";

export type TitleSource = "ui" | "openai" | "fallback";

interface GenerateVideoTitleOptions {
  promptText: string;
  languageHint?: "ru" | "en" | "kk";
  channelName?: string;
}

interface GenerateVideoTitleResult {
  title: string;
  source: TitleSource;
}

/**
 * Предобработка текста промпта:
 * - убираем типичные технические фразы (8-second, 9:16, без логотипов и т.п.)
 * - обрезаем до ~1200 символов
 */
function preprocessPromptText(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }

  let text = raw;

  // Убираем самые частые технические "хвосты"
  const technicalPatterns: RegExp[] = [
    /9[:x×]\s*16/gi,
    /\b8-?\s*second(s)?\b/gi,
    /\b10-?\s*second(s)?\b/gi,
    /\bshort\s*vertical\s*video\b/gi,
    /\bno\s+logo(s)?\b/gi,
    /\bno\s+subtitles\b/gi,
    /\bno\s+watermark(s)?\b/gi
  ];
  
  // Дополнительно убираем кириллические фразы через строковые замены
  // ВАЖНО: используем простую строковую замену, а не RegExp, чтобы избежать проблем с кириллицей
  const cyrillicPhrases = [
    "без логотипов",
    "без логотип",
    "без субтитров"
  ];
  
  for (const phrase of cyrillicPhrases) {
    // Используем простую строковую замену с игнорированием регистра
    let lowerText = text.toLowerCase();
    const lowerPhrase = phrase.toLowerCase();
    let index = lowerText.indexOf(lowerPhrase);
    while (index !== -1) {
      text = text.substring(0, index) + text.substring(index + phrase.length);
      lowerText = text.toLowerCase();
      index = lowerText.indexOf(lowerPhrase);
    }
  }

  for (const pattern of technicalPatterns) {
    text = text.replace(pattern, "");
  }

  // Схлопываем пробелы
  text = text.replace(/\s+/g, " ").trim();

  // Обрезаем до 1200 символов
  const MAX_LEN = 1200;
  if (text.length > MAX_LEN) {
    text = text.slice(0, MAX_LEN);
  }

  return text;
}

/**
 * Вспомогательная функция для вызова OpenAI Chat Completions
 */
async function callOpenAI(requestBody: Record<string, unknown>): Promise<any> {
  const apiKey = (globalThis as any).process?.env?.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API ключ не настроен (OPENAI_API_KEY пустой)");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 секунд

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

    throw new Error("Неизвестная ошибка при обращении к OpenAI API");
  }
}

/**
 * Fallback‑генерация названия, если OpenAI недоступен.
 * Берём первые осмысленные слова из promptText и режем до 40–50 символов.
 */
function fallbackTitleFromPrompt(promptText: string): string {
  const clean = preprocessPromptText(promptText);
  if (!clean) {
    return "video";
  }

  // Убираем маркеры, markdown и т.п.
  let title = clean
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/[`#>-]/g, "")
    .trim();

  // Если title содержит двоеточие, берём только часть ДО двоеточия (это обычно заголовок)
  if (title.includes(":")) {
    const parts = title.split(":");
    if (parts[0].trim().length >= 10) {
      title = parts[0].trim();
    }
  }

  // Берём первые 5-7 слов для более осмысленного названия
  const words = title.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 7) {
    title = words.slice(0, 7).join(" ");
  }

  const MAX_LEN = 60;
  if (title.length > MAX_LEN) {
    title = title.slice(0, MAX_LEN);
    // Обрезаем по последнему пробелу, чтобы не резать слово пополам
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 30) {
      title = title.substring(0, lastSpace);
    }
  }

  // Убираем возможные хвостовые запятые/точки
  title = title.replace(/[\s,.;:!?-]+$/g, "").trim();

  return title || "video";
}

/**
 * Генерирует короткое человекочитаемое название ролика из текста промпта.
 * Используется только в авто‑режиме (scheduler), где UI не прислал title.
 */
export async function generateVideoTitleFromPrompt(
  options: GenerateVideoTitleOptions
): Promise<GenerateVideoTitleResult> {
  const { promptText, languageHint = "ru", channelName } = options;

  const preparedPrompt = preprocessPromptText(promptText);

  Logger.info("[TITLE_GEN] start", {
    languageHint,
    channelName: channelName || "not set",
    rawPromptLength: promptText?.length || 0,
    preparedPromptLength: preparedPrompt.length
  });

  // Если после предобработки почти ничего не осталось — сразу fallback
  if (!preparedPrompt || preparedPrompt.length < 10) {
    const fallback = fallbackTitleFromPrompt(promptText);
    Logger.warn("[TITLE_GEN] fallback: prompt too short after preprocess", {
      fallback
    });
    return { title: fallback, source: "fallback" };
  }

  const model = (globalThis as any).process?.env?.OPENAI_MODEL || "gpt-4o-mini";

  const languageName =
    languageHint === "en" ? "English" : languageHint === "kk" ? "Kazakh" : "Russian";

  const systemPrompt = `Ты помогаешь придумывать КРАТКИЕ названия для вертикальных видео.
Требования к названию:
- язык: ${languageName}
- длина: 3–7 слов, 20–45 символов
- НИКАКИХ эмодзи
- без кавычек, без точки в конце
- без хэштегов, без ссылок
- название должно отражать суть ролика и быть цепляющим (hook).
Верни ТОЛЬКО одну строку с названием.`;

  const userPromptParts: string[] = [];

  if (channelName) {
    userPromptParts.push(`Канал: ${channelName}`);
  }
  userPromptParts.push("Текст промпта для ролика:");
  userPromptParts.push(preparedPrompt);
  userPromptParts.push("");
  userPromptParts.push(
    "На основе этого опиши СУТЬ ролика в одном коротком заголовке (3–7 слов). Верни только заголовок."
  );

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPromptParts.join("\n")
      }
    ],
    temperature: 0.2,
    max_tokens: 60
  };

  try {
    const data = await callOpenAI(requestBody);
    const raw = data.choices?.[0]?.message?.content?.trim() as string | undefined;

    if (!raw) {
      throw new Error("Пустой ответ от OpenAI при генерации названия");
    }

    // Чистим ответ: убираем markdown, кавычки, точки на конце и лишние пробелы
    let title = raw
      // Убираем markdown разметку (**bold**, *italic*, `code`, # заголовки)
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/`/g, "")
      .replace(/#+\s*/g, "")
      // Убираем кавычки
      .replace(/^["'«»]+/, "")
      .replace(/["'«»]+$/, "")
      // Убираем двоеточия и тире в начале (часто бывает "Заголовок: текст")
      .replace(/^[:\-–—]\s*/, "")
      .trim();

    // Удаляем точку/восклицательный/вопросительный знак в конце
    title = title.replace(/[.!?]+$/g, "").trim();

    // Схлопываем пробелы
    title = title.replace(/\s+/g, " ").trim();

    // Если title содержит двоеточие, берём только часть ДО двоеточия (это обычно заголовок)
    if (title.includes(":")) {
      const parts = title.split(":");
      if (parts[0].trim().length >= 10) {
        title = parts[0].trim();
      }
    }

    // Ограничиваем по длине
    if (title.length > 60) {
      title = title.slice(0, 60).replace(/[\s,.;:!?-]+$/g, "").trim();
    }

    if (!title) {
      throw new Error("Пустой результат после очистки названия");
    }

    Logger.info("[TITLE_GEN] ok", {
      source: "openai",
      languageHint,
      title,
      length: title.length
    });

    return { title, source: "openai" };
  } catch (error: any) {
    const message = error?.message || String(error);

    Logger.warn("[TITLE_GEN] failed, using fallback", {
      error: message
    });

    const fallback = fallbackTitleFromPrompt(promptText);

    Logger.info("[TITLE_GEN] fallback ok", {
      title: fallback,
      length: fallback.length
    });

    return { title: fallback, source: "fallback" };
  }
}


