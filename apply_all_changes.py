#!/usr/bin/env python3
import re
import os

os.chdir('/volume1/docker/shortsai/backend')

# 1. Обновить index.ts
print("Updating index.ts...")
with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Добавить импорт diagRoutes
if 'import diagRoutes' not in content:
    content = content.replace(
        'import debugRoutes from "./routes/debugRoutes";',
        'import debugRoutes from "./routes/debugRoutes";\nimport diagRoutes from "./routes/diagRoutes";'
    )
    print("  Added diagRoutes import")

# Добавить роут /api/diag
if 'app.use("/api/diag", diagRoutes);' not in content:
    content = content.replace(
        'app.use("/api/debug", debugRoutes);',
        'app.use("/api/debug", debugRoutes);\napp.use("/api/diag", diagRoutes);'
    )
    print("  Added /api/diag route")

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("OK: index.ts updated\n")

# 2. Обновить telegramRoutes.ts
print("Updating telegramRoutes.ts...")
with open('src/routes/telegramRoutes.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Найти и заменить блок проверки канала
pattern = r'(    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала\n    // channelId уже проверен выше и гарантированно не undefined\n    const channelRef = db\n      \.collection\("users"\)\n      \.doc\(userId\)\n      \.collection\("channels"\)\n      \.doc\(channelId!\);\n    const channelSnap = await channelRef\.get\(\);\n\n    if \(!channelSnap\.exists\) \{)'

if re.search(pattern, content):
    replacement = '''    // Проверяем, что пользователь имеет доступ к этому каналу и читаем данные канала
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
    print("  Added logging to fetchAndSaveToServer")
    
    with open('src/routes/telegramRoutes.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print("OK: telegramRoutes.ts updated\n")
else:
    print("WARN: Pattern not found, file may already be updated\n")

# 3. Добавить DEBUG_DIAG в .env.production
print("Updating .env.production...")
if os.path.exists('.env.production'):
    with open('.env.production', 'r', encoding='utf-8') as f:
        env_content = f.read()
    
    if 'DEBUG_DIAG=' not in env_content:
        env_content += '\n# Диагностические эндпоинты\nDEBUG_DIAG=true\n'
        with open('.env.production', 'w', encoding='utf-8') as f:
            f.write(env_content)
        print("  Added DEBUG_DIAG=true")
    else:
        # Обновить существующий
        env_content = re.sub(r'^DEBUG_DIAG=.*', 'DEBUG_DIAG=true', env_content, flags=re.MULTILINE)
        with open('.env.production', 'w', encoding='utf-8') as f:
            f.write(env_content)
        print("  Updated DEBUG_DIAG=true")
    print("OK: .env.production updated\n")
else:
    print("WARN: .env.production not found\n")

print("=== All changes applied ===")
print("Next steps:")
print("1. sudo /usr/local/bin/docker-compose build backend")
print("2. sudo /usr/local/bin/docker-compose down backend")
print("3. sudo /usr/local/bin/docker-compose up -d backend")

