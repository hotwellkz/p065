require('dotenv').config();
const { google } = require('googleapis');

console.log('=== Проверка владельца папок Google Drive ===\n');

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

async function checkFolderOwner(folderId) {
  try {
    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, owners, permissions, shared, capabilities'
    });
    
    console.log(`Папка: ${folderInfo.data.name}`);
    console.log(`   ID: ${folderId}`);
    console.log(`   Владельцы:`);
    folderInfo.data.owners?.forEach(owner => {
      console.log(`      - ${owner.emailAddress} (${owner.displayName || 'без имени'})`);
    });
    console.log(`   Расшарена: ${folderInfo.data.shared ? 'Да' : 'Нет'}`);
    
    // Проверяем permissions
    const permissions = folderInfo.data.permissions || [];
    console.log(`   Разрешения (${permissions.length}):`);
    permissions.forEach(p => {
      console.log(`      - ${p.emailAddress || p.displayName || 'unknown'}: ${p.role} (${p.type})`);
    });
    
    // Проверяем capabilities
    if (folderInfo.data.capabilities) {
      console.log(`   Возможности:`);
      console.log(`      - canEdit: ${folderInfo.data.capabilities.canEdit}`);
      console.log(`      - canShare: ${folderInfo.data.capabilities.canShare}`);
      console.log(`      - canCopy: ${folderInfo.data.capabilities.canCopy}`);
    }
    
    // Проверяем, есть ли наш Service Account
    const hasServiceAccount = permissions.some(p => p.emailAddress === clientEmail);
    if (hasServiceAccount) {
      const perm = permissions.find(p => p.emailAddress === clientEmail);
      console.log(`   ✅ Service Account найден: ${perm.role}`);
    } else {
      console.log(`   ❌ Service Account НЕ найден в разрешениях!`);
    }
    
    console.log('');
  } catch (error) {
    console.log(`   ❌ ОШИБКА: ${error.message}`);
    if (error.code === 404) {
      console.log(`   Папка не найдена или недоступна для этого Service Account`);
    }
    console.log('');
  }
}

async function main() {
  const folderIds = process.argv.slice(2);
  
  if (folderIds.length === 0) {
    const defaultFolderId = process.env.GOOGLE_DRIVE_DEFAULT_PARENT;
    if (defaultFolderId) {
      folderIds.push(defaultFolderId);
    } else {
      console.log('❌ Укажите ID папок как аргументы');
      console.log('   node scripts/check-drive-folder-owner.js <folderId1> [folderId2] ...');
      process.exit(1);
    }
  }
  
  console.log(`Service Account: ${clientEmail}\n`);
  
  for (const folderId of folderIds) {
    await checkFolderOwner(folderId);
  }
}

main().catch(error => {
  console.error('❌ ОШИБКА:', error.message);
  process.exit(1);
});


