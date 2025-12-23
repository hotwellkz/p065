require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

console.log('=== Добавление тестового пользователя через API ===\n');

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID;
if (!projectId) {
  console.error('❌ ОШИБКА: FIREBASE_PROJECT_ID должен быть задан');
  process.exit(1);
}

console.log(`Проект: ${projectId}\n`);

// Используем Application Default Credentials
async function addTestUser() {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    
    const authClient = await auth.getClient();
    const projectNumber = await auth.getProjectId();
    
    console.log(`Project Number: ${projectNumber}\n`);
    
    // Получаем текущие настройки OAuth consent screen
    const oauth2 = google.oauth2('v2');
    const consentScreen = await oauth2.oauth2.getConsentScreen({
      auth: authClient,
      projectId: projectId
    });
    
    console.log('Текущие настройки OAuth Consent Screen:');
    console.log(`  Publishing status: ${consentScreen.data.publishingStatus}`);
    console.log(`  Test users: ${consentScreen.data.testUsers?.join(', ') || 'нет'}\n`);
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve) => {
      rl.question('Введите email для добавления в тестовые пользователи: ', async (email) => {
        rl.close();
        
        if (!email || !email.includes('@')) {
          console.error('❌ Неверный email');
          process.exit(1);
        }
        
        try {
          // Обновляем список тестовых пользователей
          const currentTestUsers = consentScreen.data.testUsers || [];
          if (currentTestUsers.includes(email)) {
            console.log(`✅ Email ${email} уже в списке тестовых пользователей`);
            resolve();
            return;
          }
          
          const updatedTestUsers = [...currentTestUsers, email];
          
          // Обновляем OAuth consent screen
          // Примечание: API для обновления consent screen может быть ограничен
          console.log(`\n💡 Примечание: Обновление через API может быть ограничено.`);
          console.log(`   Рекомендуется добавить пользователя через веб-интерфейс:\n`);
          console.log(`   1. Откройте: https://console.cloud.google.com/apis/credentials/consent?project=${projectId}`);
          console.log(`   2. В разделе "Test users" нажмите "+ ADD USERS"`);
          console.log(`   3. Добавьте email: ${email}`);
          console.log(`   4. Нажмите "ADD"\n`);
          
          resolve();
        } catch (error) {
          console.error('❌ ОШИБКА при обновлении:', error.message);
          console.log('\n💡 Используйте веб-интерфейс для добавления тестового пользователя');
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('❌ ОШИБКА:', error.message);
    console.log('\n💡 Используйте веб-интерфейс для добавления тестового пользователя');
    console.log(`   https://console.cloud.google.com/apis/credentials/consent?project=${projectId}`);
  }
}

addTestUser().catch(error => {
  console.error('❌ ОШИБКА:', error.message);
  process.exit(1);
});


