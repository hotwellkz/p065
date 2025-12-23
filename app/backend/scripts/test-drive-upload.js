require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

console.log('=== Тест загрузки файла в Google Drive ===\n');

// Проверяем переменные окружения
const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

if (!clientEmail || !privateKeyRaw) {
  console.error('❌ ОШИБКА: GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY должны быть заданы в backend/.env');
  process.exit(1);
}

console.log('Service Account Email:', clientEmail);
console.log('');

// Инициализируем Google Drive клиент
const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

// Функция для проверки доступа к папке
async function testFolderAccess(folderId) {
  try {
    console.log(`Проверка доступа к папке: ${folderId}`);
    
    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, permissions'
    });
    
    if (folderInfo.data.mimeType !== 'application/vnd.google-apps.folder') {
      console.log(`   ❌ ОШИБКА: Указанный ID не является папкой`);
      return false;
    }
    
    console.log(`   ✅ Папка найдена: "${folderInfo.data.name}"`);
    
    // Проверяем права доступа
    const permissions = folderInfo.data.permissions || [];
    const hasAccess = permissions.some(p => 
      p.emailAddress === clientEmail && 
      (p.role === 'writer' || p.role === 'owner' || p.role === 'fileOrganizer')
    );
    
    if (hasAccess) {
      const permission = permissions.find(p => p.emailAddress === clientEmail);
      console.log(`   ✅ Доступ есть! Роль: ${permission.role}`);
      return true;
    } else {
      console.log(`   ❌ НЕТ ДОСТУПА! Service Account не найден в списке разрешений`);
      return false;
    }
  } catch (error) {
    if (error.code === 404) {
      console.log(`   ❌ ОШИБКА: Папка не найдена (404)`);
      console.log(`   💡 Возможные причины:`);
      console.log(`      1. Папка находится в другом Google Drive аккаунте`);
      console.log(`      2. Папка была удалена`);
      console.log(`      3. Неправильный ID папки`);
      console.log(`      4. Service Account не имеет доступа к этому Google Drive аккаунту`);
    } else if (error.code === 403) {
      console.log(`   ❌ ОШИБКА: Нет доступа к папке (403)`);
    } else {
      console.log(`   ❌ ОШИБКА: ${error.message}`);
    }
    return false;
  }
}

// Функция для тестовой загрузки файла
async function testUpload(folderId) {
  try {
    console.log(`\nТест загрузки файла в папку: ${folderId}`);
    
    // Создаём тестовый файл
    const testContent = `Test file created at ${new Date().toISOString()}`;
    const testFilePath = path.join(__dirname, '..', 'tmp', `test-${Date.now()}.txt`);
    
    // Создаём директорию tmp если её нет
    const tmpDir = path.dirname(testFilePath);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    fs.writeFileSync(testFilePath, testContent);
    console.log(`   Создан тестовый файл: ${testFilePath}`);
    
    // Загружаем файл
    const fileMetadata = {
      name: `test-upload-${Date.now()}.txt`,
      parents: [folderId]
    };
    
    const media = {
      mimeType: 'text/plain',
      body: fs.createReadStream(testFilePath)
    };
    
    console.log(`   Загрузка файла...`);
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });
    
    console.log(`   ✅ Файл успешно загружен!`);
    console.log(`      ID: ${file.data.id}`);
    console.log(`      Название: ${file.data.name}`);
    console.log(`      Ссылка: ${file.data.webViewLink}`);
    
    // Удаляем тестовый файл
    fs.unlinkSync(testFilePath);
    console.log(`   Тестовый файл удалён`);
    
    // Удаляем загруженный файл
    await drive.files.delete({ fileId: file.data.id });
    console.log(`   Загруженный файл удалён из Google Drive`);
    
    return true;
  } catch (error) {
    if (error.code === 404) {
      console.log(`   ❌ ОШИБКА: Папка не найдена (404)`);
      console.log(`   💡 Папка недоступна для этого Service Account`);
    } else if (error.code === 403) {
      console.log(`   ❌ ОШИБКА: Нет прав на загрузку (403)`);
      console.log(`   💡 Service Account не имеет прав "Редактор" на эту папку`);
    } else {
      console.log(`   ❌ ОШИБКА: ${error.message}`);
      if (error.code) {
        console.log(`      Код ошибки: ${error.code}`);
      }
    }
    return false;
  }
}

// Основная функция
async function main() {
  const folderIds = [];
  
  // Добавляем папки из аргументов
  if (process.argv.length > 2) {
    for (let i = 2; i < process.argv.length; i++) {
      folderIds.push(process.argv[i]);
    }
  }
  
  // Добавляем папку по умолчанию из .env
  const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT;
  if (defaultFolderId && !folderIds.includes(defaultFolderId)) {
    folderIds.push(defaultFolderId.trim());
  }
  
  if (folderIds.length === 0) {
    console.log('❌ ОШИБКА: Не указаны папки для проверки');
    console.log('\n💡 Использование:');
    console.log('   node scripts/test-drive-upload.js <folderId1> [folderId2] ...');
    process.exit(1);
  }
  
  console.log(`Проверка ${folderIds.length} папки(ок):\n`);
  
  for (const folderId of folderIds) {
    const hasAccess = await testFolderAccess(folderId);
    
    if (hasAccess) {
      // Пробуем загрузить тестовый файл
      await testUpload(folderId);
    }
    
    console.log('');
  }
  
  console.log('=== Тест завершён ===');
}

main().catch(error => {
  console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
  if (error.code) {
    console.error(`   Код ошибки: ${error.code}`);
  }
  if (error.stack) {
    console.error(`   Stack: ${error.stack}`);
  }
  process.exit(1);
});


