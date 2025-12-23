import { Logger } from "./logger";
import { translitRuToLat } from "./fileUtils";

export type TitleSource = "uiTitle" | "openai" | "fallback";

interface GenerateVideoBaseNameOptions {
  promptText?: string;
  uiTitle?: string | null;
  channelName?: string;
  maxLen?: number;
  minLen?: number;
}

interface GenerateVideoBaseNameResult {
  baseName: string;
  source: TitleSource;
  rawTitle?: string;
  reason?: string;
}

// Blacklist слишком общих имён
const GENERIC_NAMES_BLACKLIST = [
  "postroimdomkz",
  "hotwell",
  "sipdelux",
  "video",
  "shorts",
  "clip",
  "rolik",
  "film",
  "movie"
];

// Стоп-слова для удаления при сжатии
const STOP_WORDS_RU = [
  "и", "но", "это", "очень", "самый", "просто", "как", "чтобы", "что", "который",
  "для", "при", "над", "под", "без", "про", "из", "от", "до", "по", "со", "во"
];

const STOP_WORDS_EN = [
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would", "should", "could",
  "can", "may", "might", "must", "this", "that", "these", "those", "with", "for",
  "from", "to", "of", "in", "on", "at", "by", "about", "into", "through"
];

// Словарь замен для умного сжатия
const WORD_ALIASES: Record<string, string> = {
  "stroitelstvo": "stroika",
  "stroitelnyi": "stroika",
  "avtomobil": "auto",
  "avtomobilnyi": "auto",
  "sneg": "sneg",
  "holod": "minus",
  "holodnyi": "minus",
  "teplo": "plus",
  "teplyi": "plus"
};

/**
 * Проверяет, является ли имя слишком общим (попало в blacklist)
 */
export function isTooGenericName(name: string): boolean {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return GENERIC_NAMES_BLACKLIST.some(generic => lower.includes(generic) || generic.includes(lower));
}

/**
 * Умное сжатие названия: удаление стоп-слов, замена на алиасы, обрезка
 */
function smartCompressTitle(title: string, maxLen: number): string {
  let compressed = title.trim();
  
  // Разбиваем на слова
  const words = compressed.split(/[\s_-]+/).filter(w => w.length > 0);
  
  // Удаляем стоп-слова
  const filteredWords = words.filter(word => {
    const lower = word.toLowerCase();
    return !STOP_WORDS_RU.includes(lower) && !STOP_WORDS_EN.includes(lower);
  });
  
  // Заменяем слова на алиасы
  const aliasedWords = filteredWords.map(word => {
    const lower = word.toLowerCase();
    return WORD_ALIASES[lower] || word;
  });
  
  compressed = aliasedWords.join("_");
  
  // Если всё равно слишком длинно, обрезаем по словам
  if (compressed.length > maxLen) {
    let truncated = "";
    for (const word of aliasedWords) {
      const candidate = truncated ? `${truncated}_${word}` : word;
      if (candidate.length <= maxLen) {
        truncated = candidate;
      } else {
        break;
      }
    }
    compressed = truncated || compressed.substring(0, maxLen);
  }
  
  return compressed;
}

/**
 * Санитизация имени файла с умным сжатием
 */
export function sanitizeFileBaseName(
  title: string,
  maxLen: number = 50,
  minLen: number = 16
): string {
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return "";
  }

  let safe = title.trim();

  // Транслитерация кириллицы
  safe = translitRuToLat(safe);

  // Заменяем пробелы на '_'
  safe = safe.replace(/\s+/g, "_");

  // Удаляем запрещённые символы
  safe = safe.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, "");

  // Удаляем знаки препинания (кроме дефиса и подчёркивания)
  safe = safe.replace(/[,.;:!?()[\]{}'"]/g, "");

  // Оставляем только латиницу, цифры, '-', '_'
  safe = safe.replace(/[^a-zA-Z0-9_-]/g, "");

  // Убираем повторяющиеся '_' и '-'
  safe = safe.replace(/[-_]+/g, (match) => match[0] === '-' ? '-' : '_');
  safe = safe.replace(/_+/g, "_");
  safe = safe.replace(/-+/g, "-");

  // Убираем '_' и '-' в начале и конце
  safe = safe.replace(/^[-_]+|[-_]+$/g, "");

  // Умное сжатие, если слишком длинно
  if (safe.length > maxLen) {
    safe = smartCompressTitle(safe, maxLen);
  }

  // Если всё равно слишком длинно, обрезаем
  if (safe.length > maxLen) {
    safe = safe.substring(0, maxLen);
    safe = safe.replace(/[-_]+$/, "");
  }

  // Если слишком коротко, возвращаем пустую строку (будет fallback)
  if (safe.length < minLen) {
    return "";
  }

  return safe;
}

/**
 * Извлечение ключевых слов из промпта для fallback
 */
function extractKeywordsFromPrompt(promptText: string): string[] {
  if (!promptText || typeof promptText !== "string") {
    return [];
  }

  let text = promptText.trim();

  // Удаляем технические фразы
  text = text.replace(/8-?\s*second(s)?/gi, "");
  text = text.replace(/9[:x×]\s*16/gi, "");
  
  // Удаляем кириллические фразы через строковые замены (избегаем проблем с regex)
  const cyrillicPhrases = [
    "без логотипов",
    "без логотип",
    "без субтитров",
    "без субтитр"
  ];
  
  for (const phrase of cyrillicPhrases) {
    let lowerText = text.toLowerCase();
    const lowerPhrase = phrase.toLowerCase();
    let index = lowerText.indexOf(lowerPhrase);
    while (index !== -1) {
      text = text.substring(0, index) + text.substring(index + phrase.length);
      lowerText = text.toLowerCase();
      index = lowerText.indexOf(lowerPhrase);
    }
  }

  // Удаляем всё до "Сцена/Хук/0-2 сек" если есть
  // Используем строковый поиск для кириллицы, regex для латиницы
  const sceneKeywords = ["сцена", "хук", "0-2 сек", "0-2сек", "actions", "actions by time"];
  let sceneIndex = -1;
  for (const keyword of sceneKeywords) {
    const index = text.toLowerCase().indexOf(keyword.toLowerCase());
    if (index !== -1) {
      sceneIndex = index;
      break;
    }
  }
  if (sceneIndex !== -1) {
    text = text.substring(sceneIndex);
  }

  // Разбиваем на слова
  const words = text.split(/[\s,.;:!?()[\]{}'"]+/).filter(w => w.length > 2);

  // Фильтруем стоп-слова и технические термины
  const keywords = words
    .filter(word => {
      const lower = word.toLowerCase();
      return (
        !STOP_WORDS_RU.includes(lower) &&
        !STOP_WORDS_EN.includes(lower) &&
        !/^\d+$/.test(lower) &&
        !/^(second|video|clip|short|logo|subtitle|watermark)$/i.test(lower)
      );
    })
    .slice(0, 6); // Берём до 6 ключевых слов

  return keywords;
}

/**
 * Fallback-генерация имени из промпта (БЕЗ дат/времени)
 */
function fallbackNameFromPrompt(
  promptText: string,
  channelName?: string,
  maxLen: number = 50,
  minLen: number = 16
): string {
  const keywords = extractKeywordsFromPrompt(promptText);

  if (keywords.length === 0) {
    // Последний fallback: только channelSlug (БЕЗ даты!)
    const channelSlug = channelName
      ? sanitizeFileBaseName(channelName, 10, 3).toLowerCase()
      : "video";
    
    // Если channelSlug слишком общий, добавляем случайное слово
    if (isTooGenericName(channelSlug)) {
      const randomWord = Math.random().toString(36).substring(2, 6);
      return `${channelSlug}_${randomWord}`.substring(0, maxLen);
    }
    
    return channelSlug.substring(0, maxLen);
  }

  // Берём первые 3-5 ключевых слов
  const selectedKeywords = keywords.slice(0, 5);
  let name = selectedKeywords.join("_");

  // Транслитерация и санитизация
  name = sanitizeFileBaseName(name, maxLen, minLen);

  // Если всё равно слишком коротко, добавляем ещё слова
  if (name.length < minLen && keywords.length > selectedKeywords.length) {
    const additional = keywords.slice(selectedKeywords.length, 7);
    name = [...selectedKeywords, ...additional].join("_");
    name = sanitizeFileBaseName(name, maxLen, minLen);
  }

  // Если всё равно слишком коротко или пусто, используем последний fallback (БЕЗ даты!)
  if (name.length < minLen) {
    const firstKeyword = keywords[0] ? sanitizeFileBaseName(keywords[0], 15, 3) : "video";
    if (isTooGenericName(firstKeyword)) {
      const randomWord = Math.random().toString(36).substring(2, 6);
      return `${firstKeyword}_${randomWord}`.substring(0, maxLen);
    }
    return firstKeyword.substring(0, maxLen);
  }

  return name;
}

/**
 * Генерация названия через OpenAI с улучшенным промптом
 */
async function generateTitleViaOpenAI(
  promptText: string,
  channelName?: string,
  languageHint: "ru" | "en" | "kk" = "ru"
): Promise<string | null> {
  const apiKey = (globalThis as any).process?.env?.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = (globalThis as any).process?.env?.OPENAI_MODEL || "gpt-4o-mini";

  const languageName =
    languageHint === "en" ? "English" : languageHint === "kk" ? "Kazakh" : "Russian";

  const systemPrompt = `Ты генерируешь короткие названия файлов для видео. Верни только JSON без пояснений.`;

  const userPrompt = `Сгенерируй информативное название файла для короткого видео на основе PROMPT ниже.
Требования:
- 3–6 слов
- должно отражать СУТЬ (объект + действие + контекст)
- НЕ используй бренды/домены/названия канала (PostroimDom, HotWell, sipdelux, .kz)
- НЕ используй общие слова: видео, шортс, клип, ролик
- без пунктуации и спецсимволов, только слова
- длина после транслитерации и замены пробелов на '_' должна быть 28–45 символов (не меньше 16, не больше 50)
- язык слов: латиница (если русский — транслитерируй смысл, не дословно)
Верни строго JSON: {"title":"..."}.

CHANNEL_NAME: ${channelName || "не указан"}
PROMPT:
${promptText.substring(0, 1200)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 60,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim();

    if (!raw) {
      throw new Error("Пустой ответ от OpenAI");
    }

    // Парсим JSON
    let parsed: { title?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Если не JSON, пытаемся извлечь название из текста
      const match = raw.match(/"title"\s*:\s*"([^"]+)"/);
      if (match) {
        parsed = { title: match[1] };
      } else {
        parsed = { title: raw.replace(/[{}"]/g, "").trim() };
      }
    }

    const title = parsed.title?.trim();
    if (!title || title.length < 3) {
      throw new Error("Пустое или слишком короткое название");
    }

    // Очистка от markdown и лишних символов
    let clean = title
      .replace(/\*\*/g, "")
      .replace(/[`#>-]/g, "")
      .replace(/^["'«»]+/, "")
      .replace(/["'«»]+$/, "")
      .replace(/[.!?]+$/g, "")
      .trim();

    // Если есть двоеточие, берём часть до него
    const colonIndex = clean.indexOf(":");
    if (colonIndex !== -1 && colonIndex < 30) {
      clean = clean.substring(0, colonIndex).trim();
    }

    return clean || null;
  } catch (error: any) {
    clearTimeout(timeoutId);
    Logger.warn("[TITLE_NAMER] OpenAI generation failed", {
      error: error?.message || String(error)
    });
    return null;
  }
}

/**
 * Основная функция генерации базового имени файла
 * DEPRECATED: Используйте buildVideoBaseName из videoFilename.ts
 * Оставлена для обратной совместимости
 */
export async function generateVideoBaseName(
  options: GenerateVideoBaseNameOptions
): Promise<GenerateVideoBaseNameResult> {
  // Используем новую единую функцию
  const { buildVideoBaseName } = await import("./videoFilename");
  return await buildVideoBaseName({
    promptText: options.promptText || null,
    uiTitle: options.uiTitle || null,
    channelName: options.channelName || null
  });
}

