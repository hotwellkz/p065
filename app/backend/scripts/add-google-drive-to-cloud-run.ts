#!/usr/bin/env ts-node
/**
 * Скрипт для добавления Google Drive credentials в Cloud Run
 * 
 * Использование:
 *   npm run add:google-drive:cloud-run [SERVICE_NAME] [REGION] [PROJECT_ID]
 * 
 * Пример:
 *   npm run add:google-drive:cloud-run shorts-backend us-central1 shortai-532ac
 */

import "dotenv/config";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const SERVICE_NAME = process.argv[2] || "shorts-backend";
const REGION = process.argv[3] || "us-central1";
const PROJECT_ID = process.argv[4] || process.env.GCLOUD_PROJECT || "";

function main() {
  console.log("=== Добавление Google Drive credentials в Cloud Run ===\n");

  // Проверяем наличие gcloud
  try {
    execSync("gcloud --version", { stdio: "ignore" });
  } catch {
    console.error("❌ Ошибка: gcloud CLI не установлен");
    console.log("Установите: https://cloud.google.com/sdk/docs/install");
    process.exit(1);
  }

  // Читаем переменные из .env
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    console.error("❌ Ошибка: файл .env не найден");
    console.log("Создайте файл backend/.env с переменными Google Drive");
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, "utf8");
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  const defaultParent = process.env.GOOGLE_DRIVE_DEFAULT_PARENT;

  if (!clientEmail || !privateKey) {
    console.error("❌ Ошибка: GOOGLE_DRIVE_CLIENT_EMAIL или GOOGLE_DRIVE_PRIVATE_KEY не найдены в .env");
    console.log("\n💡 Добавьте в backend/.env:");
    console.log("GOOGLE_DRIVE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com");
    console.log('GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
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

  // Используем Secret Manager для приватного ключа (безопаснее)
  const secretName = "google-drive-private-key";
  
  console.log("📝 Шаг 1: Создание секрета для приватного ключа...\n");
  
  // Проверяем, существует ли секрет
  let secretExists = false;
  try {
    execSync(`gcloud secrets describe ${secretName}`, { stdio: "ignore" });
    secretExists = true;
    console.log(`✅ Секрет ${secretName} уже существует, обновляем...\n`);
  } catch {
    console.log(`📦 Создаём новый секрет ${secretName}...\n`);
  }

  // Создаём или обновляем секрет
  try {
    // Убираем кавычки и \n из приватного ключа для сохранения в секрет
    const cleanPrivateKey = privateKey.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
    
    if (secretExists) {
      // Обновляем существующий секрет
      const tempFile = path.join(process.cwd(), ".temp-private-key.txt");
      fs.writeFileSync(tempFile, cleanPrivateKey, "utf8");
      execSync(`gcloud secrets versions add ${secretName} --data-file=${tempFile}`, { stdio: "inherit" });
      fs.unlinkSync(tempFile);
    } else {
      // Создаём новый секрет
      const tempFile = path.join(process.cwd(), ".temp-private-key.txt");
      fs.writeFileSync(tempFile, cleanPrivateKey, "utf8");
      execSync(`gcloud secrets create ${secretName} --data-file=${tempFile}`, { stdio: "inherit" });
      fs.unlinkSync(tempFile);
    }
    console.log("✅ Секрет создан/обновлён успешно!\n");
  } catch (error) {
    console.error("❌ Ошибка при создании секрета:", error);
    console.log("\n💡 Попробуйте создать секрет вручную:");
    console.log(`   echo -n 'PRIVATE_KEY' | gcloud secrets create ${secretName} --data-file=-`);
    process.exit(1);
  }

  // Формируем команду обновления переменных
  console.log("📝 Шаг 2: Добавление переменных окружения в Cloud Run...\n");
  
  let updateVars = `GOOGLE_DRIVE_CLIENT_EMAIL=${clientEmail}`;
  updateVars += `,GOOGLE_DRIVE_DEFAULT_PARENT=${defaultParent || ""}`;
  
  // Добавляем секрет как переменную окружения
  const updateSecrets = `GOOGLE_DRIVE_PRIVATE_KEY=${secretName}:latest`;

  const command = `gcloud run services update ${SERVICE_NAME} --region ${REGION} --update-env-vars "${updateVars}" --update-secrets "${updateSecrets}"`;

  console.log("🚀 Выполняю команду...\n");

  try {
    execSync(command, { stdio: "inherit" });
    console.log("\n✅ Google Drive credentials успешно добавлены в Cloud Run!");
    console.log("\n💡 Проверьте работу загрузки файлов в Google Drive.");
  } catch (error) {
    console.error("\n❌ Ошибка при добавлении переменных:", error);
    console.log("\n💡 Попробуйте добавить вручную через Cloud Console:");
    console.log(`   https://console.cloud.google.com/run/detail/${REGION}/${SERVICE_NAME}`);
    process.exit(1);
  }
}

main();

