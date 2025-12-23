#!/usr/bin/env node

/**
 * Скрипт для проверки .env файла на наличие всех необходимых переменных
 */

require('dotenv').config();

const errors = [];
const warnings = [];

// Обязательные переменные
const requiredVars = {
  // Telegram
  TELEGRAM_API_ID: 'Число (например: 12345678)',
  TELEGRAM_API_HASH: 'Строка (например: abc123def456...)',
  SYNX_CHAT_ID: 'ID чата SyntX (должен начинаться с -100 для групп)',
  TELEGRAM_SESSION_SECRET: '64 hex символа (32 байта)',
  
  // Google Drive (обязательные для загрузки видео)
  GOOGLE_DRIVE_CLIENT_EMAIL: 'Email Service Account (например: xxx@xxx.iam.gserviceaccount.com)',
  GOOGLE_DRIVE_PRIVATE_KEY: 'Private key в кавычках с \\n',
};

// Опциональные переменные
const optionalVars = {
  GOOGLE_DRIVE_DEFAULT_PARENT: 'ID папки Google Drive по умолчанию',
  PORT: 'Порт сервера (по умолчанию 8080)',
  FRONTEND_ORIGIN: 'URL фронтенда (по умолчанию http://localhost:5173)',
  JWT_SECRET: 'Секрет для JWT',
  CRON_SECRET: 'Секрет для cron jobs',
};

// Firebase (один из вариантов обязателен)
const firebaseVars = {
  FIREBASE_SERVICE_ACCOUNT: 'Полный JSON Service Account (в кавычках)',
  FIREBASE_PROJECT_ID: 'Project ID (если используется вариант 2)',
  FIREBASE_CLIENT_EMAIL: 'Client Email (если используется вариант 2)',
  FIREBASE_PRIVATE_KEY: 'Private Key (если используется вариант 2)',
};

console.log('🔍 Проверка .env файла...\n');

// Проверка обязательных переменных
for (const [varName, description] of Object.entries(requiredVars)) {
  const value = process.env[varName];
  if (!value || value.trim() === '') {
    errors.push(`❌ ${varName} - отсутствует (${description})`);
  } else {
    // Специфичные проверки
    if (varName === 'TELEGRAM_API_ID' && isNaN(Number(value))) {
      errors.push(`❌ ${varName} - должно быть числом, получено: ${value}`);
    } else if (varName === 'TELEGRAM_SESSION_SECRET' && value.length !== 64) {
      errors.push(`❌ ${varName} - должно быть 64 hex символа, получено: ${value.length}`);
    } else if (varName === 'GOOGLE_DRIVE_CLIENT_EMAIL' && !value.includes('@') && !value.includes('.iam.gserviceaccount.com')) {
      warnings.push(`⚠️  ${varName} - не похоже на email Service Account: ${value}`);
    } else if (varName === 'GOOGLE_DRIVE_PRIVATE_KEY' && !value.includes('BEGIN PRIVATE KEY')) {
      warnings.push(`⚠️  ${varName} - не похоже на private key (должно содержать "BEGIN PRIVATE KEY")`);
    } else {
      console.log(`✅ ${varName} - установлено`);
    }
  }
}

// Проверка Firebase (хотя бы один вариант должен быть)
const hasFirebaseVariant1 = process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT.trim() !== '';
const hasFirebaseVariant2 = 
  process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID.trim() !== '' &&
  process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_CLIENT_EMAIL.trim() !== '' &&
  process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PRIVATE_KEY.trim() !== '';

if (!hasFirebaseVariant1 && !hasFirebaseVariant2) {
  errors.push('❌ Firebase не настроен. Нужен один из вариантов:\n' +
    '   Вариант 1: FIREBASE_SERVICE_ACCOUNT (полный JSON)\n' +
    '   Вариант 2: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY');
} else {
  if (hasFirebaseVariant1) {
    console.log('✅ Firebase настроен (вариант 1: FIREBASE_SERVICE_ACCOUNT)');
  } else {
    console.log('✅ Firebase настроен (вариант 2: отдельные переменные)');
  }
}

// Проверка опциональных переменных
console.log('\n📋 Опциональные переменные:');
for (const [varName, description] of Object.entries(optionalVars)) {
  const value = process.env[varName];
  if (value && value.trim() !== '') {
    console.log(`   ✅ ${varName} - установлено`);
  } else {
    console.log(`   ⚪ ${varName} - не установлено (${description})`);
  }
}

// Вывод результатов
console.log('\n' + '='.repeat(60));

if (errors.length > 0) {
  console.log('\n❌ ОШИБКИ:');
  errors.forEach(err => console.log('  ' + err));
  console.log('\n💡 Исправьте ошибки и запустите проверку снова.');
  process.exit(1);
}

if (warnings.length > 0) {
  console.log('\n⚠️  ПРЕДУПРЕЖДЕНИЯ:');
  warnings.forEach(warn => console.log('  ' + warn));
  console.log('\n💡 Проверьте эти переменные, они могут быть некорректными.');
}

if (errors.length === 0) {
  console.log('\n✅ Все обязательные переменные настроены правильно!');
  console.log('\n💡 Следующие шаги:');
  console.log('   1. Убедитесь, что Google Drive папка поделена с Service Account');
  console.log('   2. Проверьте, что Telegram сессия инициализирована (npm run dev:login)');
  console.log('   3. Запустите сервер: npm run dev');
}

console.log('');

