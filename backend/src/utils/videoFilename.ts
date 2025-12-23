/**
 * Единый модуль для генерации имён файлов видео
 * Используется как в ручном, так и в автоматическом режиме
 * 
 * ПРАВИЛА:
 * - НЕ добавлять дату/время/ID в имя файла
 * - Цифры только для коллизий: _2, _3, _4 и т.д.
 * - Имена должны быть "человеческими", пригодными для YouTube titles
 */

import { Logger } from "./logger";
import { translitRuToLat } from "./fileUtils";
import * as path from "path";
import * as fs from "fs/promises";

export type BaseNameSource = "uiTitle" | "openai" | "fallback";

export interface BuildVideoBaseNameInput {
  uiTitle?: string | null;        // То, что пользователь ввёл в поле "Название ролика / файла" (ручной режим)
  promptText?: string | null;     // Полный prompt, который отправляем в Telegram (auto режим)
  channelName?: string | null;    // PostroimDom.kz (но в названии файла НЕ используем)
  platform?: "youtube" | "tiktok";
}

export interface BuildVideoBaseNameResult {
  baseName: string;
  source: BaseNameSource;
  rawTitle?: string;
  reason?: string;
}

// Blacklist слишком общих имён
const GENERIC_NAMES_BLACKLIST = [
  "postroimdom",
  "postroimdomkz",
  "hotwell",
  "sipdelux",
  "video",
  "shorts",
  "clip",
  "rolik",
  "film",
  "movie",
  "kz"
];

// Стоп-слова для удаления при сжатии
const STOP_WORDS_RU = [
  "и", "но", "это", "очень", "самый", "просто", "как", "чтобы", "что", "который",
  "для", "при", "над", "под", "без", "про", "из", "от", "до", "по", "со", "во",
  "без", "логотипов", "субтитров", "водяных", "знаков"
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
 * Санитизация имени файла с умным сжатием
 */
export function sanitizeBaseName(
  title: string,
  maxLen: number = 50,
  minLen: number = 16
): string {
  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return "";
  }

  let safe = title.trim();

  // Транслитерация кириллицы
  const beforeTranslit = safe;
  safe = translitRuToLat(safe);

  // ДИАГНОСТИКА: логируем после транслитерации
  if (safe.length === 0 && title.length > 0) {
    Logger.warn("[SANITIZE] transliteration resulted in empty string", {
      originalTitle: title.substring(0, 100),
      originalLength: title.length,
      beforeTranslit: beforeTranslit.substring(0, 100)
    });
    return "";
  }

  // Заменяем пробелы и знаки препинания на '_' (сохраняем структуру)
  safe = safe.replace(/[\s,.;:!?()[\]{}'"]+/g, "_");

  // Удаляем запрещённые символы для файловых систем
  safe = safe.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, "");

  // ИСПРАВЛЕНИЕ: После транслитерации могут остаться не-ASCII символы (если транслитерация не сработала)
  // Удаляем оставшиеся кириллические символы (если транслитерация пропустила что-то)
  safe = safe.replace(/[а-яёА-ЯЁ]/g, "");

  // Удаляем другие не-ASCII символы (emoji и т.д.), но только если они не латиница
  safe = safe.replace(/[^\x00-\x7F]/g, "");

  // Оставляем только латиницу, цифры, '-', '_'
  safe = safe.replace(/[^a-zA-Z0-9_-]/g, "");

  // ДИАГНОСТИКА: логируем если после всех операций строка стала пустой
  if (safe.length === 0 && title.length > 0) {
    Logger.warn("[SANITIZE] string became empty after sanitization", {
      originalTitle: title.substring(0, 100),
      originalLength: title.length,
      afterTranslit: translitRuToLat(title.trim()).substring(0, 100)
    });
  }

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

  // Если слишком коротко, но есть хотя бы несколько символов - используем как есть
  // Уменьшаем minLen для коротких названий, но не ниже 8 символов
  const effectiveMinLen = Math.max(8, minLen);
  
  if (safe.length < effectiveMinLen) {
    Logger.info("[SANITIZE] result too short, but returning anyway", {
      originalTitle: title.substring(0, 100),
      sanitized: safe,
      length: safe.length,
      minLen: effectiveMinLen
    });
    // Если есть хотя бы 3 символа, возвращаем, иначе пустую строку (будет fallback)
    if (safe.length >= 3) {
      return safe;
    }
    return "";
  }

  return safe;
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
 * Защита от слишком общего имени: добавляет ключевые слова из контекста
 */
export function ensureNonGeneric(
  name: string,
  context: { promptText?: string | null; channelName?: string | null }
): string {
  if (!isTooGenericName(name)) {
    return name;
  }

  // Если имя слишком общее, пытаемся добавить ключевые слова из promptText
  if (context.promptText && context.promptText.trim().length > 10) {
    const keywords = extractKeywordsFromPrompt(context.promptText);
    if (keywords.length > 0) {
      const additional = keywords.slice(0, 2).join("_");
      const enhanced = `${name}_${additional}`;
      const sanitized = sanitizeBaseName(enhanced, 50, 16);
      if (sanitized.length >= 16) {
        return sanitized;
      }
    }
  }

  return name;
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
  text = text.replace(/vertical|aspect\s*ratio/gi, "");
  
  // Удаляем кириллические фразы через строковые замены
  const cyrillicPhrases = [
    "без логотипов",
    "без логотип",
    "без субтитров",
    "без субтитр",
    "без водяных знаков"
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
    text = text.substring(0, sceneIndex);
  }

  // Разбиваем на слова
  const words = text.split(/[\s,.;:!?()[\]{}'"]+/).filter(w => w.length >= 4);

  // Фильтруем стоп-слова и технические термины
  const keywords = words
    .filter(word => {
      const lower = word.toLowerCase();
      return (
        !STOP_WORDS_RU.includes(lower) &&
        !STOP_WORDS_EN.includes(lower) &&
        !/^\d+$/.test(lower) &&
        !/^(second|video|clip|short|logo|subtitle|watermark|aspect|ratio|vertical)$/i.test(lower)
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
    // Последний fallback: только ключевые слова из channelName (без даты!)
    const channelSlug = channelName
      ? sanitizeBaseName(channelName, 15, 3).toLowerCase()
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
  name = sanitizeBaseName(name, maxLen, minLen);

  // Если всё равно слишком коротко, добавляем ещё слова
  if (name.length < minLen && keywords.length > selectedKeywords.length) {
    const additional = keywords.slice(selectedKeywords.length, 7);
    name = [...selectedKeywords, ...additional].join("_");
    name = sanitizeBaseName(name, maxLen, minLen);
  }

  // Если всё равно слишком коротко или пусто, используем последний fallback
  if (name.length < minLen) {
    const firstKeyword = keywords[0] ? sanitizeBaseName(keywords[0], 15, 3) : "video";
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
    Logger.warn("[VIDEO_FILENAME] OpenAI generation failed", {
      error: error?.message || String(error)
    });
    return null;
  }
}

/**
 * Основная функция генерации базового имени файла
 * ЕДИНЫЙ ИСТОЧНИК ИСТИНЫ для обоих режимов (manual и auto)
 */
export async function buildVideoBaseName(
  input: BuildVideoBaseNameInput
): Promise<BuildVideoBaseNameResult> {
  const {
    promptText = "",
    uiTitle,
    channelName,
  } = input;

  const maxLen = 50;
  const minLen = 16;

  // ПРИОРИТЕТ 1: uiTitle (если есть и не пустое)
  if (uiTitle && typeof uiTitle === "string" && uiTitle.trim().length > 0) {
    const sanitized = sanitizeBaseName(uiTitle, maxLen, minLen);
    
    if (sanitized.length >= minLen && !isTooGenericName(sanitized)) {
      Logger.info("[VIDEO_FILENAME] using uiTitle", {
        uiTitle,
        sanitized,
        length: sanitized.length
      });
      return {
        baseName: sanitized,
        source: "uiTitle",
        rawTitle: uiTitle
      };
    } else {
      Logger.warn("[VIDEO_FILENAME] uiTitle too short or generic, falling back", {
        uiTitle,
        sanitized,
        length: sanitized.length,
        isGeneric: isTooGenericName(sanitized)
      });
    }
  }

  // ПРИОРИТЕТ 2: OpenAI (если есть promptText)
  if (promptText && promptText.trim().length > 10) {
    try {
      const languageHint = promptText.match(/[а-яё]/i) ? "ru" : "en";
      const rawTitle = await generateTitleViaOpenAI(promptText, channelName || undefined, languageHint);
      
      if (rawTitle) {
        const sanitized = sanitizeBaseName(rawTitle, maxLen, minLen);
        
        if (sanitized.length >= minLen && !isTooGenericName(sanitized)) {
          Logger.info("[VIDEO_FILENAME] using OpenAI title", {
            rawTitle,
            sanitized,
            length: sanitized.length
          });
          return {
            baseName: sanitized,
            source: "openai",
            rawTitle
          };
        } else {
          Logger.warn("[VIDEO_FILENAME] OpenAI title too short or generic, falling back", {
            rawTitle,
            sanitized,
            length: sanitized.length,
            isGeneric: isTooGenericName(sanitized)
          });
        }
      }
    } catch (error: any) {
      Logger.warn("[VIDEO_FILENAME] OpenAI generation failed", {
        error: error?.message || String(error)
      });
    }
  }

  // ПРИОРИТЕТ 3: Fallback из промпта (БЕЗ дат/времени)
  if (promptText && promptText.trim().length > 10) {
    const fallbackName = fallbackNameFromPrompt(promptText, channelName || undefined, maxLen, minLen);
    const sanitized = sanitizeBaseName(fallbackName, maxLen, minLen);
    
    if (sanitized.length >= minLen) {
      Logger.info("[VIDEO_FILENAME] using fallback from prompt", {
        fallbackName,
        sanitized,
        length: sanitized.length
      });
      return {
        baseName: sanitized,
        source: "fallback",
        rawTitle: fallbackName,
        reason: "extracted from prompt keywords"
      };
    }
  }

  // Последний fallback: пытаемся извлечь ключевые слова из promptText, если есть
  // Если promptText есть, но fallback не сработал выше - значит извлечение не дало результата
  // В этом случае используем только ключевые слова БЕЗ channelSlug
  if (promptText && promptText.trim().length > 10) {
    const keywords = extractKeywordsFromPrompt(promptText);
    if (keywords.length >= 2) {
      // Берём первые 2-3 ключевых слова
      const keywordName = keywords.slice(0, 3).join("_");
      const sanitized = sanitizeBaseName(keywordName, maxLen, minLen);
      if (sanitized.length >= minLen) {
        Logger.warn("[VIDEO_FILENAME] using keywords fallback (NO CHANNEL, NO TIMESTAMP)", {
          keywords,
          sanitized,
          reason: "extracted keywords from prompt as last resort"
        });
        return {
          baseName: sanitized,
          source: "fallback",
          rawTitle: keywordName,
          reason: "keywords from prompt (no channel, no timestamp)"
        };
      }
    }
  }

  // Если ничего не помогло - используем generic "video" с случайным суффиксом (БЕЗ channelSlug и БЕЗ даты!)
  const randomWord = Math.random().toString(36).substring(2, 8);
  const finalFallback = `video_${randomWord}`;

  Logger.warn("[VIDEO_FILENAME] using final fallback (NO CHANNEL, NO TIMESTAMP)", {
    finalFallback,
    reason: "no valid title could be generated, using generic video_<random>"
  });

  return {
    baseName: finalFallback.substring(0, maxLen),
    source: "fallback",
    rawTitle: finalFallback,
    reason: "final fallback: video_<random> (no channel, no timestamp)"
  };
}

/**
 * Разрешение коллизий: добавляет суффиксы _2, _3, _4 и т.д.
 * ЕДИНСТВЕННОЕ место, где допустимы цифры в имени файла
 */
export async function resolveCollision(
  dir: string,
  base: string,
  ext: ".mp4" | ".json" = ".mp4"
): Promise<string> {
  const maxBaseLength = 50;
  
  // Ограничиваем базовое имя до 50 символов
  let truncatedBase = base;
  if (truncatedBase.length > maxBaseLength) {
    truncatedBase = truncatedBase.substring(0, maxBaseLength);
    truncatedBase = truncatedBase.replace(/[-_]+$/, "");
  }

  // Проверяем существование файла
  let candidate = truncatedBase;
  let counter = 2;

  while (true) {
    const filePath = path.join(dir, `${candidate}${ext}`);
    try {
      await fs.access(filePath);
      // Файл существует, пробуем следующий вариант
      // Формат: base_2, base_3 и т.д. (ОДНО подчёркивание!)
      const suffix = `_${counter}`;
      const maxBaseForSuffix = maxBaseLength - suffix.length;
      if (truncatedBase.length > maxBaseForSuffix) {
        candidate = `${truncatedBase.substring(0, maxBaseForSuffix)}${suffix}`;
      } else {
        candidate = `${truncatedBase}${suffix}`;
      }
      counter++;
    } catch {
      // Файл не существует, можно использовать это имя
      break;
    }

    // Защита от бесконечного цикла
    if (counter > 1000) {
      // Если слишком много конфликтов, добавляем короткий случайный суффикс
      const randomSuffix = Math.random().toString(36).substring(2, 6);
      const suffix = `_${randomSuffix}`;
      const maxBaseForSuffix = maxBaseLength - suffix.length;
      if (truncatedBase.length > maxBaseForSuffix) {
        candidate = `${truncatedBase.substring(0, maxBaseForSuffix)}${suffix}`;
      } else {
        candidate = `${truncatedBase}${suffix}`;
      }
      break;
    }
  }

  // Финальная проверка: не превышаем 50 символов
  if (candidate.length > maxBaseLength) {
    candidate = candidate.substring(0, maxBaseLength).replace(/[-_]+$/, "");
  }

  return candidate;
}

