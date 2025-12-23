// Функция для проверки, является ли ошибка TIMEOUT от Telegram
function isTelegramTimeoutError(message: string, meta?: unknown[]): boolean {
  if (message?.includes("TIMEOUT") || message?.includes("Error: TIMEOUT")) {
    // Проверяем, что это ошибка из telegram библиотеки
    const stack = meta?.[0]?.toString() || "";
    if (stack.includes("telegram/client/updates") || stack.includes("telegram")) {
      return true;
    }
  }
  // Проверяем meta на наличие TIMEOUT
  if (meta && meta.length > 0) {
    const errorStr = JSON.stringify(meta);
    if (errorStr.includes("TIMEOUT") && errorStr.includes("telegram")) {
      return true;
    }
  }
  return false;
}

export class Logger {
  static info(message: string, ...meta: unknown[]) {
    console.log(message, ...meta);
  }

  static warn(message: string, ...meta: unknown[]) {
    console.warn(message, ...meta);
  }

  static error(message: string, ...meta: unknown[]) {
    // Пропускаем TIMEOUT ошибки от Telegram - они не критичны и забивают логи
    if (isTelegramTimeoutError(message, meta)) {
      return; // Не логируем эти ошибки
    }
    console.error(message, ...meta);
  }
}







