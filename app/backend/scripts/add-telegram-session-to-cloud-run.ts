#!/usr/bin/env ts-node
/**
 * Скрипт для автоматического добавления Telegram сессии в Cloud Run
 * 
 * Использование:
 *   npm run add:telegram-session:cloud-run [SERVICE_NAME] [REGION] [PROJECT_ID]
 * 
 * Пример:
 *   npm run add:telegram-session:cloud-run shorts-backend us-central1 shortai-532ac
 */

import "dotenv/config";
import { execSync } from "child_process";
import { exportSessionForEnv } from "../src/telegram/sessionStore";

const SERVICE_NAME = process.argv[2] || "shorts-backend";
const REGION = process.argv[3] || "us-central1";
const PROJECT_ID = process.argv[4] || process.env.GCLOUD_PROJECT || "";

function main() {
  console.log("=== Добавление Telegram сессии в Cloud Run ===\n");

  // Проверяем наличие gcloud
  try {
    execSync("gcloud --version", { stdio: "ignore" });
  } catch {
    console.error("❌ Ошибка: gcloud CLI не установлен");
    console.log("Установите: https://cloud.google.com/sdk/docs/install");
    process.exit(1);
  }

  // Получаем зашифрованную сессию
  const encryptedSession = exportSessionForEnv();
  if (!encryptedSession) {
    console.error("❌ Ошибка: Telegram сессия не найдена.");
    console.log("\n💡 Сначала выполните авторизацию:");
    console.log("   npm run dev:login");
    console.log("\nПосле успешного логина запустите этот скрипт снова.");
    process.exit(1);
  }

  // Устанавливаем проект, если указан
  if (PROJECT_ID) {
    try {
      execSync(`gcloud config set project ${PROJECT_ID}`, { stdio: "inherit" });
    } catch (error) {
      console.error("❌ Ошибка при установке проекта:", error);
      process.exit(1);
    }
  }

  console.log(`📦 Сервис: ${SERVICE_NAME}`);
  console.log(`🌍 Регион: ${REGION}`);
  console.log(`🔧 Проект: ${PROJECT_ID || "текущий"}\n`);

  // Формируем команду
  const command = `gcloud run services update ${SERVICE_NAME} --region ${REGION} --update-env-vars "TELEGRAM_SESSION_ENCRYPTED=${encryptedSession}"`;

  console.log("🚀 Выполняю команду...\n");
  console.log(command + "\n");

  try {
    execSync(command, { stdio: "inherit" });
    console.log("\n✅ Telegram сессия успешно добавлена в Cloud Run!");
    console.log("\n💡 Проверьте работу фронтенда - ошибка 'Telegram не подключён' должна исчезнуть.");
  } catch (error) {
    console.error("\n❌ Ошибка при добавлении переменной:", error);
    console.log("\n💡 Попробуйте добавить вручную через Cloud Console:");
    console.log(`   https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}`);
    process.exit(1);
  }
}

main();



