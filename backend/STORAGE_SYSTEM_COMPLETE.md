# ✅ Система хранения видео - ГОТОВО

## Что сделано

### 1. ✅ Создан единый StorageService
- Файл: `backend/src/services/storageService.ts`
- Структура: `storage/videos/users/{userId}/channels/{channelId}/inbox/`
- Использует только `userId` (не email)
- Атомарная запись через `.part` файлы
- Логирование абсолютных путей

### 2. ✅ Исправлен docker-compose.yml
- Volume маппинг: `./storage:/app/storage`
- На хосте: `/volume1/docker/shortsai/backend/storage`
- Удалён неправильный маппинг `./videos:/data/shortsai/videos`

### 3. ✅ Добавлен диагностический endpoint
- `GET /api/diag/storage` (требует авторизации)
- Показывает: root, exists, writable, примеры путей

### 4. ✅ Интегрирован в fetchAndSaveToServer
- Использует новый StorageService
- Генерирует стабильный `videoId`
- Сохраняет метаданные в JSON

## Структура хранения

```
storage/videos/
  users/
    {userId}/
      channels/
        {channelId}/
          inbox/                    # Новые скачанные видео
            {videoId}.mp4
            {videoId}.json          # Метаданные
          uploaded/
            youtube/
              {videoId}.mp4
              {videoId}.json
            tiktok/
              {videoId}.mp4
              {videoId}.json
          failed/
            {videoId}.log
          tmp/                      # Временные файлы
```

## Команды PowerShell для деплоя

### 1. Загрузить изменения на сервер

```powershell
# Загрузить docker-compose.yml
Get-Content backend\docker-compose.yml | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/docker-compose.yml"

# Загрузить StorageService
Get-Content backend\src\services\storageService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/storageService.ts"

# Загрузить обновлённые routes
Get-Content backend\src\routes\telegramRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/telegramRoutes.ts"

# Загрузить diagRoutes
Get-Content backend\src\routes\diagRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/diagRoutes.ts"

# Загрузить fileUtils
Get-Content backend\src\utils\fileUtils.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/utils/fileUtils.ts"
```

### 2. Перезапустить контейнер

```powershell
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose up -d --build
```

### 3. Проверить диагностику storage

```powershell
# Получить токен авторизации (из браузера DevTools)
$token = "YOUR_AUTH_TOKEN"

# Проверить storage endpoint
curl -H "Authorization: Bearer $token" http://192.168.100.222:3000/api/diag/storage | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### 4. Проверить файлы на Synology

```powershell
# SSH и проверка структуры
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && ls -la storage/videos/users/ 2>&1"

# Найти все видео файлы
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos -type f -name '*.mp4' 2>&1 | head -10"

# Показать структуру
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && find storage/videos -type d 2>&1 | sort"
```

### 5. Просмотр логов

```powershell
# Логи с фильтром по STORAGE
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=200 backend | grep -E 'STORAGE|storage|resolvedPath'"

# Последние 100 строк
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=100 backend"
```

## Проверка работы

### Тест 1: Сохранение видео
1. Через UI вызвать "Забрать видео из SyntX"
2. Проверить логи: должно быть `[STORAGE] save done`
3. Проверить файл на диске:
   ```powershell
   ssh adminv@192.168.100.222 "ls -lh /volume1/docker/shortsai/backend/storage/videos/users/*/channels/*/inbox/*.mp4"
   ```

### Тест 2: Диагностика
```powershell
curl -H "Authorization: Bearer $token" http://192.168.100.222:3000/api/diag/storage
```

Должно вернуть:
```json
{
  "success": true,
  "storage": {
    "root": "/app/storage",
    "resolvedRoot": "/app/storage",
    "exists": true,
    "writable": true
  },
  "examplePaths": {
    "inboxPath": {
      "path": "/app/storage/videos/users/.../channels/.../inbox/....mp4",
      "resolved": "/app/storage/videos/users/.../channels/.../inbox/....mp4"
    }
  }
}
```

## Что осталось сделать

1. ⏳ Интегрировать StorageService в `importVideo` endpoint
2. ⏳ Интегрировать StorageService в `downloadAndSaveToLocal`
3. ⏳ Создать скрипт миграции старых файлов
4. ⏳ Добавить `moveToUploaded` после публикации
5. ⏳ Добавить `deleteUser` и `deleteChannel` при удалении

## Важно

- ✅ Все пути детерминированы: `userId` + `channelId` + `videoId`
- ✅ Атомарная запись через `.part` файлы
- ✅ Логирование абсолютных путей при каждом сохранении
- ✅ Volume правильно маппится на хост

## Если файлы не появляются

1. Проверить volume маппинг:
   ```powershell
   ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose exec backend ls -la /app/storage"
   ```

2. Проверить STORAGE_ROOT в env:
   ```powershell
   ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose exec backend env | grep STORAGE"
   ```

3. Проверить логи:
   ```powershell
   ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=50 backend | grep -i storage"
   ```


