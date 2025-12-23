#!/bin/bash
# Восстановление полного файла index.ts на Synology
# ВНИМАНИЕ: Это большой скрипт, лучше выполнить через Python

cd /volume1/docker/shortsai/backend

# Создаем резервную копию поврежденного файла
cp src/index.ts src/index.ts.broken.$(date +%Y%m%d_%H%M%S)

echo "Восстанавливаем полный файл index.ts..."
echo "Это займет некоторое время..."

# Используем Python для создания полного файла
python3 << 'PYEOF'
# Полный содержимое файла index.ts
full_content = '''process.stdout.write("[DEBUG] Starting backend application...\\n");
process.stderr.write("[DEBUG] Starting backend application (stderr)...\\n");
import "dotenv/config";
process.stdout.write(`[DEBUG] dotenv loaded, PORT: ${process.env.PORT}\\n`);
import express from "express";
import cors from "cors";
import cron from "node-cron";
import { Logger } from "./utils/logger";
console.log("[DEBUG] Logger imported");
// Инициализация Firebase Admin (должна быть до импорта роутов, которые используют Firestore)
import "./services/firebaseAdmin";
console.log("[DEBUG] Firebase Admin imported");

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
import { getFirestoreInfo, isFirestoreAvailable } from "./services/firebaseAdmin";

const app = express();
const port = Number(process.env.PORT) || 8080;

// Нормализуем FRONTEND_ORIGIN (убираем завершающий слеш)
const normalizeOrigin = (origin: string | undefined): string | undefined => {
  if (!origin) return undefined;
  return origin.replace(/\\/+$/, ""); // Убираем завершающие слеши
};

const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https://shortsai.ru";

// CORS middleware - настраиваем ОДИН РАЗ
// Nginx больше не добавляет CORS заголовки, все обрабатывается здесь
app.use(
  cors({
    origin: (origin, callback) => {
      // Разрешаем запросы без origin (например, Postman, curl, прямые запросы)
      if (!origin) {
        return callback(null, true);
      }
      
      // Нормализуем origin (убираем завершающий слеш)
      const normalizedOrigin = origin.replace(/\\/+$/, "");
      const normalizedFrontendOrigin = frontendOrigin.replace(/\\/+$/, "");
      
      // Поддержка wildcard для Netlify доменов (*.netlify.app)
      if (normalizedFrontendOrigin.includes("*")) {
        const pattern = normalizedFrontendOrigin.replace(/\\*/g, ".*");
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(normalizedOrigin)) {
          return callback(null, true);
        }
      }
      
      // Разрешаем запросы с нормализованного origin
      if (normalizedOrigin === normalizedFrontendOrigin) {
        return callback(null, true);
      }
      
      // Также разрешаем запросы с завершающим слешом для совместимости
      if (normalizedOrigin + "/" === normalizedFrontendOrigin || 
          normalizedOrigin === normalizedFrontendOrigin + "/") {
        return callback(null, true);
      }
      
      // Поддержка множественных доменов через запятую
      if (normalizedFrontendOrigin.includes(",")) {
        const allowedOrigins = normalizedFrontendOrigin.split(",").map(o => o.trim());
        if (allowedOrigins.some(allowed => {
          const normalizedAllowed = allowed.replace(/\\/+$/, "");
          return normalizedOrigin === normalizedAllowed || 
                 normalizedOrigin + "/" === normalizedAllowed ||
                 normalizedAllowed + "/" === normalizedOrigin;
        })) {
          return callback(null, true);
        }
      }
      
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"]
  })
);
// Увеличиваем лимит размера тела запроса для импорта каналов (до 10MB)
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public")); // Для статических файлов (HTML страница для OAuth)

// Диагностическое логирование всех входящих запросов
app.use((req, res, next) => {
  // Генерируем уникальный request ID для отслеживания
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  (req as any).requestId = requestId;
  
  // Добавляем диагностические заголовки в ответ
  const os = require("os");
  res.setHeader("X-App-Instance", process.env.HOSTNAME || os.hostname() || "unknown");
  res.setHeader("X-App-Version", process.env.GIT_SHA || process.env.BUILD_DATE || "not-set");
  res.setHeader("X-App-Port", String(port));
  res.setHeader("X-Request-ID", requestId);
  
  Logger.info("INCOMING REQUEST", {
    requestId,
    method: req.method,
    originalUrl: req.originalUrl,
    url: req.url,
    path: req.path,
    baseUrl: req.baseUrl,
    headers: {
      host: req.headers.host,
      "content-type": req.headers["content-type"],
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : "none",
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "x-real-ip": req.headers["x-real-ip"]
    }
  });
  next();
});

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

// Глобальный обработчик ошибок (должен быть после всех роутов)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = (req as any).requestId || "unknown";
  const errorMessage = String(err?.message ?? err);
  const stackTrace = err?.stack || "No stack trace available";
  
  Logger.error("Global error handler", {
    requestId,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    error: errorMessage,
    errorName: err?.name,
    errorCode: err?.code,
    stackTrace,
    body: req.body
  });
  
  // Если ответ уже отправлен, передаем ошибку дальше
  if (res.headersSent) {
    return next(err);
  }
  
  // Возвращаем ошибку с деталями
  res.status(err?.status || 500).json({
    error: err?.name || "INTERNAL_SERVER_ERROR",
    message: errorMessage,
    requestId,
    ...(process.env.NODE_ENV !== "production" && { stackTrace })
  });
});

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
  ],
  examplePaths: [
    "POST /api/telegram/fetchAndSaveToServer",
    "POST /api/telegram/fetchLatestVideoToDrive",
    "GET /api/telegram/status",
    "GET /health"
  ]
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Слушаем на всех интерфейсах (0.0.0.0) для доступа через VPN
console.log("[DEBUG] About to start server on port:", port);
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


'''

# Записываем полный файл
with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(full_content)

# Проверяем
with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    print(f'✓ Файл восстановлен: {len(lines)} строк')
    print(f'✓ Проверка: cors найден на строке {[i+1 for i, l in enumerate(lines) if "cors" in l.lower() and "import" not in l][0] if [i+1 for i, l in enumerate(lines) if "cors" in l.lower() and "import" not in l] else "не найден"}')
    print(f'✓ Проверка: app.use(cors найден на строке {[i+1 for i, l in enumerate(lines) if "app.use" in l and "cors" in l][0] if [i+1 for i, l in enumerate(lines) if "app.use" in l and "cors" in l] else "не найден"}')
    print(f'✓ Проверка: methods найден: {"да" if "methods:" in "".join(lines) else "нет"}')
PYEOF

echo ""
echo "Проверка восстановленного файла:"
wc -l src/index.ts
grep -n "methods:" src/index.ts
grep -n "app.use" src/index.ts | grep cors

echo ""
echo "Пересборка контейнера..."
sudo docker-compose build && sudo docker-compose restart
echo "✓ Готово!"


