require('dotenv').config();
const { google } = require('googleapis');

console.log('=== Добавление доступа Service Account к папкам Google Drive ===\n');

// Проверяем переменные окружения
const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

if (!clientEmail || !privateKeyRaw) {
  console.error('❌ ОШИБКА: GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY должны быть заданы в backend/.env');
  process.exit(1);
}

console.log('Service Account Email:', clientEmail);
console.log('');

// Инициализируем Google Drive клиент с полным scope для управления permissions
const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

// Функция для добавления доступа к папке
async function addFolderAccess(folderId, folderName) {
  try {
    console.log(`\nОбработка папки: ${folderName || folderId}`);
    console.log(`   ID: ${folderId}`);
    
    // Сначала проверяем, существует ли папка
    let folderInfo;
    try {
      folderInfo = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType'
      });
      
      if (folderInfo.data.mimeType !== 'application/vnd.google-apps.folder') {
        console.log(`   ❌ ОШИБКА: Указанный ID не является папкой`);
        return false;
      }
      
      console.log(`   ✅ Папка найдена: "${folderInfo.data.name}"`);
    } catch (error) {
      if (error.code === 404) {
        console.log(`   ❌ ОШИБКА: Папка не найдена (404)`);
        console.log(`   💡 Проверьте правильность ID папки`);
        return false;
      }
      throw error;
    }
    
    // Проверяем текущие permissions
    const permissions = await drive.permissions.list({
      fileId: folderId,
      fields: 'permissions(id,emailAddress,role,type)'
    });
    
    // Проверяем, есть ли уже доступ
    const hasAccess = permissions.data.permissions.some(p => 
      p.emailAddress === clientEmail && 
      (p.role === 'writer' || p.role === 'owner' || p.role === 'fileOrganizer')
    );
    
    if (hasAccess) {
      const permission = permissions.data.permissions.find(p => p.emailAddress === clientEmail);
      console.log(`   ✅ Доступ уже есть! Роль: ${permission.role}`);
      return true;
    }
    
    // Пытаемся добавить доступ
    console.log(`   🔄 Добавление доступа для ${clientEmail}...`);
    
    try {
      await drive.permissions.create({
        fileId: folderId,
        requestBody: {
          role: 'writer', // Редактор
          type: 'user',
          emailAddress: clientEmail
        },
        sendNotificationEmail: false // Не отправляем уведомление
      });
      
      console.log(`   ✅ Доступ успешно добавлен! Роль: writer (Редактор)`);
      return true;
    } catch (error) {
      if (error.code === 403) {
        console.log(`   ❌ ОШИБКА: Нет прав для добавления доступа (403)`);
        console.log(`   💡 РЕШЕНИЕ:`);
        console.log(`      У вас нет прав на изменение доступа к этой папке.`);
        console.log(`      Владелец папки должен вручную поделиться папкой:`);
        console.log(`      1. Откройте: https://drive.google.com/drive/folders/${folderId}`);
        console.log(`      2. Нажмите "Поделиться" (Share)`);
        console.log(`      3. Добавьте: ${clientEmail}`);
        console.log(`      4. Выберите права: "Редактор" (Editor)`);
        return false;
      } else if (error.code === 404) {
        console.log(`   ❌ ОШИБКА: Папка не найдена`);
        return false;
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.log(`   ❌ ОШИБКА: ${error.message}`);
    if (error.code) {
      console.log(`      Код ошибки: ${error.code}`);
    }
    return false;
  }
}

// Основная функция
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
    console.log('❌ ОШИБКА: Не указаны папки для обработки');
    console.log('\n💡 Использование:');
    console.log('   node scripts/add-drive-folder-access.js <folderId1> [folderId2] ...');
    console.log('   Или задайте GOOGLE_DRIVE_DEFAULT_PARENT в .env');
    process.exit(1);
  }
  
  console.log(`\nОбработка ${folderIds.length} папки(ок):\n`);
  
  let allSuccess = true;
  for (const folder of folderIds) {
    const success = await addFolderAccess(folder.id, folder.name);
    if (!success) {
      allSuccess = false;
    }
  }
  
  console.log('\n=== Результат ===');
  if (allSuccess) {
    console.log('✅ Все папки обработаны успешно!');
    console.log('\n💡 Теперь можно проверить доступ:');
    console.log('   node scripts/check-drive-folder-access.js ' + folderIds.map(f => f.id).join(' '));
  } else {
    console.log('⚠️  Некоторые папки не удалось обработать.');
    console.log('   Следуйте инструкциям выше для ручного добавления доступа.');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА:', error.message);
  if (error.code === 403) {
    console.error('\n💡 Возможные причины:');
    console.error('   1. Service Account не имеет прав на управление доступом к папкам');
    console.error('   2. Google Drive API не включен в проекте');
    console.error('   3. Неправильные credentials');
    console.error('\n💡 РЕШЕНИЕ:');
    console.error('   Владелец папки должен вручную поделиться папкой с Service Account');
  }
  process.exit(1);
});


