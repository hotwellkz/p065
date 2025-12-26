process.stdout.write("[DEBUG] Starting backend application...\n");
process.stderr.write("[DEBUG] Starting backend application (stderr)...\n");
import "dotenv/config";
process.stdout.write(`[DEBUG] dotenv loaded, PORT: ${process.env.PORT}\n`);
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
import diagRoutes from "./routes/diagRoutes";
import testFirestoreRoutes from "./routes/testFirestoreRoutes";
import authRoutes from "./routes/authRoutes";
import channelRoutes from "./routes/channelRoutes";
import scheduleRoutes from "./routes/scheduleRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import adminRoutes from "./routes/adminRoutes";
import helpRoutes from "./routes/helpRoutes";
import userSettingsRoutes from "./routes/userSettingsRoutes";
import mediaRoutes from "./routes/mediaRoutes";
import musicClipsRoutes from "./routes/musicClipsRoutes";
import webhooksRoutes from "./routes/webhooksRoutes";
import { processAutoSendTick } from "./services/autoSendScheduler";
import { getFirestoreInfo, isFirestoreAvailable } from "./services/firebaseAdmin";
import { getSunoClient } from "./services/sunoClient";

const app = express();
const port = Number(process.env.PORT) || 8080;

// Нормализуем FRONTEND_ORIGIN (убираем завершающий слеш)
const normalizeOrigin = (origin: string | undefined): string | undefined => {
  if (!origin) return undefined;
  return origin.replace(/\/+$/, ""); // Убираем завершающие слеши
};

const frontendOrigin = normalizeOrigin(process.env.FRONTEND_ORIGIN) ?? "https://shortsai.ru";

// Разрешенные origins для CORS
const allowedOrigins = [
  "https://shortsai.ru",
  "https://www.shortsai.ru",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080"
];

// Добавляем origins из env, если указаны
if (frontendOrigin && !allowedOrigins.includes(frontendOrigin)) {
  allowedOrigins.push(frontendOrigin);
  // Если в env указано несколько origins через запятую, добавляем их все
  if (frontendOrigin.includes(",")) {
    const envOrigins = frontendOrigin.split(",").map(o => o.trim());
    envOrigins.forEach(origin => {
      if (!allowedOrigins.includes(origin)) {
        allowedOrigins.push(origin);
      }
    });
  }
}

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
      const normalizedOrigin = origin.replace(/\/+$/, "");
      
      // Проверяем, есть ли origin в списке разрешенных
      const isAllowed = allowedOrigins.some(allowed => {
        const normalizedAllowed = allowed.replace(/\/+$/, "");
        return normalizedOrigin === normalizedAllowed || 
               normalizedOrigin + "/" === normalizedAllowed ||
               normalizedAllowed + "/" === normalizedOrigin;
      });
      
      if (isAllowed) {
        return callback(null, true);
      }
      
      // Поддержка wildcard для Netlify доменов (*.netlify.app)
      const wildcardOrigins = allowedOrigins.filter(o => o.includes("*"));
      for (const wildcardOrigin of wildcardOrigins) {
        const pattern = wildcardOrigin.replace(/\*/g, ".*");
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(normalizedOrigin)) {
          return callback(null, true);
        }
      }
      
      // Логирование отклоненного origin
      Logger.warn(`[CORS] Origin отклонен: "${normalizedOrigin}"`, {
        allowedOrigins,
        frontendOrigin
      });
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Request-Method",
      "Access-Control-Request-Headers",
      "x-user-id",
      "x-request-id"
    ],
    exposedHeaders: ["X-Request-ID", "X-App-Instance", "X-App-Version"]
  })
);
// Увеличиваем лимит размера тела запроса для импорта каналов (до 10MB)
app.use(express.json({ limit: "10mb" }));
// Устанавливаем UTF-8 для всех JSON ответов
app.use((req, res, next) => {
  res.charset = "utf-8";
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use(express.static("public")); // Для статических файлов (HTML страница для OAuth)

// Диагностическое логирование всех входящих запросов
app.use((req, res, next) => {
  // Генерируем уникальный request ID для отслеживания
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  (req as any).requestId = requestId;
  
  // Добавляем диагностические заголовки в ответ
  const os = require("os");
  const hostname = process.env.HOSTNAME || os.hostname() || "unknown";
  res.setHeader("X-App-Instance", hostname);
  res.setHeader("X-App-Version", process.env.GIT_SHA || process.env.BUILD_DATE || "not-set");
  res.setHeader("X-App-Port", String(port));
  res.setHeader("X-Request-ID", requestId);
  // Уникальный маркер для идентификации backend
  res.setHeader("X-Backend-Marker", `shorts-backend-${hostname}-${port}`);
  
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

// Временное логирование для /api/telegram/* и /api/diag/* с userId
app.use(["/api/telegram", "/api/diag"], (req, res, next) => {
  const requestId = (req as any).requestId || "unknown";
  
  // Пытаемся извлечь userId из токена (если есть auth middleware)
  const authHeader = req.headers.authorization;
  let userIdFromToken = "not_available";
  
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      // Простое логирование токена (без декодирования, так как это требует Firebase Admin)
      // Реальный userId будет доступен после authRequired middleware
      userIdFromToken = "token_present";
    } catch (e) {
      userIdFromToken = "token_parse_error";
    }
  }
  
  Logger.info(`[TELEGRAM/DIAG REQUEST] ${req.method} ${req.path}`, {
    requestId,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    hasAuthHeader: !!authHeader,
    userIdFromToken,
    bodyKeys: req.body ? Object.keys(req.body) : []
  });
  
  // Логируем ответ после отправки
  const originalSend = res.send;
  res.send = function(body: any) {
    Logger.info(`[TELEGRAM/DIAG RESPONSE] ${req.method} ${req.path}`, {
      requestId,
      statusCode: res.statusCode,
      userId: (req as any).user?.uid || "not_set",
      responseLength: body ? String(body).length : 0
    });
    return originalSend.call(this, body);
  };
  
  next();
});

app.use("/api/telegram", telegramRoutes);
app.use("/api/telegram-integration", telegramIntegrationRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/prompt", promptRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/diag", diagRoutes);
app.use("/api/test", testFirestoreRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/schedule", scheduleRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/help", helpRoutes);
app.use("/api/user-settings", userSettingsRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/music-clips", musicClipsRoutes);
app.use("/api/webhooks", webhooksRoutes);

// Обработчик 404 - логируем все запросы, которые не нашли роут
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = (req as any).requestId || "unknown";
  
  Logger.warn("[404 NOT FOUND] Route not found", {
    requestId,
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    url: req.url,
    baseUrl: req.baseUrl,
    headers: {
      host: req.headers.host,
      "user-agent": req.headers["user-agent"],
      "content-type": req.headers["content-type"],
      authorization: req.headers.authorization ? "present" : "missing",
      "x-forwarded-for": req.headers["x-forwarded-for"],
      "x-real-ip": req.headers["x-real-ip"]
    },
    body: req.body ? Object.keys(req.body) : []
  });
  
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId,
    path: req.path,
    originalUrl: req.originalUrl
  });
});

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

// Валидация конфигурации Music Clips при старте
try {
  const sunoClient = getSunoClient();
  if (!sunoClient.isConfigured()) {
    Logger.warn("[Startup] SUNO_API_KEY is not configured - Music Clips functionality will be unavailable", {
      hint: "Set SUNO_API_KEY in environment variables"
    });
  } else {
    Logger.info("[Startup] Music Clips configuration validated", {
      sunoConfigured: true
    });
  }
} catch (error: any) {
  Logger.error("[Startup] Error validating Music Clips configuration", {
    error: error?.message || String(error)
  });
}

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
    "/api/media",
    "/api/music-clips"
  ],
  examplePaths: [
    "POST /api/telegram/fetchAndSaveToServer",
    "POST /api/telegram/fetchLatestVideoToDrive",
    "GET /api/telegram/status",
    "GET /health",
    "GET /api/music-clips/health"
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

// Music Clips планировщик - отдельный от shorts
if (process.env.ENABLE_CRON_SCHEDULER !== "false") {
  import("./services/musicClipsScheduler").then(({ processMusicClipsTick }) => {
    cron.schedule("* * * * *", async () => {
      Logger.info("[MusicClips] Cron scheduler: running music clips tick");
      try {
        await processMusicClipsTick();
      } catch (error) {
        Logger.error("[MusicClips] Cron scheduler: error in music clips tick", error);
      }
    });
    Logger.info("[MusicClips] Cron scheduler enabled: music clips will run every minute");
  }).catch((error) => {
    Logger.error("[MusicClips] Failed to load music clips scheduler service", error);
  });
}


