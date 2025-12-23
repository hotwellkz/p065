import type { Channel, GenerationMode } from "../../domain/channel";
import { getCurrentPreferenceVariant } from "../preferencesUtils";

const PLATFORM_NAMES: Record<Channel["platform"], string> = {
  YOUTUBE_SHORTS: "YouTube Shorts",
  TIKTOK: "TikTok",
  INSTAGRAM_REELS: "Instagram Reels",
  VK_CLIPS: "VK Клипы"
};

const LANGUAGE_NAMES: Record<Channel["language"], string> = {
  ru: "русском",
  en: "English",
  kk: "қазақ"
};

/**
 * Определяет стиль съёмки на основе тона канала
 */
function getShootingStyle(tone: string, lang: Channel["language"]): string {
  const toneLower = tone.toLowerCase();
  
  const styles = {
    ru: {
      humor: "лёгкий, комедийный стиль",
      serious: "реалистичный, кинематографический стиль",
      kids: "яркий, игривый, семейный стиль",
      default: "реалистичный стиль"
    },
    en: {
      humor: "lighthearted, comedic style",
      serious: "realistic, cinematic style",
      kids: "bright, playful, family-friendly style",
      default: "realistic style"
    },
    kk: {
      humor: "жеңіл, комедиялық стиль",
      serious: "реалистік, кинематографиялық стиль",
      kids: "жарқын, ойыншық, отбасылық стиль",
      default: "реалистік стиль"
    }
  };

  const styleMap = styles[lang];
  
  if (toneLower.includes("юмор") || toneLower.includes("развлека") || toneLower.includes("humor") || toneLower.includes("entertain")) {
    return styleMap.humor;
  } else if (toneLower.includes("серьёз") || toneLower.includes("профессиональ") || toneLower.includes("serious") || toneLower.includes("professional")) {
    return styleMap.serious;
  } else if (toneLower.includes("детск") || toneLower.includes("kids") || toneLower.includes("child")) {
    return styleMap.kids;
  }
  
  return styleMap.default;
}

/**
 * Формирует системный промпт для генерации сценариев/промптов
 */
export function buildSystemPrompt(channel: Channel, mode: GenerationMode): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];
  const lang = channel.language;
  const shootingStyle = getShootingStyle(channel.tone, lang);

  const modeDescriptions = {
    ru: {
      script: "подробный сценарий",
      prompt: "сценарий + готовый VIDEO_PROMPT",
      "video-prompt-only": "только VIDEO_PROMPT"
    },
    en: {
      script: "detailed script",
      prompt: "script + ready VIDEO_PROMPT",
      "video-prompt-only": "only VIDEO_PROMPT"
    },
    kk: {
      script: "егжей-тегжейлі сценарий",
      prompt: "сценарий + дайын VIDEO_PROMPT",
      "video-prompt-only": "тек VIDEO_PROMPT"
    }
  };

  const modeDesc = modeDescriptions[lang][mode];

  const systemRole = {
    ru: "Ты — профессиональный сценарист коротких видеороликов для Google Veo 3.1 Fast.",
    en: "You are a professional scriptwriter for short videos for Google Veo 3.1 Fast.",
    kk: "Сіз Google Veo 3.1 Fast үшін қысқа бейнелердің кәсіби сценарисіз."
  };

  const taskDescription = {
    ru: `Твоя задача — создать ОДИН финальный промпт на ${languageName} языке, готовый для генерации реалистичного вертикального видео.`,
    en: `Your task is to create ONE final prompt in ${languageName}, ready for generating realistic vertical video.`,
    kk: `Сіздің міндетіңіз — ${languageName} тілінде бір финалдық промпт құрастыру, реалистік тік бейне генерациясына дайын.`
  };

  const formatInstruction = {
    ru: `Сформируй:
— если режим = "Сценарий": ${modeDescriptions.ru.script}
— если режим = "Сценарий + Промпт": ${modeDescriptions.ru.prompt}
— если режим = "Промпт для видео": ${modeDescriptions.ru["video-prompt-only"]}

Никаких пояснений. Никаких markdown. Только чистый текст.`,
    en: `Generate:
— if mode = "Script": ${modeDescriptions.en.script}
— if mode = "Script + Prompt": ${modeDescriptions.en.prompt}
— if mode = "Video Prompt Only": ${modeDescriptions.en["video-prompt-only"]}

No explanations. No markdown. Only clean text.`,
    kk: `Құрастыр:
— егер режим = "Сценарий": ${modeDescriptions.kk.script}
— егер режим = "Сценарий + Промпт": ${modeDescriptions.kk.prompt}
— егер режим = "Промпт для видео": ${modeDescriptions.kk["video-prompt-only"]}

Түсініктемелер жоқ. Markdown жоқ. Тек таза мәтін.`
  };

  // Формируем список настроек канала
  const settingsList: string[] = [];
  const settingsLabels = {
    ru: {
      tone: "Жанр/Стиль",
      duration: "Длительность",
      language: "Язык",
      niche: "Тип сцены/тематика",
      audience: "Целевая аудитория",
      blockedTopics: "Запрещённые темы",
      extraNotes: "Дополнительные пожелания автора"
    },
    en: {
      tone: "Genre/Style",
      duration: "Duration",
      language: "Language",
      niche: "Scene type/Topic",
      audience: "Target audience",
      blockedTopics: "Blocked topics",
      extraNotes: "Additional author's wishes"
    },
    kk: {
      tone: "Жанр/Стиль",
      duration: "Ұзақтық",
      language: "Тіл",
      niche: "Сцена түрі/Тақырып",
      audience: "Мақсатты аудитория",
      blockedTopics: "Тыйым салынған тақырыптар",
      extraNotes: "Автордың қосымша тілектері"
    }
  };

  const labels = settingsLabels[lang];
  let settingNumber = 1;

  settingsList.push(`${settingNumber++}. ${labels.tone}: ${channel.tone}`);
  settingsList.push(`${settingNumber++}. ${labels.duration}: ${channel.targetDurationSec} секунд`);
  settingsList.push(`${settingNumber++}. ${labels.language}: ${languageName}`);
  settingsList.push(`${settingNumber++}. ${labels.niche}: ${channel.niche}`);
  settingsList.push(`${settingNumber++}. ${labels.audience}: ${channel.audience}`);
  
  if (channel.blockedTopics) {
    settingsList.push(`${settingNumber++}. ${labels.blockedTopics}: ${channel.blockedTopics}`);
  }
  
  // Используем preferences если они есть, иначе fallback на extraNotes для обратной совместимости
  const preferenceText = channel.preferences 
    ? getCurrentPreferenceVariant(channel.preferences)
    : channel.extraNotes;
  
  if (preferenceText) {
    settingsList.push(`${settingNumber++}. ${labels.extraNotes}:\n\n${preferenceText}`);
  }

  return `${systemRole[lang]}

${taskDescription[lang]}

Используй настройки канала:

${settingsList.join("\n")}

${formatInstruction[lang]}

Не добавляй ничего, что не указано в настройках канала.
Не меняй смысл и содержание дополнительных пожеланий.`;
}

/**
 * Формирует пользовательский промпт на основе настроек канала
 * Использует ТОЛЬКО настройки канала, без добавления своих условий
 */
export function buildUserPrompt(channel: Channel, mode: GenerationMode, idea?: string): string {
  const platformName = PLATFORM_NAMES[channel.platform];
  const languageName = LANGUAGE_NAMES[channel.language];
  const lang = channel.language;

  const baseInstructions = {
    ru: `Используй настройки канала:
Язык: ${languageName}
Длительность: ${channel.targetDurationSec} секунд
Тематика: ${channel.niche}
Стиль/тон: ${channel.tone}
Целевая аудитория: ${channel.audience}`,
    en: `Use channel settings:
Language: ${languageName}
Duration: ${channel.targetDurationSec} seconds
Topic: ${channel.niche}
Style/tone: ${channel.tone}
Target audience: ${channel.audience}`,
    kk: `Арна параметрлерін пайдалан:
Тіл: ${languageName}
Ұзақтық: ${channel.targetDurationSec} секунд
Тақырып: ${channel.niche}
Стиль/тон: ${channel.tone}
Мақсатты аудитория: ${channel.audience}`
  };

  let userPrompt = baseInstructions[lang];

  if (channel.blockedTopics) {
    const blockedLabel = lang === "ru" ? "Запрещённые темы" : lang === "en" ? "Blocked topics" : "Тыйым салынған тақырыптар";
    userPrompt += `\n${blockedLabel}: ${channel.blockedTopics}`;
  }

  // Используем preferences если они есть, иначе fallback на extraNotes для обратной совместимости
  const preferenceText = channel.preferences 
    ? getCurrentPreferenceVariant(channel.preferences)
    : channel.extraNotes;

  if (preferenceText) {
    const notesLabel = lang === "ru" ? "Дополнительные пожелания" : lang === "en" ? "Additional notes" : "Қосымша ескертулер";
    userPrompt += `\n\n${notesLabel}:\n${preferenceText}`;
  }

  if (idea) {
    const ideaLabel = lang === "ru" ? "Идея ролика" : lang === "en" ? "Video idea" : "Бейне идеясы";
    userPrompt += `\n\n${ideaLabel}: "${idea}"`;
  }

  // Добавляем инструкцию по режиму
  const modeInstructions = {
    ru: {
      script: "\n\nСформируй подробный сценарий с репликами и действиями.",
      prompt: "\n\nСформируй подробный сценарий, а затем на его основе создай готовый VIDEO_PROMPT для Google Veo 3.1 Fast.",
      "video-prompt-only": "\n\nСформируй готовый VIDEO_PROMPT для Google Veo 3.1 Fast без текста сценария."
    },
    en: {
      script: "\n\nGenerate a detailed script with dialogue and actions.",
      prompt: "\n\nGenerate a detailed script, then create a ready VIDEO_PROMPT for Google Veo 3.1 Fast based on it.",
      "video-prompt-only": "\n\nGenerate a ready VIDEO_PROMPT for Google Veo 3.1 Fast without script text."
    },
    kk: {
      script: "\n\nЕгжей-тегжейлі сценарий құрастыр, репликалар мен әрекеттермен.",
      prompt: "\n\nЕгжей-тегжейлі сценарий құрастыр, содан кейін оның негізінде Google Veo 3.1 Fast үшін дайын VIDEO_PROMPT құрастыр.",
      "video-prompt-only": "\n\nGoogle Veo 3.1 Fast үшін дайын VIDEO_PROMPT құрастыр, сценарий мәтінінсіз."
    }
  };

  userPrompt += modeInstructions[lang][mode];
  
  // Добавляем важное напоминание
  const reminder = {
    ru: "\n\nНе добавляй ничего, что не указано в настройках канала. Не меняй смысл и содержание дополнительных пожеланий. Не пиши markdown. Только чистый текст.",
    en: "\n\nDo not add anything that is not specified in the channel settings. Do not change the meaning and content of additional notes. Do not write markdown. Only clean text.",
    kk: "\n\nАрна параметрлерінде көрсетілмеген ештеңе қоспа. Қосымша тілектердің мағынасы мен мазмұнын өзгертпе. Markdown жазба. Тек таза мәтін."
  };

  userPrompt += reminder[lang];

  return userPrompt;
}

/**
 * Универсальная функция для генерации промпта канала
 * Возвращает объект с systemPrompt и userPrompt
 */
export function generateChannelPrompt(
  channel: Channel,
  mode?: GenerationMode,
  idea?: string
): { systemPrompt: string; userPrompt: string } {
  const generationMode = mode || channel.generationMode || "script";
  
  return {
    systemPrompt: buildSystemPrompt(channel, generationMode),
    userPrompt: buildUserPrompt(channel, generationMode, idea)
  };
}

