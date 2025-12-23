#!/bin/bash
# Скрипт для применения изменений на Synology
# Выполнить: ssh adminv@192.168.100.222 "bash -s" < apply_changes_on_server.sh

cd /volume1/docker/shortsai/backend

echo "=== Применение изменений на сервере ==="

# 1. Создать diagRoutes.ts
echo "Создание diagRoutes.ts..."
python3 << 'PYEOF'
content = '''import { Router } from "express";
import { authRequired } from "../middleware/auth";
import { db, isFirestoreAvailable } from "../services/firebaseAdmin";
import { Logger } from "../utils/logger";

const router = Router();

// Диагностические эндпоинты доступны только если DEBUG_DIAG=true
const isDiagEnabled = process.env.DEBUG_DIAG === "true";

if (!isDiagEnabled) {
  // Если диагностика отключена, возвращаем 404 для всех запросов
  router.use((req, res) => {
    res.status(404).json({
      error: "Not Found",
      message: "Diagnostic endpoints are disabled. Set DEBUG_DIAG=true to enable."
    });
  });
} else {
  /**
   * GET /api/diag/whoami
   * Возвращает uid из токена (для проверки авторизации)
   */
  router.get("/whoami", authRequired, async (req, res) => {
    try {
      const userId = req.user?.uid || "unknown";
      Logger.info("DIAG /api/diag/whoami", { userId });
      
      return res.json({
        success: true,
        userId,
        hasUser: !!req.user,
        userEmail: req.user?.email || "not available"
      });
    } catch (error: any) {
      Logger.error("DIAG /api/diag/whoami: error", error);
      return res.status(500).json({
        error: "Failed to get user info",
        message: error?.message || String(error)
      });
    }
  });

  /**
   * GET /api/diag/channels
   * Возвращает список channelId из users/{uid}/channels (лимит 20)
   */
  router.get("/channels", authRequired, async (req, res) => {
    try {
      if (!isFirestoreAvailable() || !db) {
        return res.status(503).json({
          error: "FIRESTORE_NOT_AVAILABLE",
          message: "Firestore is not available"
        });
      }

      const userId = req.user?.uid;
      if (!userId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "User ID not found in token"
        });
      }

      Logger.info("DIAG /api/diag/channels: fetching channels", { userId });

      const channelsRef = db
        .collection("users")
        .doc(userId)
        .collection("channels")
        .limit(20);

      const channelsSnapshot = await channelsRef.get();

      const channelIds = channelsSnapshot.docs.map(doc => ({
        id: doc.id,
        exists: true,
        name: doc.data()?.name || "unnamed"
      }));

      Logger.info("DIAG /api/diag/channels: found channels", {
        userId,
        count: channelIds.length,
        channelIds: channelIds.map(c => c.id)
      });

      return res.json({
        success: true,
        userId,
        firestorePath: `users/${userId}/channels`,
        count: channelIds.length,
        channels: channelIds
      });
    } catch (error: any) {
      Logger.error("DIAG /api/diag/channels: error", error);
      return res.status(500).json({
        error: "Failed to fetch channels",
        message: error?.message || String(error)
      });
    }
  });

  /**
   * GET /api/diag/channel/:id
   * Проверяет существование канала по ID и возвращает путь + exists
   */
  router.get("/channel/:id", authRequired, async (req, res) => {
    try {
      if (!isFirestoreAvailable() || !db) {
        return res.status(503).json({
          error: "FIRESTORE_NOT_AVAILABLE",
          message: "Firestore is not available"
        });
      }

      const userId = req.user?.uid;
      const channelId = req.params.id;

      if (!userId) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "User ID not found in token"
        });
      }

      if (!channelId) {
        return res.status(400).json({
          error: "BAD_REQUEST",
          message: "Channel ID is required"
        });
      }

      const firestorePath = `users/${userId}/channels/${channelId}`;
      
      Logger.info("DIAG /api/diag/channel/:id: checking channel", {
        userId,
        channelId,
        firestorePath
      });

      const channelRef = db
        .collection("users")
        .doc(userId)
        .collection("channels")
        .doc(channelId);

      const channelSnap = await channelRef.get();

      const result = {
        success: true,
        userId,
        channelId,
        firestorePath,
        exists: channelSnap.exists,
        data: channelSnap.exists ? {
          name: channelSnap.data()?.name || "unnamed",
          hasGoogleDriveFolderId: !!channelSnap.data()?.googleDriveFolderId
        } : null
      };

      Logger.info("DIAG /api/diag/channel/:id: result", result);

      return res.json(result);
    } catch (error: any) {
      Logger.error("DIAG /api/diag/channel/:id: error", error);
      return res.status(500).json({
        error: "Failed to check channel",
        message: error?.message || String(error)
      });
    }
  });
}

export default router;
'''

import os
os.makedirs('src/routes', exist_ok=True)
with open('src/routes/diagRoutes.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('OK: diagRoutes.ts created')
PYEOF

# 2. Обновить index.ts - добавить импорт diagRoutes
echo "Обновление index.ts..."
python3 << 'PYEOF'
import re

with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Добавить импорт diagRoutes после debugRoutes
if 'import diagRoutes' not in content:
    content = content.replace(
        'import debugRoutes from "./routes/debugRoutes";',
        'import debugRoutes from "./routes/debugRoutes";\nimport diagRoutes from "./routes/diagRoutes";'
    )

# Добавить роут /api/diag после /api/debug
if 'app.use("/api/diag", diagRoutes);' not in content:
    content = content.replace(
        'app.use("/api/debug", debugRoutes);',
        'app.use("/api/debug", debugRoutes);\napp.use("/api/diag", diagRoutes);'
    )

# Добавить middleware логирования для /api/telegram и /api/diag
if '[TELEGRAM/DIAG REQUEST]' not in content:
    # Найти место перед app.use("/api/telegram"
    pattern = r'(  next\(\);\n})(\napp\.use\("/api/telegram")'
    replacement = r'''  next();
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
\2'''
    content = re.sub(pattern, replacement, content)

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('OK: index.ts updated')
PYEOF

# 3. Обновить telegramRoutes.ts - добавить логирование в fetchAndSaveToServer
echo "Обновление telegramRoutes.ts..."
python3 << 'PYEOF'
import re

with open('src/routes/telegramRoutes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Найти блок проверки канала и добавить логирование
pattern = r'(    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала\n    // channelId уже проверен выше и гарантированно не undefined\n    const channelRef = db\n      \.collection\("users"\)\n      \.doc\(userId\)\n      \.collection\("channels"\)\n      \.doc\(channelId!\);\n    const channelSnap = await channelRef\.get\(\);\n\n    if \(!channelSnap\.exists\) \{)'

if re.search(pattern, content):
    replacement = r'''    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
    // channelId уже проверен выше и гарантированно не undefined
    const firestorePath = `users/${userId}/channels/${channelId!}`;
    
    Logger.info("fetchAndSaveToServer: checking channel in Firestore", {
      requestId,
      userId,
      channelId: channelId!,
      firestorePath
    });

    const channelRef = db
      .collection("users")
      .doc(userId)
      .collection("channels")
      .doc(channelId!);
    const channelSnap = await channelRef.get();

    Logger.info("fetchAndSaveToServer: channel check result", {
      requestId,
      userId,
      channelId: channelId!,
      firestorePath,
      exists: channelSnap.exists,
      hasData: channelSnap.exists ? !!channelSnap.data() : false
    });

    if (!channelSnap.exists) {
      Logger.warn("fetchAndSaveToServer: CHANNEL_NOT_FOUND", {
        requestId,
        userId,
        channelId: channelId!,
        firestorePath,
        searchedPath: firestorePath
      });
      
      return res.status(404).json({
        status: "error",
        message: "CHANNEL_NOT_FOUND",
        // Диагностическая информация (только если DEBUG_DIAG включен)
        ...(process.env.DEBUG_DIAG === "true" && {
          debug: {
            userId,
            channelId: channelId!,
            firestorePath,
            searchedPath: firestorePath
          }
        })
      });
    }'''
    
    content = re.sub(pattern, replacement, content)
    
    with open('src/routes/telegramRoutes.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK: telegramRoutes.ts updated')
else:
    print('WARN: Pattern not found in telegramRoutes.ts, file may already be updated')

PYEOF

echo ""
echo "=== Изменения применены ==="
echo "Теперь нужно:"
echo "1. Добавить DEBUG_DIAG=true в .env.production"
echo "2. Пересобрать контейнер: sudo docker-compose build backend"
echo "3. Перезапустить: sudo docker-compose down backend && sudo docker-compose up -d backend"

