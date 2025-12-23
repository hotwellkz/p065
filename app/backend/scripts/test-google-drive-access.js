/**
 * Скрипт для проверки доступа к Google Drive через Service Account
 * Запуск: node scripts/test-google-drive-access.js [folderId]
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { google } = require("googleapis");

const DRIVE_SCOPE = ["https://www.googleapis.com/auth/drive.file"];

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    console.error("❌ Ошибка: GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY должны быть заданы в backend/.env");
    process.exit(1);
  }

  try {
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: DRIVE_SCOPE
    });

    return google.drive({ version: "v3", auth });
  } catch (error) {
    console.error("❌ Ошибка создания клиента Google Drive:", error.message);
    process.exit(1);
  }
}

async function testServiceAccountAccess() {
  console.log("🔍 Проверка доступа к Google Drive через Service Account...\n");

  const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  console.log(`📧 Service Account Email: ${clientEmail}\n`);

  const drive = getDriveClient();

  try {
    // Проверяем доступ к Drive API
    console.log("1️⃣ Проверка доступа к Google Drive API...");
    const about = await drive.about.get({
      fields: "user, storageQuota"
    });

    console.log("✅ Подключение к Google Drive API успешно!");
    console.log(`   Пользователь: ${about.data.user?.displayName || "N/A"}`);
    console.log(`   Email: ${about.data.user?.emailAddress || "N/A"}\n`);

    // Проверяем доступ к конкретной папке, если указана
    const folderId = process.argv[2] || process.env.GOOGLE_DRIVE_DEFAULT_PARENT;

    if (folderId) {
      console.log(`2️⃣ Проверка доступа к папке: ${folderId}`);
      try {
        const folder = await drive.files.get({
          fileId: folderId,
          fields: "id, name, mimeType, permissions, parents"
        });

        console.log("✅ Папка найдена!");
        console.log(`   Название: ${folder.data.name}`);
        console.log(`   ID: ${folder.data.id}`);
        console.log(`   Тип: ${folder.data.mimeType}`);

        // Проверяем права доступа
        if (folder.data.permissions) {
          const hasAccess = folder.data.permissions.some(
            (p) => p.emailAddress === clientEmail
          );
          if (hasAccess) {
            console.log(`   ✅ Service Account имеет доступ к папке`);
          } else {
            console.log(`   ⚠️  Service Account не найден в списке разрешений`);
            console.log(`   💡 Нужно расшарить папку на ${clientEmail} с правами "Редактор"`);
          }
        } else {
          console.log(`   ⚠️  Не удалось получить информацию о правах доступа`);
        }
      } catch (error) {
        if (error.code === 404) {
          console.log("❌ Папка не найдена!");
          console.log(`   💡 Проверьте правильность ID папки: ${folderId}`);
          console.log(`   💡 Убедитесь, что папка существует в Google Drive`);
        } else if (error.code === 403) {
          console.log("❌ Нет доступа к папке!");
          console.log(`   💡 Расшарьте папку на ${clientEmail} с правами "Редактор"`);
          console.log(`   💡 Как расшарить:`);
          console.log(`      1. Откройте папку в Google Drive`);
          console.log(`      2. Правой кнопкой → "Поделиться"`);
          console.log(`      3. Добавьте: ${clientEmail}`);
          console.log(`      4. Выберите права: "Редактор"`);
          console.log(`      5. Нажмите "Отправить"`);
        } else {
          console.log(`❌ Ошибка при проверке папки: ${error.message}`);
        }
      }
    } else {
      console.log("⚠️  ID папки не указан");
      console.log("   💡 Укажите ID папки как аргумент:");
      console.log("      node scripts/test-google-drive-access.js <folderId>");
      console.log("   💡 Или задайте GOOGLE_DRIVE_DEFAULT_PARENT в .env");
    }

    // Пробуем создать тестовый файл (если папка указана)
    if (folderId) {
      console.log(`\n3️⃣ Тест создания файла в папке...`);
      try {
        const testFileName = `test_${Date.now()}.txt`;
        const testFile = await drive.files.create({
          requestBody: {
            name: testFileName,
            parents: [folderId]
          },
          media: {
            mimeType: "text/plain",
            body: require("stream").Readable.from(["Test file content"])
          },
          fields: "id, name, webViewLink"
        });

        console.log("✅ Тестовый файл успешно создан!");
        console.log(`   ID: ${testFile.data.id}`);
        console.log(`   Название: ${testFile.data.name}`);

        // Удаляем тестовый файл
        await drive.files.delete({
          fileId: testFile.data.id
        });
        console.log("   🗑️  Тестовый файл удалён");

        console.log("\n✅ Всё работает! Папка доступна для записи.");
      } catch (error) {
        if (error.code === 403) {
          console.log("❌ Нет прав на создание файлов в папке!");
          console.log(`   💡 Расшарьте папку на ${clientEmail} с правами "Редактор"`);
        } else {
          console.log(`❌ Ошибка при создании тестового файла: ${error.message}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ Ошибка при проверке доступа:", error.message);
    if (error.code === 401) {
      console.error("   💡 Проверьте правильность GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY");
    }
    process.exit(1);
  }
}

testServiceAccountAccess().catch((error) => {
  console.error("Фатальная ошибка:", error);
  process.exit(1);
});






