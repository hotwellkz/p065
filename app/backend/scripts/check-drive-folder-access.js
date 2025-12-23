require('dotenv').config();
const { google } = require('googleapis');

console.log('=== Проверка доступа к папкам Google Drive ===\n');

// Проверяем переменные окружения
const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

if (!clientEmail || !privateKeyRaw) {
  console.error('❌ ОШИБКА: GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY должны быть заданы в backend/.env');
  process.exit(1);
}

console.log('1. Service Account Email:');
console.log(`   ${clientEmail}\n`);

// Инициализируем Google Drive клиент
const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

// Функция для проверки доступа к папке
async function checkFolderAccess(folderId, folderName) {
  try {
    console.log(`\nПроверка папки: ${folderName || folderId}`);
    console.log(`   ID: ${folderId}`);
    
    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, permissions, shared'
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
      console.log(`   💡 РЕШЕНИЕ:`);
      console.log(`      1. Откройте папку в Google Drive: https://drive.google.com/drive/folders/${folderId}`);
      console.log(`      2. Нажмите "Поделиться" (Share)`);
      console.log(`      3. Добавьте email: ${clientEmail}`);
      console.log(`      4. Выберите права: "Редактор" (Editor)`);
      console.log(`      5. Нажмите "Отправить"`);
      return false;
    }
  } catch (error) {
    if (error.code === 404) {
      console.log(`   ❌ ОШИБКА: Папка не найдена (404)`);
      console.log(`   💡 Проверьте правильность ID папки`);
    } else if (error.code === 403) {
      console.log(`   ❌ ОШИБКА: Нет доступа к папке (403)`);
      console.log(`   💡 РЕШЕНИЕ:`);
      console.log(`      1. Откройте папку в Google Drive: https://drive.google.com/drive/folders/${folderId}`);
      console.log(`      2. Нажмите "Поделиться" (Share)`);
      console.log(`      3. Добавьте email: ${clientEmail}`);
      console.log(`      4. Выберите права: "Редактор" (Editor)`);
      console.log(`      5. Нажмите "Отправить"`);
    } else {
      console.log(`   ❌ ОШИБКА: ${error.message}`);
    }
    return false;
  }
}

// Проверяем папки из аргументов или из .env
async function main() {
  const folderIds = [];
  
  // Добавляем папки из аргументов командной строки
  if (process.argv.length > 2) {
    for (let i = 2; i < process.argv.length; i++) {
      folderIds.push({
        id: process.argv[i],
        name: `Папка ${i - 1} (из аргументов)`
      });
    }
  }
  
  // Добавляем папку по умолчанию из .env
  const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT;
  if (defaultFolderId && !folderIds.find(f => f.id === defaultFolderId)) {
    folderIds.push({
      id: defaultFolderId.trim(),
      name: 'Папка по умолчанию (GOOGLE_DRIVE_DEFAULT_PARENT)'
    });
  }
  
  if (folderIds.length === 0) {
    console.log('❌ ОШИБКА: Не указаны папки для проверки');
    console.log('\n💡 Использование:');
    console.log('   node scripts/check-drive-folder-access.js <folderId1> [folderId2] ...');
    console.log('   Или задайте GOOGLE_DRIVE_DEFAULT_PARENT в .env');
    process.exit(1);
  }
  
  console.log(`\n2. Проверка доступа к ${folderIds.length} папке(ам):\n`);
  
  let allAccessible = true;
  for (const folder of folderIds) {
    const accessible = await checkFolderAccess(folder.id, folder.name);
    if (!accessible) {
      allAccessible = false;
    }
  }
  
  console.log('\n=== Результат проверки ===');
  if (allAccessible) {
    console.log('✅ Все папки доступны!');
  } else {
    console.log('❌ Некоторые папки недоступны. Следуйте инструкциям выше.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
  if (error.code === 403) {
    console.error('\n💡 Возможные причины:');
    console.error('   1. Service Account не имеет прав на доступ к Google Drive API');
    console.error('   2. Google Drive API не включен в проекте');
    console.error('   3. Неправильные credentials (GOOGLE_DRIVE_CLIENT_EMAIL или GOOGLE_DRIVE_PRIVATE_KEY)');
  }
  process.exit(1);
});


