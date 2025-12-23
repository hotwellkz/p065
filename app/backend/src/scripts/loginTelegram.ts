import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import readline from "readline";
import { saveSessionString } from "../telegram/sessionStore";

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? "";

if (!apiId || !apiHash) {
  // eslint-disable-next-line no-console
  console.error("TELEGRAM_API_ID и TELEGRAM_API_HASH должны быть заданы в .env");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("=== Telegram CLI логин ===");

  const phone = (await question("Введите номер телефона (в формате +7...): ")).trim();
  if (!phone) {
    // eslint-disable-next-line no-console
    console.error("Номер телефона обязателен");
    process.exit(1);
  }

  const session = new StringSession("");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
    useWSS: false // Используем TCP для большей стабильности
  });

  // Добавляем таймаут подключения
  try {
    await Promise.race([
      client.connect(),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Connection timeout after 30 seconds")), 30000)
      )
    ]);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Ошибка подключения к Telegram:", error);
    rl.close();
    process.exit(1);
  }

  // Используем high-level API client.start, который сам вызывает sendCode/signIn
  try {
    await client.start({
      phoneNumber: async () => phone,
      phoneCode: async () =>
        (await question("Введите код из Telegram/SMS: ")).trim(),
      password: async () =>
        (await question(
          "Для этого аккаунта может быть включён пароль Telegram (2FA).\nЕсли он включён, введите пароль, иначе оставьте пустым и нажмите Enter: "
        )).trim(),
      onError: (err) => {
        // eslint-disable-next-line no-console
        console.error("Ошибка при входе в Telegram:", err);
      }
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Ошибка при выполнении client.start:", err);
    rl.close();
    process.exit(1);
  }

  const stringSession = String(client.session.save());
  saveSessionString(stringSession);

  // eslint-disable-next-line no-console
  console.log("Успешный вход в Telegram. Сессия сохранена локально.");

  rl.close();
  await client.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Фатальная ошибка CLI-логина:", err);
  rl.close();
  process.exit(1);
});


