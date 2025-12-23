import type { ChannelPreferences, PreferenceVariant, PreferencesMode } from "../domain/channel";

/**
 * Получает текущий вариант пожеланий согласно режиму
 */
export function getCurrentPreferenceVariant(
  preferences: ChannelPreferences | undefined
): string {
  if (!preferences || preferences.variants.length === 0) {
    return "";
  }

  const { variants, mode, lastUsedIndex = 0 } = preferences;

  // Фильтруем пустые варианты
  const validVariants = variants.filter((v) => v.text.trim());
  if (validVariants.length === 0) {
    return "";
  }

  switch (mode) {
    case "fixed":
      // Всегда используем первый вариант
      return validVariants[0]?.text || "";

    case "random":
      // Случайный выбор
      const randomIndex = Math.floor(Math.random() * validVariants.length);
      return validVariants[randomIndex]?.text || "";

    case "cyclic":
    default:
      // Циклический выбор
      const currentIndex = lastUsedIndex % validVariants.length;
      const selectedVariant = validVariants[currentIndex];
      
      // Отладочный лог (только в development)
      if (import.meta.env.DEV) {
        console.log("getCurrentPreferenceVariant (cyclic):", {
          lastUsedIndex,
          variantsCount: validVariants.length,
          currentIndex,
          selectedText: selectedVariant?.text?.substring(0, 50) + "..."
        });
      }
      
      return selectedVariant?.text || "";
  }
}

/**
 * Получает следующий индекс для циклического режима
 */
export function getNextPreferenceIndex(
  preferences: ChannelPreferences | undefined
): number {
  if (!preferences || preferences.variants.length === 0) {
    return 0;
  }

  const { variants, mode, lastUsedIndex = 0 } = preferences;

  if (mode === "cyclic") {
    // Фильтруем пустые варианты для правильного вычисления
    const validVariants = variants.filter((v) => v.text.trim());
    if (validVariants.length === 0) {
      return 0;
    }
    return (lastUsedIndex + 1) % validVariants.length;
  }

  return lastUsedIndex;
}

/**
 * Создаёт новый вариант пожеланий
 */
export function createPreferenceVariant(
  text: string = "",
  order: number
): PreferenceVariant {
  return {
    id: crypto.randomUUID(),
    text,
    order
  };
}

/**
 * Обновляет lastUsedIndex после использования варианта
 */
export function updatePreferenceIndex(
  preferences: ChannelPreferences | undefined
): ChannelPreferences | undefined {
  if (!preferences || preferences.variants.length === 0) {
    return preferences;
  }

  const { mode } = preferences;

  if (mode === "cyclic") {
    return {
      ...preferences,
      lastUsedIndex: getNextPreferenceIndex(preferences)
    };
  }

  // Для random и fixed не обновляем индекс
  return preferences;
}

/**
 * Валидация preferences
 */
export function validatePreferences(
  preferences: ChannelPreferences | undefined
): { valid: boolean; error?: string } {
  if (!preferences) {
    return { valid: false, error: "Настройки пожеланий не найдены" };
  }

  if (preferences.variants.length === 0) {
    return { valid: false, error: "Должен быть хотя бы один вариант пожеланий" };
  }

  const emptyVariants = preferences.variants.filter((v) => !v.text.trim());
  if (emptyVariants.length > 0) {
    return {
      valid: false,
      error: "Все варианты пожеланий должны быть заполнены"
    };
  }

  return { valid: true };
}

