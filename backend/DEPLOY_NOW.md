# 🚀 Деплой обновлений на сервер

## Файлы для загрузки

1. ✅ `backend/docker-compose.yml` - исправлен volume маппинг
2. ✅ `backend/src/services/storageService.ts` - новый единый сервис
3. ✅ `backend/src/routes/telegramRoutes.ts` - интегрирован StorageService в fetchAndSaveToServer
4. ✅ `backend/src/routes/diagRoutes.ts` - добавлен endpoint /api/diag/storage
5. ✅ `backend/src/utils/fileUtils.ts` - добавлена функция generateVideoId
6. ✅ `backend/src/services/videoDownloadService.ts` - обновлён downloadAndSaveToLocal

## Команды PowerShell для загрузки

```powershell
# 1. docker-compose.yml
Get-Content backend\docker-compose.yml | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/docker-compose.yml"

# 2. storageService.ts
Get-Content backend\src\services\storageService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/storageService.ts"

# 3. telegramRoutes.ts
Get-Content backend\src\routes\telegramRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/telegramRoutes.ts"

# 4. diagRoutes.ts
Get-Content backend\src\routes\diagRoutes.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/routes/diagRoutes.ts"

# 5. fileUtils.ts
Get-Content backend\src\utils\fileUtils.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/utils/fileUtils.ts"

# 6. videoDownloadService.ts
Get-Content backend\src\services\videoDownloadService.ts | ssh adminv@192.168.100.222 "cat > /volume1/docker/shortsai/backend/src/services/videoDownloadService.ts"
```

## После загрузки - перезапуск

```bash
# SSH на сервер
ssh adminv@192.168.100.222

# Перейти в директорию
cd /volume1/docker/shortsai/backend

# Убедиться что папка storage существует
mkdir -p storage
chmod 777 storage

# Пересобрать и запустить
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

## Проверка после запуска

```bash
# Проверить логи StorageService
sudo /usr/local/bin/docker compose logs --tail=50 backend | grep -E "STORAGE|StorageService"

# Должно быть:
# [STORAGE] root=...
# [STORAGE] videosRoot=...
# [STORAGE] StorageService initialized

# Проверить что контейнер работает
sudo /usr/local/bin/docker compose ps
```

## Тест сохранения видео

После перезапуска попробуйте сохранить видео через UI. В логах должно быть:

```
[STORAGE] save start dest=...
[STORAGE] save done bytes=... dest=...
[STORAGE] resolvedDest=...
```

И файл должен появиться в:
```
/volume1/docker/shortsai/backend/storage/videos/users/{userId}/channels/{channelId}/inbox/{videoId}.mp4
```


