import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "../crypto/aes";

const SESSION_FILE = path.join(process.cwd(), "telegram-session.enc");

export function saveSessionString(session: string): void {
  const encrypted = encrypt(session);
  fs.writeFileSync(SESSION_FILE, encrypted, { encoding: "utf8" });
}

/**
 * Загружает Telegram сессию из переменной окружения или файла
 * Приоритет: TELEGRAM_SESSION_ENCRYPTED (env) > telegram-session.enc (файл)
 */
export function loadSessionString(): string | null {
  // Сначала проверяем переменную окружения (для Cloud Run / продакшена)
  const envSession = process.env.TELEGRAM_SESSION_ENCRYPTED;
  if (envSession) {
    try {
      return decrypt(envSession);
    } catch (error) {
      console.error("Failed to decrypt TELEGRAM_SESSION_ENCRYPTED from env:", error);
      // Fallback к файлу, если расшифровка не удалась
    }
  }

  // Fallback: читаем из файла (для локальной разработки)
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }
  
  try {
    const encrypted = fs.readFileSync(SESSION_FILE, { encoding: "utf8" });
    return decrypt(encrypted);
  } catch (error) {
    console.error("Failed to load session from file:", error);
    return null;
  }
}

/**
 * Экспортирует зашифрованную сессию для использования в переменных окружения
 * Используйте эту функцию после успешного логина для получения значения TELEGRAM_SESSION_ENCRYPTED
 */
export function exportSessionForEnv(): string | null {
  const session = loadSessionString();
  if (!session) {
    return null;
  }
  
  // Возвращаем зашифрованную версию (та же, что в файле)
  if (fs.existsSync(SESSION_FILE)) {
    return fs.readFileSync(SESSION_FILE, { encoding: "utf8" });
  }
  
  // Если файла нет, но есть env переменная, возвращаем её
  return process.env.TELEGRAM_SESSION_ENCRYPTED || null;
}







