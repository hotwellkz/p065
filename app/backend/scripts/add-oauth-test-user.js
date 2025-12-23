require('dotenv').config();
const { google } = require('googleapis');

console.log('=== Добавление тестового пользователя в OAuth Consent Screen ===\n');

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID;
if (!projectId) {
  console.error('❌ ОШИБКА: FIREBASE_PROJECT_ID должен быть задан');
  process.exit(1);
}

console.log(`Проект: ${projectId}\n`);
console.log('📋 Инструкция:\n');
console.log('OAuth Consent Screen находится в режиме "Testing".');
console.log('Нужно добавить тестовых пользователей через Google Cloud Console.\n');
console.log('Шаги:');
console.log('1. Откройте: https://console.cloud.google.com/apis/credentials/consent');
console.log(`2. Выберите проект: ${projectId}`);
console.log('3. В разделе "Test users" нажмите "+ ADD USERS"');
console.log('4. Добавьте email: bibi7475000@gmail.com');
console.log('5. Нажмите "ADD"');
console.log('6. Попробуйте авторизоваться снова\n');
console.log('Альтернатива:');
console.log('Если хотите использовать приложение в продакшене:');
console.log('1. Измените "Publishing status" на "In production"');
console.log('2. Но это требует верификации приложения Google\n');


