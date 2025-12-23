/**
 * Сервис для генерации сценариев через OpenAI API.
 * 
 * АВТОРИЗАЦИЯ:
 * - Все запросы к /api/prompt/openai требуют Firebase-авторизации
 * - Токен автоматически получается из Firebase Auth и добавляется в заголовок Authorization: Bearer <token>
 * - При ошибке 401 автоматически пытается обновить токен и повторить запрос
 * 
 * Если появилась ошибка 401:
 * 1. Убедитесь, что пользователь авторизован
 * 2. Проверьте Network tab в DevTools - должен быть заголовок Authorization
 * 3. Проверьте логи backend для деталей ошибки
 * 
 * Подробнее: см. AUTH_SETUP.md
 */

import type { Channel } from "../domain/channel";
import { getCurrentPreferenceVariant } from "../utils/preferencesUtils";
import { getAuth } from "firebase/auth";

const backendBaseUrl =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ||
  "http://localhost:8080";

/**
 * Получает актуальный токен авторизации из Firebase Auth.
 * 
 * Автоматически обновляет токен, если он истёк (через forceRefresh: true).
 * 
 * @throws {Error} Если пользователь не авторизован
 * @returns {Promise<string>} Firebase ID Token
 */
async function getAuthToken(forceRefresh = false): Promise<string> {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error("Пользователь не авторизован. Пожалуйста, войдите в систему.");
  }
  
  try {
    // Получаем токен, при необходимости принудительно обновляя его
    const token = await user.getIdToken(forceRefresh);
    
    // Проверяем, что токен не пустой
    if (!token || token.trim().length === 0) {
      throw new Error("Получен пустой токен авторизации");
    }
    
    return token;
  } catch (error) {
    // Если ошибка при получении токена, выбрасываем понятное сообщение
    if (error instanceof Error) {
      // Если это ошибка обновления токена (например, токен отозван)
      if (error.message.includes("auth/user-token-expired") || error.message.includes("auth/user-disabled")) {
        throw new Error("Сессия истекла. Пожалуйста, войдите в систему заново.");
      }
      throw error;
    }
    throw new Error("Ошибка получения токена авторизации");
  }
}

/**
 * Выполняет запрос к OpenAI через backend с автоматической авторизацией.
 * 
 * Автоматически:
 * - Получает актуальный Firebase токен
 * - Добавляет заголовок Authorization: Bearer <token>
 * - При ошибке 401 пытается один раз обновить токен и повторить запрос
 * - Возвращает понятные сообщения об ошибках
 * 
 * @param {Record<string, unknown>} requestBody - Тело запроса для OpenAI API
 * @returns {Promise<any>} Ответ от OpenAI API
 * @throws {Error} При ошибках авторизации, сети или API
 */
async function callOpenAIProxy(
  requestBody: Record<string, unknown>
): Promise<any> {
  const url = `${backendBaseUrl}/api/prompt/openai`;
  
  // Получаем токен авторизации (без принудительного обновления)
  let token: string;
  try {
    token = await getAuthToken(false);
    
    // Логируем для отладки (только в development)
    if (import.meta.env.DEV) {
      console.log("🔑 callOpenAIProxy: получен токен", {
        tokenLength: token.length,
        tokenPreview: token.substring(0, 20) + "..."
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка получения токена авторизации";
    console.error("❌ callOpenAIProxy: ошибка получения токена", error);
    throw new Error(`${message} Войдите в систему, чтобы генерировать сценарии.`);
  }

  // Выполняем запрос с возможностью одного retry при 401
  const makeRequest = async (authToken: string, isRetry = false): Promise<any> => {
    // Логируем запрос для отладки (только в development)
    if (import.meta.env.DEV && !isRetry) {
      console.log("📤 callOpenAIProxy: отправка запроса", {
        url,
        hasToken: !!authToken,
        tokenLength: authToken.length,
        isRetry
      });
    }
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(requestBody)
    });
    
    // Логируем ответ для отладки (только в development)
    if (import.meta.env.DEV) {
      console.log("📥 callOpenAIProxy: получен ответ", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        isRetry
      });
    }

    let data: any = {};
    try {
      data = await response.json();
    } catch (parseError) {
      // Если не удалось распарсить JSON, используем пустой объект
      data = {};
    }

    if (!response.ok) {
      // Функция для безопасного извлечения строки из ошибки
      const getErrorMessage = (errorData: any): string => {
        if (typeof errorData === "string") {
          return errorData;
        }
        if (errorData && typeof errorData === "object") {
          return errorData.message || errorData.error || JSON.stringify(errorData);
        }
        return "";
      };

      // Специальная обработка для 401 (Unauthorized)
      if (response.status === 401) {
        // Если это первая попытка (не retry), пытаемся обновить токен и повторить один раз
        if (!isRetry) {
          try {
            // Принудительно обновляем токен
            const refreshedToken = await getAuthToken(true);
            // Повторяем запрос с новым токеном, помечая что это retry
            return makeRequest(refreshedToken, true);
          } catch (refreshError) {
            // Если не удалось обновить токен, выбрасываем ошибку
            const refreshMessage = refreshError instanceof Error ? refreshError.message : "Ошибка обновления токена";
            throw new Error(
              `Ошибка авторизации: ${refreshMessage}. Пожалуйста, войдите в систему заново.`
            );
          }
        } else {
          // Если это уже retry, значит обновление токена не помогло - выбрасываем ошибку
          const errorMsg = getErrorMessage(data.message) || getErrorMessage(data.error);
          throw new Error(
            errorMsg || 
            "Ошибка авторизации. Пожалуйста, войдите в систему заново."
          );
        }
      }
      
      // Специальная обработка для 504 (Gateway Timeout)
      if (response.status === 504) {
        const errorMsg = getErrorMessage(data.error);
        throw new Error(
          errorMsg ||
            "Превышено время ожидания ответа от OpenAI API. Попробуйте сократить запрос или использовать более быструю модель (например, gpt-4o-mini)."
        );
      }

      // Обработка других ошибок
      const errorMsg = getErrorMessage(data.error) || getErrorMessage(data.message);
      throw new Error(
        errorMsg ||
          `Ошибка API: ${response.status} ${response.statusText}`
      );
    }

    return data;
  };

  return makeRequest(token, false);
}

export interface ScriptSection {
  hook?: string;
  mainAction?: string;
  finale?: string;
  onScreenText?: string;
  voiceover?: string;
  sounds?: string;
}

export interface GeneratedScript {
  sections: ScriptSection;
  rawText: string;
}

export interface AutoGeneratedResult {
  idea: string;
  scripts: string[];
  rawText: string;
}

// Новый формат для детальных сценариев
export interface DialogLine {
  character: string;
  text: string;
}

export interface ScenarioStep {
  secondFrom: number;
  secondTo: number;
  description: string;
  dialog: DialogLine[];
}

export interface DetailedScenario {
  title: string;
  durationSeconds: number;
  steps: ScenarioStep[];
}

export interface GenerationResponse {
  mode: "script" | "prompt" | "video-prompt-only";
  scenarios: DetailedScenario[];
  videoPrompt: string | null;
  fileTitle?: string; // Короткое название ролика для использования как имя файла
  rawText: string;
}

const PLATFORM_NAMES: Record<Channel["platform"], string> = {
  YOUTUBE_SHORTS: "YouTube Shorts",
  TIKTOK: "TikTok",
  INSTAGRAM_REELS: "Instagram Reels",
  VK_CLIPS: "VK Клипы"
};

/**
 * Очищает название файла от запрещённых символов и нормализует его
 * @param title - исходное название
 * @returns безопасное название для использования как имя файла
 */
function sanitizeFileName(title: string): string {
  if (!title || typeof title !== "string") {
    return `ShortsAI_Video_${Date.now()}`;
  }

  // Убираем запрещённые символы: \ / : * ? " < > | !
  let safeTitle = title
    .replace(/[\\/:*?"<>|!]/g, "") // убираем запрещённые символы
    .replace(/[^\w\s\-_]/g, "") // убираем все остальные спецсимволы кроме букв, цифр, пробелов, дефисов и подчёркиваний
    .replace(/\s+/g, " ") // нормализуем пробелы
    .trim();

  // Если строка стала пустой, используем fallback
  if (!safeTitle || safeTitle.length === 0) {
    return `ShortsAI_Video_${Date.now()}`;
  }

  // Обрезаем до 60 символов
  if (safeTitle.length > 60) {
    safeTitle = safeTitle.substring(0, 60).trim();
  }

  // Убираем точки в конце
  safeTitle = safeTitle.replace(/\.+$/, "");

  return safeTitle || `ShortsAI_Video_${Date.now()}`;
}

const LANGUAGE_NAMES: Record<Channel["language"], string> = {
  ru: "русском",
  en: "English",
  kk: "қазақ"
};

function buildSystemPrompt(channel: Channel): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];

  return `Ты — профессиональный сценарист для коротких вертикальных видео (${platformName}).

Твоя задача — создавать структурированные сценарии, адаптированные под следующие параметры:

**Платформа:** ${platformName}
**Длительность:** ${channel.targetDurationSec} секунд
**Язык:** ${languageName}
**Ниша:** ${channel.niche}
**Целевая аудитория:** ${channel.audience}
**Тон/Стиль:** ${channel.tone}
${channel.blockedTopics ? `**Запрещённые темы:** ${channel.blockedTopics}` : ""}
${(() => {
  const preferenceText = channel.preferences 
    ? getCurrentPreferenceVariant(channel.preferences)
    : channel.extraNotes;
  return preferenceText ? `**Дополнительные пожелания:** ${preferenceText}` : "";
})()}

**Требования к формату ответа:**

Верни JSON объект со следующей структурой:
{
  "hook": "Завязка (первые 2-3 секунды, должна зацепить внимание)",
  "mainAction": "Основное действие (развитие сюжета, ключевые моменты)",
  "finale": "Финал (кульминация, призыв к действию, запоминающийся момент)",
  "onScreenText": "Текст на экране (субтитры, ключевые фразы)",
  "voiceover": "Реплики/голос за кадром (точный текст для озвучки)",
  "sounds": "Рекомендации по звукам/музыке (описание атмосферы, эффекты)"
}

**Важно:**
- Сценарий должен точно укладываться в ${channel.targetDurationSec} секунд
- Используй тон "${channel.tone}"
- Учитывай целевую аудиторию: ${channel.audience}
- Адаптируй под специфику ${platformName}
- ${channel.blockedTopics ? `Избегай тем: ${channel.blockedTopics}` : ""}
- Все тексты должны быть на ${languageName} языке

Верни ТОЛЬКО валидный JSON, без дополнительных комментариев.`;
}

function parseScriptResponse(responseText: string): ScriptSection {
  try {
    // Пытаемся найти JSON в ответе (на случай, если есть дополнительные комментарии)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        hook: parsed.hook || "",
        mainAction: parsed.mainAction || "",
        finale: parsed.finale || "",
        onScreenText: parsed.onScreenText || "",
        voiceover: parsed.voiceover || "",
        sounds: parsed.sounds || ""
      };
    }
    throw new Error("JSON не найден в ответе");
  } catch (error) {
    // Если парсинг не удался, возвращаем структурированный текст
    console.error("Ошибка парсинга JSON:", error);
    return {
      hook: "",
      mainAction: responseText,
      finale: "",
      onScreenText: "",
      voiceover: "",
      sounds: ""
    };
  }
}

export async function generateShortScript(
  channel: Channel,
  idea: string
): Promise<GeneratedScript> {
  const systemPrompt = buildSystemPrompt(channel);
  const userPrompt = `Создай сценарий для короткого видео на тему: "${idea}"`;

  const model = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";
  
  // response_format поддерживается не всеми моделями
  const supportsJsonMode = model.includes("gpt-4") || model.includes("o3");
  
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    temperature: 0.8,
    max_tokens: 1500
  };

  if (supportsJsonMode) {
    requestBody.response_format = { type: "json_object" };
  }

  try {
    const data = await callOpenAIProxy(requestBody);
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    const sections = parseScriptResponse(content);

    return {
      sections,
      rawText: content
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Неизвестная ошибка при генерации сценария");
  }
}

function buildAutoGeneratePrompt(channel: Channel): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];

  // Получаем вариант пожеланий
  const preferenceText = channel.preferences 
    ? getCurrentPreferenceVariant(channel.preferences)
    : channel.extraNotes;

  // Логируем для отладки
  if (import.meta.env.DEV) {
    console.log("🔍 buildAutoGeneratePrompt - Channel context:", {
      channelName: channel.name,
      niche: channel.niche,
      tone: channel.tone,
      audience: channel.audience,
      language: languageName,
      platform: platformName,
      duration: channel.targetDurationSec,
      blockedTopics: channel.blockedTopics?.substring(0, 50) + "...",
      hasPreferences: !!channel.preferences,
      preferencesMode: channel.preferences?.mode,
      preferencesLastIndex: channel.preferences?.lastUsedIndex,
      preferencesVariantsCount: channel.preferences?.variants.length,
      selectedPreferenceText: preferenceText?.substring(0, 100) + "...",
      hasExtraNotes: !!channel.extraNotes
    });
    
    if (channel.preferences && channel.preferences.variants.length > 0) {
      console.log("📋 All preference variants:", channel.preferences.variants.map((v, i) => ({
        index: i,
        id: v.id,
        text: v.text.substring(0, 80) + "...",
        order: v.order
      })));
    }
  }

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

function parseAutoGenerateResponse(responseText: string): AutoGeneratedResult {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        idea: parsed.idea || "",
        scripts: Array.isArray(parsed.scripts) ? parsed.scripts : [],
        rawText: responseText
      };
    }
    throw new Error("JSON не найден в ответе");
  } catch (error) {
    console.error("Ошибка парсинга JSON:", error);
    // Fallback: пытаемся извлечь идею и сценарии из текста
    const lines = responseText.split("\n").filter((line) => line.trim());
    const ideaMatch = responseText.match(/иде[яи][:]\s*(.+?)(?:\n|$)/i);
    const scripts: string[] = [];
    
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
      scripts: scripts.length > 0 ? scripts : [responseText],
      rawText: responseText
    };
  }
}

/**
 * Генерирует автоматическую идею и сценарии для канала через OpenAI API.
 * 
 * АВТОРИЗАЦИЯ:
 * - Использует callOpenAIProxy, который автоматически добавляет Firebase токен
 * - Требует авторизованного пользователя
 * 
 * @param {Channel} channel - Канал для генерации идеи
 * @returns {Promise<AutoGeneratedResult>} Результат с идеей и сценариями
 * @throws {Error} При ошибках авторизации, сети или API
 */
export async function generateAutoIdeaAndScripts(
  channel: Channel
): Promise<AutoGeneratedResult> {
  const systemPrompt = buildAutoGeneratePrompt(channel);
  
  // Персонализированный user prompt с акцентом на уникальность
  const userPrompt = channel.name 
    ? `Создай уникальную идею и сценарии для канала "${channel.name}". Идея должна быть строго связана с тематикой "${channel.niche}" и тоном "${channel.tone}". Избегай общих шаблонов.`
    : `Создай уникальную идею и сценарии для этого канала. Идея должна строго соответствовать тематике "${channel.niche}" и тону "${channel.tone}". Каждая генерация должна давать РАЗНУЮ идею.`;

  const model = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";
  
  const supportsJsonMode = model.includes("gpt-4") || model.includes("o3");
  
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt
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
    // Запрос к OpenAI через backend с автоматической авторизацией
    const data = await callOpenAIProxy(requestBody);
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    const result = parseAutoGenerateResponse(content);

    return result;
  } catch (error) {
    // Логируем ошибку для отладки
    console.error("generateAutoIdeaAndScripts error:", error);
    
    // Пробрасываем ошибку дальше с понятным сообщением
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Неизвестная ошибка при автогенерации идеи");
  }
}

function buildDetailedScriptPrompt(channel: Channel, idea?: string): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];
  const mode = channel.generationMode || "script";

  const ideaPart = idea
    ? `Идея ролика: "${idea}"`
    : "Придумай яркую идею ролика, которая подходит для этого канала.";

  return `Ты — профессиональный сценарист для коротких вертикальных видео (${platformName}).

Настройки канала:
- Платформа: ${platformName}
- Длительность: ${channel.targetDurationSec} секунд
- Язык: ${languageName}
- Ниша: ${channel.niche}
- Целевая аудитория: ${channel.audience}
- Тон/Стиль: ${channel.tone}
${channel.blockedTopics ? `- Запрещённые темы: ${channel.blockedTopics}` : ""}
${(() => {
  const preferenceText = channel.preferences 
    ? getCurrentPreferenceVariant(channel.preferences)
    : channel.extraNotes;
  return preferenceText ? `- Дополнительные пожелания: ${preferenceText}` : "";
})()}

${ideaPart}

**Задача:**

Создай 1-3 детальных сценария. Каждый сценарий должен быть разбит на шаги с указанием временных отрезков (secondFrom, secondTo) в пределах ${channel.targetDurationSec} секунд.

**Формат ответа (JSON):**

{
  "scenarios": [
    {
      "title": "Сценарий 1",
      "durationSeconds": ${channel.targetDurationSec},
      "steps": [
        {
          "secondFrom": 0,
          "secondTo": 2,
          "description": "Детальное описание того, что происходит в кадре: камера, действие, эмоции, персонажи",
          "dialog": [
            { "character": "ПЕРСОНАЖ_1", "text": "Точный текст реплики на ${languageName}" },
            { "character": "ПЕРСОНАЖ_2", "text": "Точный текст реплики на ${languageName}" }
          ]
        },
        {
          "secondFrom": 2,
          "secondTo": 4,
          "description": "...",
          "dialog": []
        }
        // Продолжай до ${channel.targetDurationSec} секунд
      ]
    }
  ]
}

**Важно:**
- Каждый шаг должен точно укладываться в указанный временной диапазон
- Все шаги вместе должны покрывать всю длительность (0-${channel.targetDurationSec} сек)
- В description описывай: что в кадре, движение камеры, эмоции, действия
- В dialog указывай персонажа и точный текст реплики на ${languageName}
- Используй тон "${channel.tone}"
- Адаптируй под специфику ${platformName}
${channel.blockedTopics ? `- Избегай тем: ${channel.blockedTopics}` : ""}
${(() => {
  const preferenceText = channel.preferences 
    ? getCurrentPreferenceVariant(channel.preferences)
    : channel.extraNotes;
  return preferenceText ? `- Учитывай дополнительные пожелания: ${preferenceText}` : "";
})()}

Верни ТОЛЬКО валидный JSON, без дополнительных комментариев.`;
}

function buildVideoPromptPrompt(
  channel: Channel,
  scenarios: DetailedScenario[]
): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];
  const lang = channel.language;

  // Шаблоны для разных языков
  const templates = {
    ru: {
      systemRole: "Ты — эксперт по созданию промптов для генерации видео в Sora / Veo 3.1 Fast.",
      task: "На основе следующего сценария создай детальный VIDEO_PROMPT для генерации вертикального видео 9:16.",
      settings: "**Настройки канала:**",
      scenario: "**Сценарий:**",
      requirements: "**Требования к VIDEO_PROMPT:**",
      duration: `Укажи длительность: "${channel.targetDurationSec}-секундное видео, вертикальный формат 9:16"`,
      style: "Стиль съёмки (выбери на основе тона",
      styleOptions: {
        humor: "лёгкий, комедийный стиль",
        serious: "реалистичный, кинематографический стиль",
        kids: "яркий, игривый, семейный стиль",
        default: "реалистичный стиль"
      },
      location: "Локация и сеттинг:",
      locationDesc: "Укажи тип локации (кухня, улица, комната и т.д.)",
      season: "Укажи сезон/погоду если релевантно",
      characters: "Персонажи:",
      charactersDesc: "Опиши внешний вид главных персонажей",
      camera: "Движение камеры:",
      cameraOptions: {
        static: "статичная камера",
        handheld: "лёгкое движение камеры от руки",
        pan: "плавный панорамный кадр"
      },
      cameraDesc: "Выбери на основе динамики сценария",
      actions: "Действия по временным отрезкам:",
      actionsDesc: "Кратко опиши ключевые действия для каждого временного отрезка (0-2с, 2-4с и т.д.)",
      dialog: "Реплики:",
      dialogDesc: `Укажи, что персонажи говорят на ${languageName} языке`,
      dialogInclude: "Включи ключевые реплики из сценария",
      restrictions: "Запреты:",
      restrictionsText: "Без текстовых наложений, без субтитров, без логотипов, без водяных знаков",
      restrictionsScreen: "Без текста на экране",
      format: "**Формат ответа:**",
      formatDesc: "Верни ТОЛЬКО текст VIDEO_PROMPT, без дополнительных комментариев, без JSON, просто готовый промпт для Sora/Veo. ВСЁ должно быть на русском языке, включая все технические указания, описания и требования."
    },
    en: {
      systemRole: "You are an expert in creating prompts for video generation in Sora / Veo 3.1 Fast.",
      task: "Based on the following scenario, create a detailed VIDEO_PROMPT for generating vertical 9:16 video.",
      settings: "**Channel Settings:**",
      scenario: "**Scenario:**",
      requirements: "**VIDEO_PROMPT Requirements:**",
      duration: `Specify duration: "${channel.targetDurationSec}-second video, vertical 9:16 aspect ratio"`,
      style: "Shooting style (choose based on tone",
      styleOptions: {
        humor: "lighthearted, comedic style",
        serious: "realistic, cinematic style",
        kids: "bright, playful, family-friendly style",
        default: "realistic style"
      },
      location: "Location and setting:",
      locationDesc: "Specify location type (kitchen, street, room, etc.)",
      season: "Specify season/weather if relevant",
      characters: "Characters:",
      charactersDesc: "Describe the appearance of main characters",
      camera: "Camera movement:",
      cameraOptions: {
        static: "static camera",
        handheld: "slight handheld movement",
        pan: "smooth pan"
      },
      cameraDesc: "Choose based on scenario dynamics",
      actions: "Actions by time segments:",
      actionsDesc: "Briefly describe key actions for each time segment (0-2s, 2-4s, etc.)",
      dialog: "Dialogue:",
      dialogDesc: `Specify that characters speak in ${languageName}`,
      dialogInclude: "Include key dialogue from the scenario",
      restrictions: "Restrictions:",
      restrictionsText: "No text overlays, no subtitles, no logos, no watermarks",
      restrictionsScreen: "No text on screen",
      format: "**Response Format:**",
      formatDesc: "Return ONLY the VIDEO_PROMPT text, without additional comments, without JSON, just a ready prompt for Sora/Veo. EVERYTHING must be in English, including all technical instructions, descriptions and requirements."
    },
    kk: {
      systemRole: "Сіз Sora / Veo 3.1 Fast бейне генерациясы үшін промпттар құрастыру бойынша мамансыз.",
      task: "Келесі сценарий негізінде тік 9:16 бейне генерациясы үшін егжей-тегжейлі VIDEO_PROMPT құрастыр.",
      settings: "**Арна параметрлері:**",
      scenario: "**Сценарий:**",
      requirements: "**VIDEO_PROMPT талаптары:**",
      duration: `Ұзақтықты көрсет: "${channel.targetDurationSec} секундтық бейне, тік 9:16 формат"`,
      style: "Түсіру стилі (тон негізінде таңда",
      styleOptions: {
        humor: "жеңіл, комедиялық стиль",
        serious: "реалистік, кинематографиялық стиль",
        kids: "жарқын, ойыншық, отбасылық стиль",
        default: "реалистік стиль"
      },
      location: "Орналасу және декорация:",
      locationDesc: "Орналасу түрін көрсет (аспазхана, көше, бөлме және т.б.)",
      season: "Мезгіл/ауа райын релевантты болса көрсет",
      characters: "Кейіпкерлер:",
      charactersDesc: "Негізгі кейіпкерлердің сыртқы түрін сипатта",
      camera: "Камера қозғалысы:",
      cameraOptions: {
        static: "статикалық камера",
        handheld: "қолдан ұстағандағы жеңіл қозғалыс",
        pan: "тегіс панорамалық кадр"
      },
      cameraDesc: "Сценарий динамикасы негізінде таңда",
      actions: "Уақыт сегменттері бойынша әрекеттер:",
      actionsDesc: "Әр уақыт сегменті үшін негізгі әрекеттерді қысқаша сипатта (0-2с, 2-4с және т.б.)",
      dialog: "Репликалар:",
      dialogDesc: `Кейіпкерлер ${languageName} тілінде сөйлейтінін көрсет`,
      dialogInclude: "Сценарийден негізгі репликаларды қос",
      restrictions: "Тыйымдар:",
      restrictionsText: "Мәтін қабаттары жоқ, субтитрлер жоқ, логотиптер жоқ, су белгілері жоқ",
      restrictionsScreen: "Экранда мәтін жоқ",
      format: "**Жауап форматы:**",
      formatDesc: "Тек VIDEO_PROMPT мәтінін қайтар, қосымша түсініктемелерсіз, JSON-сыз, тек Sora/Veo үшін дайын промпт. БАРЛЫҒЫ қазақ тілінде болуы керек, барлық техникалық нұсқаулар, сипаттамалар және талаптарды қоса алғанда."
    }
  };

  const t = templates[lang] || templates.en;

  // Формируем текст сценария на нужном языке
  const scenarioLabel = lang === "ru" ? "Сценарий" : lang === "en" ? "Scenario" : "Сценарий";
  const dialogLabel = lang === "ru" ? "Реплики" : lang === "en" ? "Dialogue" : "Репликалар";
  const secondLabel = lang === "ru" ? "с" : lang === "en" ? "s" : "с";

  const scenariosText = scenarios
    .map(
      (scenario, idx) =>
        `${scenarioLabel} ${idx + 1}:\n${scenario.steps
          .map(
            (step) =>
              `${step.secondFrom}-${step.secondTo}${secondLabel}: ${step.description}${step.dialog.length > 0 ? ` | ${dialogLabel}: ${step.dialog.map((d) => `${d.character}: "${d.text}"`).join(", ")}` : ""}`
          )
          .join("\n")}`
    )
    .join("\n\n");

  // Определяем стиль на основе тона
  let styleText = t.styleOptions.default;
  const toneLower = channel.tone.toLowerCase();
  if (toneLower.includes("юмор") || toneLower.includes("развлека") || toneLower.includes("humor") || toneLower.includes("entertain")) {
    styleText = t.styleOptions.humor;
  } else if (toneLower.includes("серьёз") || toneLower.includes("профессиональ") || toneLower.includes("serious") || toneLower.includes("professional")) {
    styleText = t.styleOptions.serious;
  } else if (toneLower.includes("детск") || toneLower.includes("kids") || toneLower.includes("child")) {
    styleText = t.styleOptions.kids;
  }

  // Формируем текст настроек канала на нужном языке
  const platformLabel = lang === "ru" ? "Платформа" : lang === "en" ? "Platform" : "Платформа";
  const durationLabel = lang === "ru" ? "Длительность" : lang === "en" ? "Duration" : "Ұзақтық";
  const languageLabel = lang === "ru" ? "Язык" : lang === "en" ? "Language" : "Тіл";
  const nicheLabel = lang === "ru" ? "Ниша" : lang === "en" ? "Niche" : "Ниша";
  const toneLabel = lang === "ru" ? "Тон/Стиль" : lang === "en" ? "Tone/Style" : "Тон/Стиль";
  const blockedLabel = lang === "ru" ? "Запрещённые темы" : lang === "en" ? "Blocked topics" : "Тыйым салынған тақырыптар";
  const secondsLabel = lang === "ru" ? "секунд" : lang === "en" ? "seconds" : "секунд";

  const cameraOr = lang === "ru" ? "или" : lang === "en" ? "or" : "немесе";

  return `${t.systemRole}

${t.task}

${t.settings}
- ${platformLabel}: ${platformName}
- ${durationLabel}: ${channel.targetDurationSec} ${secondsLabel}
- ${languageLabel}: ${languageName}
- ${nicheLabel}: ${channel.niche}
- ${toneLabel}: ${channel.tone}
${channel.blockedTopics ? `- ${blockedLabel}: ${channel.blockedTopics}` : ""}

${t.scenario}
${scenariosText}

${t.requirements}

1. ${t.duration}

2. ${t.style} "${channel.tone}"):
   - ${styleText}

3. ${t.location}
   - ${t.locationDesc}
   - ${t.season}

4. ${t.characters}
   - ${t.charactersDesc}

5. ${t.camera}
   - "${t.cameraOptions.static}" ${cameraOr} "${t.cameraOptions.handheld}" ${cameraOr} "${t.cameraOptions.pan}"
   - ${t.cameraDesc}

6. ${t.actions}
   - ${t.actionsDesc}

7. ${t.dialog}
   - ${t.dialogDesc}
   - ${t.dialogInclude}

8. ${t.restrictions}
   - "${t.restrictionsText}"
   - "${t.restrictionsScreen}"

${t.format}

${t.formatDesc}

${lang === "ru" ? `⚠️ КРИТИЧЕСКИ ВАЖНО: Весь VIDEO_PROMPT должен быть написан ТОЛЬКО на русском языке. 
- Все описания сцены, действий, персонажей - на русском
- Все технические указания (длительность, формат, стиль, движение камеры) - на русском
- Все запреты и ограничения - на русском
- Реплики персонажей должны быть указаны как "говорит по-русски"
- Разрешены ТОЛЬКО названия моделей латиницей: Sora, Veo 3.1 Fast
- В конце НЕ добавляй английские фразы типа "Use this prompt for...". Если нужны инструкции - пиши их на русском` : lang === "en" ? `⚠️ CRITICALLY IMPORTANT: The entire VIDEO_PROMPT must be written ONLY in English.
- All scene descriptions, actions, characters - in English
- All technical instructions (duration, format, style, camera movement) - in English
- All restrictions and limitations - in English
- Character dialogue should be specified as "speaking in English"
- ONLY model names are allowed in Latin: Sora, Veo 3.1 Fast
- Do NOT add English phrases at the end like "Use this prompt for...". If instructions are needed - write them in English` : `⚠️ КРИТИКАЛЫҚ МАҢЫЗДЫ: Барлық VIDEO_PROMPT тек қазақ тілінде жазылуы керек.
- Барлық сцена сипаттамалары, әрекеттер, кейіпкерлер - қазақ тілінде
- Барлық техникалық нұсқаулар (ұзақтық, формат, стиль, камера қозғалысы) - қазақ тілінде
- Барлық тыйымдар мен шектеулер - қазақ тілінде
- Кейіпкерлер репликалары "қазақ тілінде айтады" деп көрсетілуі керек
- Тек модель атаулары латынша рұқсат етілген: Sora, Veo 3.1 Fast
- Соңында "Use this prompt for..." сияқты ағылшын тілді фразалар қоспа. Егер нұсқаулар қажет болса - оларды қазақ тілінде жаз`}

${lang === "ru" ? `Пример правильного промпта:
"${channel.targetDurationSec}-секундное вертикальное видео 9:16, реалистичный стиль. Российская кухня, зимний день. Статичная камера. 0-2 секунды: бабушка готовит завтрак. 2-4 секунды: бабушка говорит по-русски: 'Вот так нужно готовить'. Без текстовых наложений, без субтитров, без логотипов."` : lang === "en" ? `Example of correct prompt:
"${channel.targetDurationSec}-second vertical video 9:16, realistic style. American kitchen, winter day. Static camera. 0-2 seconds: grandmother cooking breakfast. 2-4 seconds: grandmother speaking in English: 'This is how you cook'. No text overlays, no subtitles, no logos."` : `Дұрыс промпт мысалы:
"${channel.targetDurationSec} секундтық тік бейне 9:16, реалистік стиль. Ресей аспазханасы, қыс күні. Статикалық камера. 0-2 секунд: апа таңғы ас дайындайды. 2-4 секунд: апа қазақ тілінде айтады: 'Осылай дайындау керек'. Мәтін қабаттары жоқ, субтитрлер жоқ, логотиптер жоқ."`}`;
}

function parseDetailedScriptResponse(responseText: string): DetailedScenario[] {
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.scenarios)) {
        return parsed.scenarios.map((scenario: any) => ({
          title: scenario.title || "Сценарий",
          durationSeconds: scenario.durationSeconds || 8,
          steps: Array.isArray(scenario.steps)
            ? scenario.steps.map((step: any) => ({
                secondFrom: step.secondFrom || 0,
                secondTo: step.secondTo || 0,
                description: step.description || "",
                dialog: Array.isArray(step.dialog)
                  ? step.dialog.map((d: any) => ({
                      character: d.character || "",
                      text: d.text || ""
                    }))
                  : []
              }))
            : []
        }));
      }
    }
    throw new Error("Неверный формат ответа");
  } catch (error) {
    console.error("Ошибка парсинга детального сценария:", error);
    // Fallback: создаём простой сценарий
    return [
      {
        title: "Сценарий 1",
        durationSeconds: 8,
        steps: [
          {
            secondFrom: 0,
            secondTo: 8,
            description: responseText.substring(0, 500),
            dialog: []
          }
        ]
      }
    ];
  }
}

/**
 * Генерирует детальные сценарии для канала через OpenAI API.
 * 
 * АВТОРИЗАЦИЯ:
 * - Использует callOpenAIProxy, который автоматически добавляет Firebase токен
 * - Требует авторизованного пользователя
 * 
 * @param {Channel} channel - Канал для генерации сценариев
 * @param {string} [idea] - Опциональная идея для сценария
 * @returns {Promise<GenerationResponse>} Результат с детальными сценариями
 * @throws {Error} При ошибках авторизации, сети или API
 */
export async function generateDetailedScripts(
  channel: Channel,
  idea?: string
): Promise<GenerationResponse> {

  const mode = channel.generationMode || "script";
  const model = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";
  const supportsJsonMode = model.includes("gpt-4") || model.includes("o3");

  // Если режим "video-prompt-only", генерируем только VIDEO_PROMPT и fileTitle без сценариев
  if (mode === "video-prompt-only") {
    // Создаем упрощенный сценарий для генерации VIDEO_PROMPT
    const simplifiedScenario = {
      title: idea || "Видео",
      durationSeconds: channel.targetDurationSec,
      steps: [
        {
          secondFrom: 0,
          secondTo: channel.targetDurationSec,
          description: idea || `Короткое вертикальное видео для ${PLATFORM_NAMES[channel.platform]}`,
          dialog: []
        }
      ]
    };

    const videoPromptText = buildVideoPromptPrompt(channel, [simplifiedScenario]);
    const languageName = LANGUAGE_NAMES[channel.language];

    // Создаем промпт для генерации VIDEO_PROMPT и fileTitle
    const systemPrompt = `${videoPromptText}

**ВАЖНО:** Верни ответ строго в JSON-формате с двумя полями:
1. "videoPrompt" — подробный промпт для генерации ${channel.targetDurationSec}-секундного видео
2. "fileTitle" — короткое название ролика, которое можно использовать как имя файла

**Требования к fileTitle:**
- Только буквы, цифры, пробелы, дефисы и подчёркивания
- Запрещены символы: \\ / : * ? " < > | ! и любые другие знаки пунктуации, кроме дефиса и подчёркивания
- Без двоеточий и восклицательных знаков
- Длина не более 60 символов
- Без точек в конце имени
- Без эмодзи
- Название должно передавать суть ролика (например: Babushka_gonitsya_za_medvedem или SipDom_Bystroye_stroitelstvo)
- На ${languageName} языке

**Формат ответа (строго JSON):**
{
  "videoPrompt": "...",
  "fileTitle": "..."
}`;

    const videoRequestBody: Record<string, unknown> = {
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: idea
            ? `Создай VIDEO_PROMPT и короткое название файла для идеи: "${idea}"`
            : "Создай VIDEO_PROMPT и короткое название файла для этого канала."
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };

    // Включаем JSON mode если поддерживается
    if (supportsJsonMode) {
      videoRequestBody.response_format = { type: "json_object" };
    }

    try {
      const videoData = await callOpenAIProxy(videoRequestBody);
      const responseContent = videoData.choices?.[0]?.message?.content || null;

      if (!responseContent) {
        throw new Error("Пустой ответ от OpenAI API при генерации VIDEO_PROMPT");
      }

      // Парсим JSON ответ
      let parsedResponse: { videoPrompt?: string; fileTitle?: string };
      try {
        parsedResponse = JSON.parse(responseContent);
      } catch (parseError) {
        // Если не JSON, считаем что это только videoPrompt
        parsedResponse = { videoPrompt: responseContent };
      }

      const videoPrompt = parsedResponse.videoPrompt || responseContent;
      let fileTitle = parsedResponse.fileTitle;

      // Очищаем и нормализуем fileTitle
      if (fileTitle) {
        fileTitle = sanitizeFileName(fileTitle);
      } else {
        // Генерируем fallback название на основе идеи или канала
        const fallbackBase = idea
          ? idea.substring(0, 40).replace(/[^\w\s\-_]/g, "").trim()
          : `${PLATFORM_NAMES[channel.platform]}_${channel.niche}`.substring(0, 40);
        fileTitle = sanitizeFileName(fallbackBase || `ShortsAI_Video_${Date.now()}`);
      }

      return {
        mode,
        scenarios: [], // Пустой массив сценариев
        videoPrompt,
        fileTitle,
        rawText: responseContent
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error("Неизвестная ошибка при генерации VIDEO_PROMPT");
    }
  }

  // Генерация сценариев (для режимов "script" и "prompt")
  const scriptPrompt = buildDetailedScriptPrompt(channel, idea);

  const scriptRequestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: scriptPrompt
      },
      {
        role: "user",
        content: idea
          ? `Создай детальный сценарий для идеи: "${idea}"`
          : "Создай детальный сценарий для этого канала."
      }
    ],
    temperature: 0.8,
    max_tokens: 3000
  };

  if (supportsJsonMode) {
    scriptRequestBody.response_format = { type: "json_object" };
  }

  try {
    // Генерация сценариев
    const scriptData = await callOpenAIProxy(scriptRequestBody);
    const scriptContent = scriptData.choices?.[0]?.message?.content;

    if (!scriptContent) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    const scenarios = parseDetailedScriptResponse(scriptContent);

    let videoPrompt: string | null = null;

    // Генерация VIDEO_PROMPT если режим "prompt"
    if (mode === "prompt" && scenarios.length > 0) {
      const videoPromptText = buildVideoPromptPrompt(channel, scenarios);

      const videoRequestBody: Record<string, unknown> = {
        model,
        messages: [
          {
            role: "system",
            content: videoPromptText
          },
          {
            role: "user",
            content: "Создай VIDEO_PROMPT для этого сценария."
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      };

      try {
        const videoData = await callOpenAIProxy(videoRequestBody);
        videoPrompt = videoData.choices?.[0]?.message?.content || null;
      } catch (error) {
        console.error("Ошибка при генерации VIDEO_PROMPT:", error);
        // Продолжаем без videoPrompt, если его генерация не удалась
      }
    }

    return {
      mode,
      scenarios,
      videoPrompt,
      rawText: scriptContent
    };
  } catch (error) {
    // Логируем ошибку для отладки
    console.error("generateDetailedScripts error:", error);
    
    // Пробрасываем ошибку дальше с понятным сообщением
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Неизвестная ошибка при генерации детального сценария");
  }
}

