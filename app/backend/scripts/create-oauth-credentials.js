require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

console.log('=== Создание OAuth 2.0 Credentials через Google Cloud API ===\n');

// Проверяем переменные окружения
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID;
if (!projectId) {
  console.error('❌ ОШИБКА: FIREBASE_PROJECT_ID или GOOGLE_CLOUD_PROJECT_ID должен быть задан');
  process.exit(1);
}

console.log(`Проект: ${projectId}\n`);

// Для создания OAuth credentials через API нужна авторизация через gcloud
// Проверяем, авторизован ли пользователь
async function createOAuthClient() {
  console.log('📋 Инструкция:\n');
  console.log('OAuth credentials нельзя создать напрямую через CLI.');
  console.log('Нужно использовать Google Cloud Console веб-интерфейс.\n');
  console.log('Шаги:');
  console.log('1. Откройте: https://console.cloud.google.com/apis/credentials');
  console.log(`2. Выберите проект: ${projectId}`);
  console.log('3. Нажмите "Create Credentials" → "OAuth client ID"');
  console.log('4. Если появится запрос, настройте OAuth consent screen:');
  console.log('   - User Type: External');
  console.log('   - App name: Shorts AI Studio');
  console.log('   - User support email: ваш email');
  console.log('   - Developer contact: ваш email');
  console.log('   - Scopes: добавьте "https://www.googleapis.com/auth/drive"');
  console.log('5. Создайте OAuth client ID:');
  console.log('   - Application type: Web application');
  console.log('   - Name: Shorts AI Studio Drive');
  console.log('   - Authorized redirect URIs:');
  console.log('     * http://localhost:8080/api/auth/google/callback');
  console.log('6. Скопируйте Client ID и Client Secret\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Введите Client ID: ', (clientId) => {
      rl.question('Введите Client Secret: ', (clientSecret) => {
        rl.close();
        
        // Сохраняем в .env
        const fs = require('fs');
        const path = require('path');
        const envPath = path.join(__dirname, '..', '.env');
        
        let envContent = '';
        if (fs.existsSync(envPath)) {
          envContent = fs.readFileSync(envPath, 'utf8');
        }
        
        const lines = envContent.split('\n');
        const newLines = [];
        let foundClientId = false;
        let foundClientSecret = false;
        let foundRedirectUri = false;
        
        for (const line of lines) {
          if (line.startsWith('GOOGLE_OAUTH_CLIENT_ID=')) {
            newLines.push(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
            foundClientId = true;
          } else if (line.startsWith('GOOGLE_OAUTH_CLIENT_SECRET=')) {
            newLines.push(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
            foundClientSecret = true;
          } else if (line.startsWith('GOOGLE_OAUTH_REDIRECT_URI=')) {
            newLines.push(`GOOGLE_OAUTH_REDIRECT_URI=http://localhost:8080/api/auth/google/callback`);
            foundRedirectUri = true;
          } else {
            newLines.push(line);
          }
        }
        
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
        console.log('2. Откройте в браузере (с авторизацией): http://localhost:8080/api/auth/google');
        console.log('3. Авторизуйтесь через Google');
        console.log('4. Токены автоматически сохранятся в Firestore');
        console.log('5. Теперь можно загружать файлы в Google Drive!\n');
        
        resolve();
      });
    });
  });
}

createOAuthClient().catch(error => {
  console.error('❌ ОШИБКА:', error.message);
  process.exit(1);
});


