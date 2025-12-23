# План миграции системы хранения видео

## ✅ Выполнено

1. ✅ Создан единый `StorageService` с правильной структурой
2. ✅ Исправлен `docker-compose.yml` - правильный volume маппинг
3. ✅ Добавлен диагностический endpoint `GET /api/diag/storage`
4. ✅ Добавлена функция `generateVideoId()` для стабильных ID

## 🔄 В процессе

### Интеграция StorageService в обработчики

Нужно заменить старый код в следующих местах:

1. **`backend/src/routes/telegramRoutes.ts`**:
   - `POST /api/telegram/fetchAndSaveToServer` (строка ~1200)
   - `POST /api/telegram/importVideo` (строка ~1700)
   - `POST /api/telegram/fetchLatestVideoToDrive` (строка ~400)

2. **`backend/src/services/videoDownloadService.ts`**:
   - `downloadAndSaveToLocal` (строка ~1500)

## 📋 Структура новой системы

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

## 🔧 Команды PowerShell для проверки

### 1. Перезапуск контейнера после изменений

```powershell
# Загрузить изменения на сервер
Get-Content backend\docker-compose.yml | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/docker-compose.yml"
Get-Content backend\src\services\storageService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/storageService.ts"

# SSH на сервер и перезапустить
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose up -d --build
```

### 2. Проверка диагностики storage

```powershell
# После перезапуска проверить endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" http://192.168.100.222:3000/api/diag/storage
```

### 3. Проверка файлов на Synology

```powershell
# SSH и проверка структуры
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
ls -la storage/videos/users/
find storage/videos -type f -name "*.mp4" | head -10
```

### 4. Просмотр логов

```powershell
ssh adminv@192.168.100.222 "cd /volume1/docker/shortsai/backend && sudo /usr/local/bin/docker compose logs --tail=100 backend | grep -E 'STORAGE|storage'"
```

## 📝 Следующие шаги

1. Интегрировать StorageService в `fetchAndSaveToServer`
2. Интегрировать StorageService в `importVideo`
3. Интегрировать StorageService в `downloadAndSaveToLocal`
4. Создать скрипт миграции старых файлов
5. Добавить логирование абсолютных путей при каждом сохранении


