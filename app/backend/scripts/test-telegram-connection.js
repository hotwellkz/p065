/**
 * Скрипт для проверки подключения к Telegram серверам
 * Запуск: node scripts/test-telegram-connection.js
 */

const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

const TELEGRAM_SERVERS = [
  "149.154.167.41", // Основной сервер Telegram
  "149.154.167.50",
  "149.154.175.50",
  "91.108.56.100"
];

async function pingServer(ip) {
  try {
    const { stdout } = await execAsync(`ping -n 2 ${ip}`, { timeout: 5000 });
    return { ip, success: true, output: stdout };
  } catch (error) {
    return { ip, success: false, error: error.message };
  }
}

async function testConnection() {
  console.log("🔍 Проверка подключения к серверам Telegram...\n");

  const results = await Promise.all(
    TELEGRAM_SERVERS.map(ip => pingServer(ip))
  );

  let allSuccess = true;
  results.forEach(({ ip, success, output, error }) => {
    if (success) {
      console.log(`✅ ${ip} - доступен`);
    } else {
      console.log(`❌ ${ip} - недоступен: ${error}`);
      allSuccess = false;
    }
  });

  console.log("\n" + "=".repeat(50));
  if (allSuccess) {
    console.log("✅ Все серверы Telegram доступны");
    console.log("💡 Если проблемы с таймаутами продолжаются, проверьте:");
    console.log("   1. Настройки фаервола (порт 443 должен быть открыт)");
    console.log("   2. Прокси-серверы (если используются)");
    console.log("   3. Антивирус/межсетевой экран");
  } else {
    console.log("❌ Некоторые серверы недоступны");
    console.log("💡 Рекомендации:");
    console.log("   1. Проверьте подключение к интернету");
    console.log("   2. Проверьте настройки фаервола");
    console.log("   3. Попробуйте использовать VPN или прокси");
  }
}

testConnection().catch(console.error);






