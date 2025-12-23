import { Logger } from "../../utils/logger";

interface FieldHelpRequest {
  fieldKey: string;
  page: string;
  userQuestion: string;
  currentValue?: any;
  channelContext?: any;
}

/**
 * Получает базовое описание поля по его ключу
 */
function getBaseFieldDescription(fieldKey: string): string | undefined {
  const descriptions: Record<string, string> = {
    "channel.name": "Название канала - отображается в списке каналов и используется для идентификации",
    "channel.platform": "Платформа для публикации видео: YouTube Shorts, TikTok, Instagram Reels или VK Клипы",
    "channel.language": "Язык контента канала: русский, английский или казахский",
    "channel.targetDurationSec": "Целевая длительность видео в секундах: 8, 15, 30 или 60 секунд",
    "channel.niche": "Ниша канала - основная тематика контента (например: технологии, кулинария, путешествия)",
    "channel.audience": "Целевая аудитория - описание людей, для которых создаётся контент",
    "channel.tone": "Тон контента - стиль подачи материала (юмор, серьёзно, дерзко и т.д.)",
    "channel.blockedTopics": "Запрещённые темы - темы, которые нельзя использовать в контенте",
    "channel.preferences": "Дополнительные пожелания - варианты текста для включения в промпты",
    "channel.preferences.mode": "Режим выбора варианта дополнительных пожеланий: случайный (random), по очереди (cyclic) или все сразу (all)",
    "channel.generationMode": "Режим генерации: script (сценарий), prompt (детальный промпт) или video-prompt-only (только видео-промпт)",
    "channel.generationTransport": "Источник отправки промптов: telegram_global (общий аккаунт) или telegram_user (личный аккаунт)",
    "channel.telegramSyntaxPeer": "Username или ID чата Telegram бота Syntax, куда отправляются промпты. Формат: @username или числовой ID",
    "channel.youtubeUrl": "Ссылка на YouTube канал (опционально) - используется для контекста при генерации контента",
    "channel.tiktokUrl": "Ссылка на TikTok канал (опционально) - используется для контекста при генерации контента",
    "channel.instagramUrl": "Ссылка на Instagram аккаунт (опционально) - используется для контекста при генерации контента",
    "channel.googleDriveFolderId": "ID папки Google Drive, куда сохраняются видео из SyntX. Можно найти в URL папки после /folders/",
    "channel.autoSendEnabled": "Включена ли автоматическая отправка промптов по расписанию",
    "channel.timezone": "Временная зона для расписания автоматической отправки промптов (например: Asia/Almaty, Europe/Moscow)",
    "channel.autoSendSchedules": "Расписание автоматической отправки промптов - массив времён и дней недели. Каждое расписание содержит время, дни недели и количество промптов за запуск",
    "channel.autoSendSchedules.time": "Время отправки промптов в формате HH:MM (например: 12:00, 18:30). Учитывается временная зона канала",
    "channel.autoSendSchedules.daysOfWeek": "Дни недели для отправки промптов. Массив чисел от 0 (воскресенье) до 6 (суббота). Можно выбрать несколько дней",
    "channel.autoSendSchedules.promptsPerRun": "Количество промптов, которые будут отправлены за один запуск расписания. Значение от 1 до 10",
    "channel.blotataEnabled": "Включена ли автоматическая публикация видео через Blotato API",
    "channel.driveInputFolderId": "ID входной папки на сервере, где появляются готовые видео для этого канала. Система отслеживает новые файлы в этой папке перед автопубликацией через Blotato",
    "channel.driveArchiveFolderId": "ID архивной папки на сервере, куда перемещаются файлы после успешной публикации через Blotato",
    "channel.blotataApiKey": "API ключ для доступа к Blotato сервису. Формат: blt_... Если не указан, используется ключ из настроек сервера",
    "channel.blotataYoutubeId": "ID YouTube аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataTiktokId": "ID TikTok аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataInstagramId": "ID Instagram аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataFacebookId": "ID Facebook аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataFacebookPageId": "ID Facebook страницы в системе Blotato - числовой идентификатор страницы для публикации",
    "channel.blotataThreadsId": "ID Threads аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataTwitterId": "ID Twitter/X аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataLinkedinId": "ID LinkedIn аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataPinterestId": "ID Pinterest аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.blotataPinterestBoardId": "ID доски Pinterest в системе Blotato - числовой идентификатор конкретной доски для публикации",
    "channel.blotataBlueskyId": "ID Bluesky аккаунта в системе Blotato - числовой идентификатор площадки для публикации",
    "channel.uploadNotificationChatId": "Telegram chat ID для отправки уведомлений о загрузке видео на Google Drive. Если пусто, используется основной чат SyntX",
    "wizard.telegram_connection": "Шаг подключения Telegram в мастере создания канала. Позволяет привязать личный Telegram аккаунт для отправки промптов от имени пользователя",
    "wizard.google_drive_connection": "Шаг авторизации Google Drive в мастере создания канала. Позволяет подключить Google Drive для автоматической загрузки и хранения видео",
    "wizard.drive_folders": "Шаг создания папок Google Drive в мастере создания канала. Автоматически создаёт структуру папок для канала и настраивает права доступа"
  };

  return descriptions[fieldKey];
}

/**
 * Формирует системный промпт для OpenAI
 */
function buildSystemPrompt(): string {
  return `Ты — встроенный помощник приложения "Shorts AI Studio". Пользователь настраивает канал для автогенерации и публикации коротких видео.

Объясняй максимально понятно, простыми словами, с примерами, но технически корректно.

Всегда отвечай на русском языке.

Структура ответа:

1. Что это за поле и для чего оно нужно
   - Краткое описание назначения поля
   - В каком контексте оно используется

2. Как оно влияет на работу системы
   - Что происходит при изменении этого поля
   - Как это влияет на генерацию контента или публикацию

3. Как правильно настроить (шаги/советы)
   - Пошаговые рекомендации по заполнению
   - Что учитывать при настройке

4. Примеры удачных значений
   - Конкретные примеры хороших значений
   - Почему эти значения эффективны

5. Предупреждения и типичные ошибки
   - Частые ошибки при заполнении
   - Что может пойти не так и как этого избежать

Будь дружелюбным, но профессиональным. Используй примеры из реальной практики создания коротких видео.

Если пользователь находится в мастере создания канала (page = "wizard"), адаптируй ответ под контекст мастера: объясняй, зачем нужен этот шаг, как правильно его заполнить, и что будет дальше.`;
}

/**
 * Формирует пользовательский промпт с контекстом
 */
function buildUserPrompt(request: FieldHelpRequest): string {
  const { fieldKey, page, userQuestion, currentValue, channelContext } = request;
  
  const baseDescription = getBaseFieldDescription(fieldKey);
  
  let prompt = `Страница: ${page}\n`;
  prompt += `Ключ поля: ${fieldKey}\n\n`;
  
  if (baseDescription) {
    prompt += `Базовое описание поля: ${baseDescription}\n\n`;
  } else {
    prompt += `Базовое описание: нет подробного описания, опирайся на контекст и здравый смысл.\n\n`;
  }
  
  if (currentValue !== undefined && currentValue !== null) {
    prompt += `Текущее значение поля: ${JSON.stringify(currentValue)}\n\n`;
  }
  
  if (channelContext) {
    prompt += `Контекст:\n`;
    if (channelContext.context === "wizard") {
      prompt += `- Пользователь находится в мастере создания канала\n`;
      if (channelContext.step) prompt += `- Текущий шаг мастера: ${channelContext.step}\n`;
    }
    if (channelContext.name) prompt += `- Название канала: ${channelContext.name}\n`;
    if (channelContext.platform) prompt += `- Платформа: ${channelContext.platform}\n`;
    if (channelContext.language) prompt += `- Язык: ${channelContext.language}\n`;
    if (channelContext.niche) prompt += `- Ниша: ${channelContext.niche}\n`;
    if (channelContext.audience) prompt += `- Аудитория: ${channelContext.audience}\n`;
    if (channelContext.tone) prompt += `- Тон: ${channelContext.tone}\n`;
    if (channelContext.channelType) prompt += `- Тип канала: ${channelContext.channelType}\n`;
    if (channelContext.userLanguage) prompt += `- Язык пользователя: ${channelContext.userLanguage}\n`;
    prompt += `\n`;
  }
  
  prompt += `Вопрос пользователя: ${userQuestion}`;
  
  return prompt;
}

/**
 * Вызывает OpenAI для объяснения поля
 */
export async function explainFieldWithOpenAI(request: FieldHelpRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API ключ не настроен на сервере");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(request);

  const requestBody = {
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
    temperature: 0.3, // Низкая температура для более точных и последовательных ответов
    max_tokens: 1500
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 секунд таймаут

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
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    Logger.info("explainFieldWithOpenAI success", {
      fieldKey: request.fieldKey,
      tokensUsed: data.usage?.total_tokens
    });

    return content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Превышено время ожидания ответа от OpenAI. Попробуйте ещё раз.");
    }

    Logger.error("explainFieldWithOpenAI error", error);
    
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error("Неизвестная ошибка при обращении к OpenAI");
  }
}

interface SectionHelpRequest {
  sectionKey: "telegram_integration" | "google_drive_integration" | "profile" | "generate_drive_folders" | "blottata_api_key_default";
  page?: string;
  sectionTitle?: string;
  currentStatus?: string;
  question?: string;
  context?: any;
}

/**
 * Получает базовое описание секции по её ключу
 */
function getBaseSectionDescription(sectionKey: string): string | undefined {
  const descriptions: Record<string, string> = {
    "telegram_integration": "Интеграция с Telegram позволяет отправлять промпты для генерации контента от имени пользователя или системного аккаунта. Это необходимо для автоматической работы с ботом Syntax.",
    "google_drive_integration": "Интеграция с Google Drive позволяет автоматически загружать и хранить видео файлы, созданные системой. Это упрощает управление контентом и обеспечивает резервное копирование.",
    "generate_drive_folders": "Кнопка автоматического создания папок Google Drive для канала. Создаёт структуру папок и автоматически заполняет поля канала.",
    "profile": "Профиль пользователя содержит основную информацию об аккаунте: email, статус авторизации и настройки интеграций.",
    "blottata_api_key_default": "Поле для хранения API ключа Blotato по умолчанию. Этот ключ автоматически подставляется в настройки новых каналов, но может быть переопределён для конкретного канала. Blotato — это сервис для автоматической публикации видео в различные социальные сети."
  };

  return descriptions[sectionKey];
}

/**
 * Формирует системный промпт для объяснения секций
 */
function buildSectionSystemPrompt(): string {
  return `Ты — AI-помощник по настройке аккаунта сервиса для автогенерации и публикации видео.

Пользователь нажал кнопку помощи в секции настроек аккаунта.

Объясняй простым русским языком, что это за секция, зачем она нужна, как её правильно настроить и какие есть типичные ошибки.

Структура ответа (всегда по-русски, простым языком):

1. Что это за интеграция
   1–2 предложения: «Это нужно, чтобы …».

2. Что даёт пользователю
   3–5 пунктов: выгоды и сценарии («автоматическая отправка промптов», «автозагрузка видео в Google Drive» и т.п.).

3. Как подключить — по шагам
   Нумерованный список:
   1. нажмите кнопку «…»;
   2. подтвердите доступ;
   3. вернитесь сюда — статус станет «Привязан» и т.д.

4. Безопасность и права доступа
   Кратко: какие данные система получает, чего НЕ делает (не читает личные чаты и т.п.).

5. Если что-то пошло не так
   Типичные ошибки и что можно попробовать: переподключение, проверка правильного аккаунта, обновление страницы.

Будь дружелюбным, но профессиональным. Используй простые слова, короткие предложения, без сложных технических терминов.

Для section = "telegram_integration" опиши интеграцию с Telegram (для отправки промптов и сообщений от имени пользователя или системного аккаунта).
Для section = "google_drive_integration" опиши интеграцию с Google Drive (для автоматической загрузки и хранения видео/файлов).
Для section = "profile" коротко объясни, что здесь данные аккаунта и как их можно изменить.
Для section = "generate_drive_folders" объясни, что эта кнопка автоматически создаёт нужные папки на Google Drive для работы автоматизации:
— основную папку канала для готовых видео (название: "{channelName} — {channelId}")
— папку uploaded для архива (внутри основной папки)
После создания система сама заполняет все нужные поля канала (Google Drive Folder ID, ID входной папки, ID папки архива) и выдаёт права доступа сервис-аккаунту для автоматической загрузки видео.
Для section = "blottata_api_key_default" объясни, что это поле для хранения API ключа Blotato по умолчанию. Этот ключ автоматически подставляется в настройки новых каналов при их создании, но может быть переопределён для конкретного канала в его настройках. Blotato — это сервис для автоматической публикации видео в различные социальные сети (YouTube, TikTok, Instagram и др.). Если это поле оставить пустым, при создании новых каналов API ключ придётся указывать вручную для каждого канала.`;
}

/**
 * Формирует пользовательский промпт для секций
 */
function buildSectionUserPrompt(request: SectionHelpRequest): string {
  const { sectionKey, page, sectionTitle, currentStatus, question, context } = request;
  
  const baseDescription = getBaseSectionDescription(sectionKey);
  
  let prompt = `Секция: ${sectionTitle || sectionKey}\n`;
  prompt += `Ключ секции: ${sectionKey}\n`;
  if (page) {
    prompt += `Страница: ${page}\n`;
  }
  prompt += `\n`;
  
  if (baseDescription) {
    prompt += `Базовое описание: ${baseDescription}\n\n`;
  }
  
  if (currentStatus) {
    prompt += `Текущий статус: ${currentStatus}\n\n`;
  }
  
  if (context) {
    prompt += `Дополнительный контекст: ${JSON.stringify(context)}\n\n`;
  }
  
  if (question) {
    prompt += `Вопрос пользователя: ${question}\n\n`;
  }
  
  prompt += `Объясни эту секцию согласно структуре из системного промпта.`;
  
  return prompt;
}

/**
 * Вызывает OpenAI для объяснения секции
 */
export async function explainSectionWithOpenAI(request: SectionHelpRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OpenAI API ключ не настроен на сервере");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const systemPrompt = buildSectionSystemPrompt();
  const userPrompt = buildSectionUserPrompt(request);

  const requestBody = {
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
    temperature: 0.3,
    max_tokens: 2000
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
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Пустой ответ от OpenAI API");
    }

    Logger.info("explainSectionWithOpenAI success", {
      sectionKey: request.sectionKey,
      tokensUsed: data.usage?.total_tokens
    });

    return content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Превышено время ожидания ответа от OpenAI. Попробуйте ещё раз.");
    }

    Logger.error("explainSectionWithOpenAI error", error);
    
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error("Неизвестная ошибка при обращении к OpenAI");
  }
}

