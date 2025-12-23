/**
 * Скрипт для тестирования создания папки в Google Drive
 * Запуск: node scripts/test-create-folder.js [folderName] [parentId]
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { google } = require("googleapis");

const DRIVE_FULL_SCOPE = ["https://www.googleapis.com/auth/drive"];

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
      scopes: DRIVE_FULL_SCOPE
    });

    return google.drive({ version: "v3", auth });
  } catch (error) {
    console.error("❌ Ошибка создания клиента Google Drive:", error.message);
    process.exit(1);
  }
}

async function testCreateFolder() {
  const folderName = process.argv[2] || `TestFolder_${Date.now()}`;
  const parentId = process.argv[3] || undefined;

  console.log("🔍 Тестирование создания папки в Google Drive...\n");
  console.log(`📁 Название папки: ${folderName}`);
  console.log(`📂 Родительская папка: ${parentId || "корень Drive"}\n`);

  const drive = getDriveClient();

  try {
    console.log("1️⃣ Создание папки...");

    const requestBody = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      writersCanShare: true
    };

    if (parentId) {
      requestBody.parents = [parentId];
    }

    const response = await drive.files.create({
      requestBody,
      fields: "id, name, webViewLink, parents"
    });

    const folder = response.data;

    console.log("✅ Папка успешно создана!");
    console.log(`   ID: ${folder.id}`);
    console.log(`   Название: ${folder.name}`);
    console.log(`   Ссылка: ${folder.webViewLink || "N/A"}`);
    console.log(`   Родитель: ${folder.parents?.[0] || "root"}\n`);

    console.log("💡 Теперь вы можете:");
    console.log(`   1. Использовать ID "${folder.id}" как GOOGLE_DRIVE_DEFAULT_PARENT в .env`);
    console.log(`   2. Или указать его в настройках канала как Google Drive Folder ID`);
    console.log(`   3. Открыть папку: ${folder.webViewLink || "N/A"}\n`);

    console.log("⚠️  ВАЖНО: Чтобы загружать файлы в эту папку, расшарьте её на Service Account:");
    console.log(`   Email: ${process.env.GOOGLE_DRIVE_CLIENT_EMAIL}`);
    console.log(`   Права: "Редактор"\n`);

    return folder.id;
  } catch (error) {
    console.error("❌ Ошибка при создании папки:", error.message);

    if (error.code === 401) {
      console.error("   💡 Проверьте правильность GOOGLE_DRIVE_CLIENT_EMAIL и GOOGLE_DRIVE_PRIVATE_KEY");
    } else if (error.code === 403) {
      console.error("   💡 Если указана родительская папка, убедитесь, что она расшарена на Service Account");
    } else if (error.code === 404 && parentId) {
      console.error(`   💡 Родительская папка (${parentId}) не найдена или недоступна`);
    }

    process.exit(1);
  }
}

testCreateFolder().catch((error) => {
  console.error("Фатальная ошибка:", error);
  process.exit(1);
});





