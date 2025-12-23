require('dotenv').config();
const { google } = require('googleapis');

console.log('=== Исправление прав доступа к папкам Google Drive ===\n');

const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

if (!clientEmail || !privateKeyRaw) {
  console.error('❌ ОШИБКА: GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY должны быть заданы');
  process.exit(1);
}

const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });

async function fixFolderPermissions(folderId) {
  try {
    console.log(`Обработка папки: ${folderId}`);
    
    // Получаем текущие permissions
    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, permissions'
    });
    
    console.log(`   Папка: "${folderInfo.data.name}"`);
    
    // Проверяем, есть ли наш Service Account
    const permissions = folderInfo.data.permissions || [];
    const existingPerm = permissions.find(p => p.emailAddress === clientEmail);
    
    if (existingPerm) {
      console.log(`   Текущая роль: ${existingPerm.role}`);
      
      // Если роль не writer или выше, обновляем
      if (existingPerm.role !== 'writer' && existingPerm.role !== 'owner' && existingPerm.role !== 'fileOrganizer') {
        console.log(`   🔄 Обновление роли на writer...`);
        await drive.permissions.update({
          fileId: folderId,
          permissionId: existingPerm.id,
          requestBody: {
            role: 'writer'
          }
        });
        console.log(`   ✅ Роль обновлена на writer`);
      } else {
        console.log(`   ✅ Роль уже правильная: ${existingPerm.role}`);
      }
    } else {
      console.log(`   🔄 Добавление доступа...`);
      await drive.permissions.create({
        fileId: folderId,
        requestBody: {
          role: 'writer',
          type: 'user',
          emailAddress: clientEmail
        },
        sendNotificationEmail: false
      });
      console.log(`   ✅ Доступ добавлен`);
    }
    
    // Пробуем загрузить тестовый файл
    console.log(`   🔄 Тест загрузки файла...`);
    const { Readable } = require('stream');
    const testContent = `Test ${Date.now()}`;
    const fileMetadata = {
      name: `test-${Date.now()}.txt`,
      parents: [folderId]
    };
    
    const media = {
      mimeType: 'text/plain',
      body: Readable.from([testContent])
    };
    
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name'
    });
    
    console.log(`   ✅ Файл успешно загружен: ${file.data.name}`);
    
    // Удаляем тестовый файл
    await drive.files.delete({ fileId: file.data.id });
    console.log(`   ✅ Тестовый файл удалён`);
    
    return true;
  } catch (error) {
    console.log(`   ❌ ОШИБКА: ${error.message}`);
    if (error.code === 403) {
      console.log(`   💡 Проблема с правами доступа`);
      console.log(`   💡 Возможно, папка находится в другом Google Drive аккаунте`);
      console.log(`   💡 Владелец папки должен вручную поделиться папкой с ${clientEmail}`);
    } else if (error.code === 404) {
      console.log(`   💡 Папка не найдена`);
    }
    return false;
  }
}

async function main() {
  const folderIds = process.argv.slice(2);
  
  if (folderIds.length === 0) {
    const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT;
    if (defaultFolderId) {
      folderIds.push(defaultFolderId);
    } else {
      console.log('❌ Укажите ID папок');
      console.log('   node scripts/fix-drive-permissions.js <folderId1> [folderId2] ...');
      process.exit(1);
    }
  }
  
  console.log(`Service Account: ${clientEmail}\n`);
  
  let allSuccess = true;
  for (const folderId of folderIds) {
    const success = await fixFolderPermissions(folderId);
    if (!success) {
      allSuccess = false;
    }
    console.log('');
  }
  
  if (allSuccess) {
    console.log('✅ Все папки обработаны успешно!');
  } else {
    console.log('⚠️  Некоторые папки не удалось обработать');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ ОШИБКА:', error.message);
  process.exit(1);
});

