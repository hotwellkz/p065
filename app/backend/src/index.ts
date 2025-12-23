import "dotenv/config";
import express from "express";
import cors from "cors";
import cron from "node-cron";
// Инициализация Firebase Admin (должна быть до импорта роутов, которые используют Firestore)
import "./services/firebaseAdmin";

// Подавляем TIMEOUT ошибки от Telegram библиотеки - они не критичны и забивают логи
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  const message = args[0]?.toString() || "";
  // Пропускаем TIMEOUT ошибки от telegram библиотеки
  if (message.includes("Error: TIMEOUT") && message.includes("telegram/client/updates")) {
    return; // Не выводим эти ошибки
  }
  originalConsoleError.apply(console, args);
};

// Также обрабатываем unhandledRejection для TIMEOUT ошибок
process.on("unhandledRejection", (reason: any) => {
  if (reason?.message === "TIMEOUT" || reason?.message?.includes("TIMEOUT")) {
    // Подавляем TIMEOUT ошибки от Telegram - они не критичны
    return;
  }
  // Для остальных ошибок используем стандартную обработку
  Logger.error("Unhandled promise rejection", reason);
});
import telegramRoutes from "./routes/telegramRoutes";
import telegramIntegrationRoutes from "./routes/telegramIntegrationRoutes";
import cronRoutes from "./routes/cronRoutes";
import promptRoutes from "./routes/promptRoutes";
import debugRoutes from "./routes/debugRoutes";
import testFirestoreRoutes from "./routes/testFirestoreRoutes";
import authRoutes from "./routes/authRoutes";
import channelRoutes from "./routes/channelRoutes";
import scheduleRoutes from "./routes/scheduleRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import adminRoutes from "./routes/adminRoutes";
import helpRoutes from "./routes/helpRoutes";
import userSettingsRoutes from "./routes/userSettingsRoutes";
import mediaRoutes from "./routes/mediaRoutes";
import { processAutoSendTick } from "./services/autoSendScheduler";
import { Logger } from "./utils/logger";
import { getFirestoreInfo, isFirestoreAvailable } from "./services/firebaseAdmin";

const app = express();
const port = Number(process.env.PORT) || 8080;

// Нормализуем FRONTEND_ORIGIN (убираем завершающий слеш)
const normalizeOrigin = (origin: string | undefined): string | undefined => {
  if (!origin) return undefined;
  return origin.replace(/\/+$/, ""); // Убираем завершающие слеши
};

const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "http://localhost:5173";

app.use(
  cors({
    origin: (origin, callback) => {
      // Разрешаем запросы без origin (например, Postman, curl)
      if (!origin) {
        return callback(null, true);
      }
      
      // Нормализуем origin (убираем завершающий слеш)
      const normalizedOrigin = origin.replace(/\/+$/, "");
      const normalizedFrontendOrigin = frontendOrigin.replace(/\/+$/, "");
      
      // Разрешаем запросы с нормализованного origin
      if (normalizedOrigin === normalizedFrontendOrigin) {
        return callback(null, true);
      }
      
      // Также разрешаем запросы с завершающим слешом для совместимости
      if (normalizedOrigin + "/" === normalizedFrontendOrigin || 
          normalizedOrigin === normalizedFrontendOrigin + "/") {
        return callback(null, true);
      }
      
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
// Увеличиваем лимит размера тела запроса для импорта каналов (до 10MB)
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public")); // Для статических файлов (HTML страница для OAuth)

app.use("/api/telegram", telegramRoutes);
app.use("/api/telegram-integration", telegramIntegrationRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/prompt", promptRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/test", testFirestoreRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/user-settings", userSettingsRoutes);
app.use("/api/media", mediaRoutes);

// Логируем подключенные маршруты для диагностики
Logger.info("Backend routes registered", {
  routes: [
    "/api/telegram",
    "/api/telegram-integration",
    "/api/cron",
    "/api/prompt",
    "/api/debug",
    "/api/test",
    "/api/auth",
    "/api/channels",
    "/api/schedule",
    "/api/notifications",
    "/api/media"
  ]
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Слушаем на всех интерфейсах (0.0.0.0) для доступа через VPN
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port} (0.0.0.0)`);
  
  // Логируем STORAGE_ROOT при старте
  const pathModule = require("path");
  const storageRoot = process.env.STORAGE_ROOT || pathModule.resolve(process.cwd(), 'storage/videos');
  console.log('[Storage] Using STORAGE_ROOT:', storageRoot);
  
  // Логируем информацию о Firebase при старте
  const firestoreInfo = getFirestoreInfo();
  Logger.info("Backend startup: Firebase Admin status", {
    isFirestoreAvailable: isFirestoreAvailable(),
    firestoreInfo: firestoreInfo,
    env: {
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "not set",
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? "set" : "not set",
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? "set" : "not set",
      FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? "set" : "not set"
    }
  });
});

// Запускаем планировщик автоотправки каждую минуту
// Это работает только если сервер запущен постоянно (например, на VM)
// Для Cloud Run используйте HTTP-эндпоинт /api/cron/manual-tick с Cloud Scheduler
if (process.env.ENABLE_CRON_SCHEDULER !== "false") {
  cron.schedule("* * * * *", async () => {
    Logger.info("Cron scheduler: running auto-send tick");
    try {
      await processAutoSendTick();
    } catch (error) {
      Logger.error("Cron scheduler: error in auto-send tick", error);
    }
  });
  Logger.info("Cron scheduler enabled: auto-send will run every minute");
} else {
  Logger.info("Cron scheduler disabled: use /api/cron/manual-tick with Cloud Scheduler");
}

// Blottata мониторинг - работает с локальным хранилищем
if (process.env.ENABLE_CRON_SCHEDULER !== "false") {
  import("./services/blottataLocalMonitor").then(({ processBlottataTick }) => {
    cron.schedule("* * * * *", async () => {
      Logger.info("Cron scheduler: running Blottata monitoring tick");
      try {
        await processBlottataTick();
      } catch (error) {
        Logger.error("Cron scheduler: error in Blottata monitoring tick", error);
      }
    });
    Logger.info("Cron scheduler enabled: Blottata monitoring will run every minute");
  }).catch((error) => {
    Logger.error("Failed to load Blottata monitoring service", error);
  });
}


