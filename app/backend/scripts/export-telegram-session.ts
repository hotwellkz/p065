#!/usr/bin/env ts-node
/**
 * Скрипт для экспорта Telegram сессии в формат для переменных окружения
 * 
 * Использование:
 *   npm run export:telegram-session
 * 
 * После успешного логина через npm run dev:login этот скрипт выведет
 * значение для переменной окружения TELEGRAM_SESSION_ENCRYPTED
 */

import "dotenv/config";
import { exportSessionForEnv } from "../src/telegram/sessionStore";

function main() {
  console.log("=== Экспорт Telegram сессии для Cloud Run ===\n");

  const encryptedSession = exportSessionForEnv();

  if (!encryptedSession) {
    console.error("❌ Ошибка: Telegram сессия не найдена.");
    console.log("\n💡 Сначала выполните авторизацию:");
    console.log("   npm run dev:login");
    console.log("\nПосле успешного логина запустите этот скрипт снова.");
    process.exit(1);
  }

  console.log("✅ Сессия найдена!\n");
  console.log("📋 Добавьте следующую переменную окружения в Cloud Run:\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`TELEGRAM_SESSION_ENCRYPTED=${encryptedSession}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  
  console.log("📝 Команда для добавления в Cloud Run (замените PROJECT_ID, REGION, SERVICE_NAME):");
  console.log(`\ngcloud run services update SERVICE_NAME \\`);
  console.log(`  --project=PROJECT_ID \\`);
  console.log(`  --region=REGION \\`);
  console.log(`  --update-env-vars="TELEGRAM_SESSION_ENCRYPTED=${encryptedSession}"\n`);
  
  console.log("⚠️  ВАЖНО: Храните это значение в секретах! Не коммитьте в Git!\n");
}

main();



