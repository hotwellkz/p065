require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

console.log('=== Настройка Google OAuth 2.0 для Google Drive ===\n');

// Проверяем переменные окружения
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID;
if (!projectId) {
  console.error('❌ ОШИБКА: FIREBASE_PROJECT_ID или GOOGLE_CLOUD_PROJECT_ID должен быть задан в backend/.env');
  process.exit(1);
}

console.log(`Проект: ${projectId}\n`);

// Создаём OAuth2 клиент для настройки
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:8080/api/auth/google/callback'
);

// Scopes для Google Drive
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive'
];

async function getAuthUrl() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  
  return authUrl;
}

async function getTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function main() {
  console.log('📋 Инструкция по настройке OAuth 2.0:\n');
  console.log('1. Откройте Google Cloud Console: https://console.cloud.google.com/');
  console.log(`2. Выберите проект: ${projectId}`);
  console.log('3. Перейдите в APIs & Services → Credentials');
  console.log('4. Нажмите "Create Credentials" → "OAuth client ID"');
  console.log('5. Если появится запрос, настройте OAuth consent screen:');
  console.log('   - User Type: External');
  console.log('   - App name: Shorts AI Studio');
  console.log('   - User support email: ваш email');
  console.log('   - Developer contact: ваш email');
  console.log('   - Scopes: добавьте "https://www.googleapis.com/auth/drive"');
  console.log('6. Создайте OAuth client ID:');
  console.log('   - Application type: Web application');
  console.log('   - Name: Shorts AI Studio Drive');
  console.log('   - Authorized redirect URIs:');
  console.log('     * http://localhost:8080/api/auth/google/callback (для разработки)');
  console.log('     * https://your-domain.com/api/auth/google/callback (для продакшена)');
  console.log('7. Скопируйте Client ID и Client Secret\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Введите Client ID: ', (clientId) => {
      rl.question('Введите Client Secret: ', (clientSecret) => {
        rl.close();
        
        // Сохраняем в .env
        const envPath = path.join(__dirname, '..', '.env');
        let envContent = '';
        
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        // Обновляем или добавляем переменные
        const lines = envContent.split('\n');
        let foundClientId = false;
        let foundClientSecret = false;
        let foundRedirectUri = false;
        
        const newLines = lines.map(line => {
          if (line.startsWith('GOOGLE_OAUTH_CLIENT_ID=')) {
            foundClientId = true;
            return `GOOGLE_OAUTH_CLIENT_ID=${clientId}`;
          }
          if (line.startsWith('GOOGLE_OAUTH_CLIENT_SECRET=')) {
            foundClientSecret = true;
            return `GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`;
          }
          if (line.startsWith('GOOGLE_OAUTH_REDIRECT_URI=')) {
            foundRedirectUri = true;
            return `GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback`;
          }
          return line;
        });
        
        if (!foundClientId) {
          newLines.push(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
        }
        if (!foundClientSecret) {
          newLines.push(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
        }
        if (!foundRedirectUri) {
          newLines.push(`GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback`);
        }
        
        fs.writeFileSync(envPath, newLines.join('\n'));
        
        console.log('\n✅ Переменные сохранены в backend/.env');
        console.log('\n📋 Следующие шаги:');
        console.log('1. Перезапустите backend сервер');
        console.log('2. Откройте в браузере: http://localhost:8080/api/auth/google');
        console.log('3. Авторизуйтесь через Google');
        console.log('4. Скопируйте полученный токен');
        console.log('5. Используйте токен для загрузки файлов в Google Drive\n');
        
        resolve();
      });
    });
  });
}

main().catch(error => {
  console.error('❌ ОШИБКА:', error.message);
  process.exit(1);
});


