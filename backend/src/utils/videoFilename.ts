/**
 * Единый модуль для генерации имён файлов видео
 * Используется как в ручном, так и в автоматическом режиме
 * 
 * ПРАВИЛА:
 * - НЕ добавлять дату/время/ID в имя файла
 * - Цифры только для коллизий: _2, _3, _4 и т.д.
 * - Имена должны быть "человеческими", пригодными для YouTube titles
 * 
 * ВАЖНО: Для автоматизации (inbox-monitor → autopublish) используется
 * строго формат video_<shortId>.mp4 через generateVideoFilename()
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

// A) STOP/GENERIC слова - действительно мусор, не несущие смысла
const GENERIC_STOP_WORDS = [
  "video",
  "shorts",
  "clip",
  "rolik",
  "film",
  "movie"
];

// B) BRAND слова - бренды/компании, НЕ считаются "слишком общими"
// Если название содержит бренд + смысловые слова - это хорошо
const BRAND_WORDS = [
  "postroimdom",
  "postroimdomkz",
  "hotwell",
  "sipdelux",
  "kz"  // Географический идентификатор, часто используется с брендами
];

// Объединённый набор для быстрой проверки
const ALL_GENERIC_AND_BRAND = new Set([...GENERIC_STOP_WORDS, ...BRAND_WORDS]);

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
 * Токенизирует имя файла на отдельные слова
 * Разбивает по подчёркиваниям, дефисам и пробелам
 */
function tokenizeName(name: string): string[] {
  if (!name || typeof name !== "string") {
    return [];
  }
  
  // Нормализуем: заменяем все разделители на пробелы, затем разбиваем
  const normalized = name.toLowerCase().replace(/[-_]+/g, " ");
  const tokens = normalized.split(/\s+/).filter(token => token.length > 0);
  
  // Очищаем токены от не-буквенно-цифровых символов (кроме начала/конца)
  return tokens.map(token => token.replace(/[^a-z0-9]/g, "")).filter(token => token.length > 0);
}

/**
 * Проверяет, является ли имя слишком общим
 * 
 * Правила:
 * - Проверяет только по STOP/GENERIC словам (не по брендам)
 * - Использует токенизацию для точного сравнения (не includes по подстроке)
 * - Если ВСЕ токены входят в GENERIC_STOP_WORDS и токенов мало (<=2) => generic
 * - Если есть хотя бы один бренд-токен => НЕ generic
 * - Если есть хотя бы один токен не из blacklist => НЕ generic
 */
export function isTooGenericName(name: string): boolean {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return true; // Пустое имя считается generic
  }
  
  const tokens = tokenizeName(name);
  
  if (tokens.length === 0) {
    return true; // Нет токенов = generic
  }
  
  // Если только 1 токен и он в GENERIC_STOP_WORDS => generic
  if (tokens.length === 1) {
    return GENERIC_STOP_WORDS.includes(tokens[0]);
  }
  
  // Если 2 токена и оба в GENERIC_STOP_WORDS => generic
  if (tokens.length === 2) {
    return GENERIC_STOP_WORDS.includes(tokens[0]) && GENERIC_STOP_WORDS.includes(tokens[1]);
  }
  
  // Если есть хотя бы один бренд-токен => НЕ generic
  const hasBrandToken = tokens.some(token => BRAND_WORDS.includes(token));
  if (hasBrandToken) {
    return false;
  }
  
  // Если все токены в GENERIC_STOP_WORDS => generic
  const allGeneric = tokens.every(token => GENERIC_STOP_WORDS.includes(token));
  if (allGeneric) {
    return true;
  }
  
  // Если есть хотя бы один токен не из blacklist => НЕ generic
  const hasNonGenericToken = tokens.some(token => 
    !GENERIC_STOP_WORDS.includes(token) && !BRAND_WORDS.includes(token)
  );
  if (hasNonGenericToken) {
    return false;
  }
  
  // По умолчанию считаем не generic (если есть смешанные токены)
  return false;
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
 * 
 * ВАЖНО: Теперь бренды НЕ считаются generic, поэтому эта функция
 * срабатывает только для действительно generic слов (video, shorts и т.д.)
 */
export function ensureNonGeneric(
  name: string,
  context: { promptText?: string | null; channelName?: string | null }
): string {
  if (!isTooGenericName(name)) {
    return name;
  }

  const tokens = tokenizeName(name);
  const brandTokens = tokens.filter(t => BRAND_WORDS.includes(t));
  
  // Если есть бренд-токены, но всё равно generic - это странно, но не добавляем ничего
  if (brandTokens.length > 0) {
    Logger.warn("[ensureNonGeneric] Name has brand tokens but marked generic, returning as-is", {
      name,
      tokens,
      brandTokens
    });
    return name;
  }

  // Если имя слишком общее (только generic слова), пытаемся добавить ключевые слова из promptText
  if (context.promptText && context.promptText.trim().length > 10) {
    const keywords = extractKeywordsFromPrompt(context.promptText);
    if (keywords.length > 0) {
      const additional = keywords.slice(0, 2).join("_");
      const enhanced = `${name}_${additional}`;
      const sanitized = sanitizeBaseName(enhanced, 50, 16);
      if (sanitized.length >= 16 && !isTooGenericName(sanitized)) {
        Logger.info("[ensureNonGeneric] Enhanced generic name with keywords", {
          original: name,
          enhanced: sanitized,
          keywords: keywords.slice(0, 2)
        });
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
    const tokens = tokenizeName(firstKeyword);
    const brandTokens = tokens.filter(t => BRAND_WORDS.includes(t));
    const isGeneric = isTooGenericName(firstKeyword);
    
    // Если есть бренд-токены, используем как есть
    if (brandTokens.length > 0) {
      return firstKeyword.substring(0, maxLen);
    }
    
    // Если действительно generic (только generic слова), добавляем случайное слово
    if (isGeneric) {
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
    const isGeneric = isTooGenericName(sanitized);
    const tokens = tokenizeName(sanitized);
    const genericTokens = tokens.filter(t => GENERIC_STOP_WORDS.includes(t));
    const brandTokens = tokens.filter(t => BRAND_WORDS.includes(t));
    
    if (sanitized.length >= minLen && !isGeneric) {
      Logger.info("[BASENAME] source=uiTitle", {
        rawTitle: uiTitle,
        baseName: sanitized,
        length: sanitized.length,
        tokens,
        brandTokens: brandTokens.length > 0 ? brandTokens : undefined,
        reason: "valid_uiTitle"
      });
      return {
        baseName: sanitized,
        source: "uiTitle",
        rawTitle: uiTitle,
        reason: "valid_uiTitle"
      };
    } else {
      const reason = sanitized.length < minLen 
        ? `too_short_${sanitized.length}_chars` 
        : `generic_tokens_${genericTokens.join("_")}`;
      
      Logger.warn("[BASENAME] source=uiTitle rejected, falling back", {
        rawTitle: uiTitle,
        baseName: sanitized,
        length: sanitized.length,
        tokens,
        genericTokens: genericTokens.length > 0 ? genericTokens : undefined,
        brandTokens: brandTokens.length > 0 ? brandTokens : undefined,
        isGeneric,
        reason
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
        
        const isGeneric = isTooGenericName(sanitized);
        const tokens = tokenizeName(sanitized);
        const genericTokens = tokens.filter(t => GENERIC_STOP_WORDS.includes(t));
        const brandTokens = tokens.filter(t => BRAND_WORDS.includes(t));
        
        if (sanitized.length >= minLen && !isGeneric) {
          Logger.info("[BASENAME] source=openai", {
            rawTitle,
            baseName: sanitized,
            length: sanitized.length,
            tokens,
            brandTokens: brandTokens.length > 0 ? brandTokens : undefined,
            reason: "valid_openai_title"
          });
          return {
            baseName: sanitized,
            source: "openai",
            rawTitle,
            reason: "valid_openai_title"
          };
        } else {
          const reason = sanitized.length < minLen 
            ? `too_short_${sanitized.length}_chars` 
            : `generic_tokens_${genericTokens.join("_")}`;
          
          Logger.warn("[BASENAME] source=openai rejected, falling back", {
            rawTitle,
            baseName: sanitized,
            length: sanitized.length,
            tokens,
            genericTokens: genericTokens.length > 0 ? genericTokens : undefined,
            brandTokens: brandTokens.length > 0 ? brandTokens : undefined,
            isGeneric,
            reason
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
    const isGeneric = isTooGenericName(sanitized);
    const tokens = tokenizeName(sanitized);
    const genericTokens = tokens.filter(t => GENERIC_STOP_WORDS.includes(t));
    const brandTokens = tokens.filter(t => BRAND_WORDS.includes(t));
    
    if (sanitized.length >= minLen && !isGeneric) {
      Logger.info("[BASENAME] source=fallback", {
        rawTitle: fallbackName,
        baseName: sanitized,
        length: sanitized.length,
        tokens,
        brandTokens: brandTokens.length > 0 ? brandTokens : undefined,
        reason: "extracted_from_prompt_keywords"
      });
      return {
        baseName: sanitized,
        source: "fallback",
        rawTitle: fallbackName,
        reason: "extracted_from_prompt_keywords"
      };
    } else if (sanitized.length >= minLen && isGeneric && brandTokens.length > 0) {
      // Если есть бренд-токены, но всё равно generic - используем
      Logger.warn("[BASENAME] source=fallback with brand tokens but marked generic, using anyway", {
        rawTitle: fallbackName,
        baseName: sanitized,
        length: sanitized.length,
        tokens,
        genericTokens,
        brandTokens,
        reason: "fallback_with_brand_but_generic_using_anyway"
      });
      return {
        baseName: sanitized,
        source: "fallback",
        rawTitle: fallbackName,
        reason: "fallback_with_brand_but_generic_using_anyway"
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
      const isGeneric = isTooGenericName(sanitized);
      const tokens = tokenizeName(sanitized);
      const genericTokens = tokens.filter(t => GENERIC_STOP_WORDS.includes(t));
      const brandTokens = tokens.filter(t => BRAND_WORDS.includes(t));
      
      if (sanitized.length >= minLen && !isGeneric) {
        Logger.info("[BASENAME] source=fallback", {
          rawTitle: keywordName,
          baseName: sanitized,
          length: sanitized.length,
          tokens,
          brandTokens: brandTokens.length > 0 ? brandTokens : undefined,
          reason: "keywords_from_prompt_no_channel_no_timestamp"
        });
        return {
          baseName: sanitized,
          source: "fallback",
          rawTitle: keywordName,
          reason: "keywords_from_prompt_no_channel_no_timestamp"
        };
      } else if (sanitized.length >= minLen && isGeneric && brandTokens.length > 0) {
        // Если есть бренд, используем даже если generic
        Logger.warn("[BASENAME] source=fallback with brand, using despite generic", {
          rawTitle: keywordName,
          baseName: sanitized,
          length: sanitized.length,
          tokens,
          genericTokens,
          brandTokens,
          reason: "keywords_with_brand_using_despite_generic"
        });
        return {
          baseName: sanitized,
          source: "fallback",
          rawTitle: keywordName,
          reason: "keywords_with_brand_using_despite_generic"
        };
      }
    }
  }

  // Если ничего не помогло - используем generic "video" с случайным суффиксом (БЕЗ channelSlug и БЕЗ даты!)
  const randomWord = Math.random().toString(36).substring(2, 8);
  const finalFallback = `video_${randomWord}`;
  const tokens = tokenizeName(finalFallback);

  Logger.warn("[BASENAME] source=fallback", {
    rawTitle: finalFallback,
    baseName: finalFallback.substring(0, maxLen),
    tokens,
    reason: "final_fallback_video_random_no_channel_no_timestamp"
  });

  return {
    baseName: finalFallback.substring(0, maxLen),
    source: "fallback",
    rawTitle: finalFallback,
    reason: "final_fallback_video_random_no_channel_no_timestamp"
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

/**
 * Генерирует короткий стабильный ID для имени файла
 * Формат: 6 символов [a-z0-9]
 */
function generateShortId(): string {
  // Используем timestamp + random для уникальности
  const timestamp = Date.now().toString(36); // base36 для компактности
  const random = Math.random().toString(36).substring(2, 8);
  // Комбинируем и берём первые 6 символов
  const combined = (timestamp + random).replace(/[^a-z0-9]/g, '').substring(0, 6);
  // Если получилось меньше 6, дополняем случайными символами
  if (combined.length < 6) {
    const padding = Math.random().toString(36).substring(2, 2 + (6 - combined.length));
    return (combined + padding).substring(0, 6);
  }
  return combined.substring(0, 6);
}

/**
 * ЕДИНАЯ функция генерации имени файла для автоматизации
 * ВСЕГДА возвращает формат: video_<shortId>.mp4
 * 
 * @param params - Параметры генерации
 * @param params.source - Источник файла (для логирования)
 * @param params.channelId - ID канала (для логирования)
 * @param params.userId - ID пользователя (для логирования)
 * @param params.targetDir - Директория для проверки коллизий
 * @returns Имя файла в формате video_<shortId>.mp4 (с расширением)
 */
export async function generateVideoFilename(params: {
  source: string;
  channelId: string;
  userId: string;
  targetDir: string;
}): Promise<string> {
  const { source, channelId, userId, targetDir } = params;
  
  // Генерируем короткий ID
  const shortId = generateShortId();
  const baseName = `video_${shortId}`;
  
  // Проверяем коллизии и получаем финальное имя
  const finalBaseName = await resolveCollision(targetDir, baseName, ".mp4");
  const finalFileName = `${finalBaseName}.mp4`;
  
  // Детальное логирование
  const collisionDetected = finalBaseName !== baseName;
  Logger.info("[FILENAME] Generated video filename for automation", {
    source,
    channelId,
    userId,
    requestedName: baseName,
    finalName: finalFileName,
    reason: collisionDetected ? "collision_resolved" : "standard",
    shortId,
    collisionDetected
  });
  
  return finalFileName;
}

/**
 * Проверяет, является ли имя файла title-based (неправильным для автоматизации)
 * Правильные имена: video_<shortId>.mp4 (где shortId - 6 символов [a-z0-9])
 * Неправильные: длинные имена с подчёркиваниями, содержащие слова
 */
export function isTitleBasedFilename(fileName: string): boolean {
  // Убираем расширение
  const nameWithoutExt = fileName.replace(/\.mp4$/i, '');
  
  // Правильный формат: video_<6 символов [a-z0-9]>
  const correctPattern = /^video_[a-z0-9]{6}$/i;
  
  if (correctPattern.test(nameWithoutExt)) {
    return false; // Правильное имя
  }
  
  // Если начинается с video_ но не соответствует паттерну - возможно с суффиксом коллизии
  if (nameWithoutExt.startsWith('video_')) {
    const withSuffixPattern = /^video_[a-z0-9]{6}_\d+$/i;
    if (withSuffixPattern.test(nameWithoutExt)) {
      return false; // Правильное имя с суффиксом коллизии
    }
  }
  
  // Если имя длиннее 20 символов (без расширения) - скорее всего title-based
  if (nameWithoutExt.length > 20) {
    return true;
  }
  
  // Если содержит более 2 подчёркиваний (кроме video_<id>_<suffix>) - title-based
  const underscoreCount = (nameWithoutExt.match(/_/g) || []).length;
  if (underscoreCount > 2) {
    return true;
  }
  
  // Если не начинается с "video_" - точно не наш формат
  if (!nameWithoutExt.toLowerCase().startsWith('video_')) {
    return true;
  }
  
  return false;
}

/**
 * Нормализует входящий файл с "плохим" именем в правильный формат
 * Переименовывает файл из title-based имени в video_<shortId>.mp4
 * 
 * @param filePath - Полный путь к файлу
 * @param fileName - Текущее имя файла
 * @param targetDir - Директория, где находится файл
 * @param channelId - ID канала (для логирования)
 * @param userId - ID пользователя (для логирования)
 * @returns Новое имя файла в формате video_<shortId>.mp4
 */
export async function normalizeIncomingFilename(
  filePath: string,
  fileName: string,
  targetDir: string,
  channelId: string,
  userId: string
): Promise<string> {
  Logger.warn("[FILENAME][WARN] Title-based filename detected, normalizing", {
    source: "inbox_monitor",
    channelId,
    userId,
    oldFileName: fileName,
    filePath
  });
  
  // Генерируем новое правильное имя
  const newFileName = await generateVideoFilename({
    source: "normalize_incoming",
    channelId,
    userId,
    targetDir
  });
  
  const newFilePath = path.join(targetDir, newFileName);
  
  try {
    // Переименовываем файл
    await fs.rename(filePath, newFilePath);
    
    Logger.info("[FILENAME] File normalized successfully", {
      source: "normalize_incoming",
      channelId,
      userId,
      oldFileName: fileName,
      newFileName,
      oldPath: filePath,
      newPath: newFilePath
    });
    
    return newFileName;
  } catch (error: any) {
    Logger.error("[FILENAME] Failed to normalize file", {
      source: "normalize_incoming",
      channelId,
      userId,
      oldFileName: fileName,
      newFileName,
      error: error?.message || String(error)
    });
    throw error;
  }
}

