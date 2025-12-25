# Команды для деплоя изменений channel folder structure

## ✅ Изменённые файлы

- ✅ `backend/src/utils/fileUtils.ts` - добавлена `channelNameToSlug`
- ✅ `backend/src/utils/channelUtils.ts` - новый файл для работы с каналами
- ✅ `backend/src/services/storageService.ts` - обновлены методы для `channelFolderKey`
- ✅ `backend/src/services/videoDownloadService.ts` - обновлено использование StorageService
- ✅ `backend/src/routes/telegramRoutes.ts` - обновлено использование StorageService
- ✅ `backend/src/routes/diagRoutes.ts` - обновлено использование StorageService
- ✅ `backend/src/routes/channelRoutes.ts` - добавлено сохранение `initialName`
- ✅ `backend/src/scripts/migrateChannelFolders.ts` - новый скрипт миграции

## 🚀 Шаги деплоя

### 1. Загрузить файлы на Synology

```powershell
# Загрузить изменённые файлы
Get-Content backend\src\utils\fileUtils.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/utils/fileUtils.ts"
Get-Content backend\src\utils\channelUtils.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/utils/channelUtils.ts"
Get-Content backend\src\services\storageService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/storageService.ts"
Get-Content backend\src\services\videoDownloadService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/videoDownloadService.ts"
Get-Content backend\src\routes\telegramRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/telegramRoutes.ts"
Get-Content backend\src\routes\diagRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/diagRoutes.ts"
Get-Content backend\src\routes\channelRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/channelRoutes.ts"
Get-Content backend\src\scripts\migrateChannelFolders.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/scripts/migrateChannelFolders.ts"
```

### 2. Пересобрать и перезапустить контейнер

```bash
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

### 3. Проверить логи после запуска

```bash
sudo /usr/local/bin/docker compose logs backend --tail=50 | grep -E "STORAGE|channelFolderKey|channelSlug|initialName"
```

**Ожидаемый вывод:**
```
[STORAGE] StorageService initialized
[STORAGE] channelFolderKey resolved { channelId: ..., channelFolderKey: ... }
```

### 4. Запустить миграцию существующих папок каналов

```bash
sudo /usr/local/bin/docker compose exec backend node dist/scripts/migrateChannelFolders.js
```

### 5. Проверить отчёт миграции

```bash
sudo /usr/local/bin/docker compose exec backend cat /app/storage/videos/users/migration-channels-report.json
```

### 6. Проверить структуру папок на хосте

```bash
# Посмотреть все папки каналов
find /volume1/docker/shortsai/backend/storage/videos/users -type d -path "*/channels/*" | head -20

# Найти все MP4 файлы
find /volume1/docker/shortsai/backend/storage/videos/users -name "*.mp4" -type f | head -10

# Посмотреть дерево для конкретного пользователя
ls -la /volume1/docker/shortsai/backend/storage/videos/users/{emailSlug__userId}/channels/
```

## ✅ Проверка работы

### Тест 1: Создание нового канала

1. Откройте UI
2. Создайте канал с названием "Test Channel Name"
3. Скачайте видео через кнопку "Забрать видео из SyntX на сервер"
4. Проверьте логи:
   ```bash
   sudo /usr/local/bin/docker compose logs backend --tail=100 | grep -E "channelFolderKey|channelName"
   ```
5. Проверьте файл на хосте:
   ```bash
   find /volume1/docker/shortsai/backend/storage/videos/users -name "test-channel-name*" -type d
   ```

**Ожидаемый результат:**
- В логах видно `channelFolderKey: 'test-channel-name__{channelId}'`
- Файл сохранён в папке формата `{channelSlug}__{channelId}`

### Тест 2: Переименование канала

1. Переименуйте канал в UI
2. Скачайте новое видео
3. Проверьте, что новое видео сохраняется в ту же папку (по `initialName`)

### Тест 3: Диагностический endpoint

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/diag/storage | jq '.testUser.channelFolderKey'
```

## 📋 Что проверить после деплоя

- [ ] Новые каналы создают папки в формате `{channelSlug}__{channelId}`
- [ ] В логах видно `channelFolderKey` и `initialName`
- [ ] Миграция выполнена успешно (проверить отчёт)
- [ ] Старые папки `{channelId}` переименованы или перемещены
- [ ] Диагностический endpoint `/api/diag/storage` показывает правильные пути
- [ ] Переименование канала не меняет папку (новые видео в той же папке)

## 🔍 PowerShell команды для проверки

```powershell
# Подключиться к Synology
ssh adminv@192.168.100.222

# Посмотреть логи
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs backend --tail=100 | grep channelFolderKey"

# Проверить структуру папок
ssh adminv@192.168.100.222 "find /volume1/docker/shortsai/backend/storage/videos/users -type d -path '*/channels/*' | head -20"

# Найти MP4 файлы
ssh adminv@192.168.100.222 "find /volume1/docker/shortsai/backend/storage/videos/users -name '*.mp4' -type f | head -10"
```



