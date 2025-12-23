require('dotenv').config();
const admin = require('firebase-admin');

console.log('=== Проверка доступа к Firestore ===\n');

// Проверяем переменные окружения
console.log('1. Проверка переменных окружения:');
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

console.log(`   FIREBASE_PROJECT_ID: ${projectId || 'НЕ УСТАНОВЛЕН'}`);
console.log(`   FIREBASE_CLIENT_EMAIL: ${clientEmail ? clientEmail.substring(0, 30) + '...' : 'НЕ УСТАНОВЛЕН'}`);
console.log(`   FIREBASE_PRIVATE_KEY: ${privateKey ? 'УСТАНОВЛЕН (' + privateKey.length + ' символов)' : 'НЕ УСТАНОВЛЕН'}`);
console.log(`   FIREBASE_SERVICE_ACCOUNT: ${serviceAccount ? 'УСТАНОВЛЕН' : 'НЕ УСТАНОВЛЕН'}`);

if (!projectId || (!clientEmail && !serviceAccount)) {
  console.error('\n❌ ОШИБКА: Не настроены переменные окружения для Firebase Admin!');
  process.exit(1);
}

// Инициализируем Firebase Admin
console.log('\n2. Инициализация Firebase Admin...');
try {
  if (serviceAccount) {
    const serviceAccountJson = JSON.parse(serviceAccount);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountJson)
    });
    console.log('   ✅ Инициализирован из FIREBASE_SERVICE_ACCOUNT');
    console.log(`   Service Account Email: ${serviceAccountJson.client_email}`);
  } else if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
      })
    });
    console.log('   ✅ Инициализирован из отдельных переменных');
    console.log(`   Service Account Email: ${clientEmail}`);
  } else {
    throw new Error('Недостаточно переменных окружения');
  }
} catch (error) {
  console.error('   ❌ Ошибка инициализации:', error.message);
  process.exit(1);
}

const db = admin.firestore();

// Проверяем доступ к каналам через Collection Group Query
console.log('\n3. Проверка доступа к каналам (Collection Group Query)...');
db.collectionGroup('channels').limit(10).get()
  .then(snapshot => {
    console.log(`   ✅ Успешно! Найдено каналов: ${snapshot.size}`);
    if (snapshot.size > 0) {
      console.log('   Каналы:');
      snapshot.docs.forEach(doc => {
        // Извлекаем userId из пути
        const pathParts = doc.ref.path.split('/');
        const userIdIndex = pathParts.indexOf('users');
        const userId = userIdIndex >= 0 && userIdIndex < pathParts.length - 1 
          ? pathParts[userIdIndex + 1] 
          : 'unknown';
        const data = doc.data();
        console.log(`      - ${doc.id} (user: ${userId}): ${data.name || 'без названия'}`);
      });
      return snapshot;
    } else {
      console.log('   ⚠️  Каналов не найдено');
      return Promise.resolve(null);
    }
  })
  .then(channelsSnapshot => {
    if (channelsSnapshot) {
      console.log(`\n4. Детальная информация о каналах:`);
      if (channelsSnapshot.size > 0) {
        channelsSnapshot.docs.forEach(doc => {
          const data = doc.data();
          const pathParts = doc.ref.path.split('/');
          const userIdIndex = pathParts.indexOf('users');
          const userId = userIdIndex >= 0 && userIdIndex < pathParts.length - 1 
            ? pathParts[userIdIndex + 1] 
            : 'unknown';
          console.log(`   - ${doc.id} (user: ${userId}): ${data.name || 'без названия'}`);
          console.log(`     autoSendEnabled: ${data.autoSendEnabled} (тип: ${typeof data.autoSendEnabled})`);
          console.log(`     timezone: ${data.timezone || 'не задано'}`);
          console.log(`     schedules: ${Array.isArray(data.autoSendSchedules) ? data.autoSendSchedules.length : 0}`);
        });
        
        // Ищем каналы с autoSendEnabled
        const channelsWithAutoSend = channelsSnapshot.docs.filter(doc => {
          const data = doc.data();
          return data.autoSendEnabled === true;
        });
        
        console.log(`\n5. Каналы с autoSendEnabled=true: ${channelsWithAutoSend.length}`);
        if (channelsWithAutoSend.length > 0) {
          channelsWithAutoSend.forEach(doc => {
            const data = doc.data();
            const pathParts = doc.ref.path.split('/');
            const userIdIndex = pathParts.indexOf('users');
            const userId = userIdIndex >= 0 && userIdIndex < pathParts.length - 1 
              ? pathParts[userIdIndex + 1] 
              : 'unknown';
            console.log(`   ✅ ${doc.id} (user: ${userId}): ${data.name}`);
            console.log(`      timezone: ${data.timezone}`);
            console.log(`      schedules: ${Array.isArray(data.autoSendSchedules) ? data.autoSendSchedules.length : 0}`);
          });
        } else {
          console.log('   ⚠️  Нет каналов с autoSendEnabled=true');
        }
      }
    }
    
    console.log('\n✅ Проверка завершена успешно!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ ОШИБКА при проверке доступа:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  });

