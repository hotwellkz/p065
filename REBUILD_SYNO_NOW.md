# Инструкция по пересборке контейнера на Synology

## Файлы загружены:
✅ backend/src/services/storage/userChannelStorage.ts
✅ backend/src/services/channelDeletionService.ts
✅ backend/src/routes/channelRoutes.ts
✅ backend/src/services/autoSendScheduler.ts
✅ backend/src/services/scheduledTasks.ts
✅ backend/src/services/videoDownloadService.ts

## Команды для выполнения на Synology:

Подключитесь к серверу:
```bash
ssh -p 777 admin@hotwell.synology.me
```

Выполните следующие команды (потребуется пароль для sudo):
```bash
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
sudo /usr/local/bin/docker compose ps
sudo /usr/local/bin/docker compose logs --tail=50 backend
```

## Проверка после пересборки:

1. **Проверьте статус контейнера:**
```bash
sudo /usr/local/bin/docker compose ps
```

2. **Проверьте логи:**
```bash
sudo /usr/local/bin/docker compose logs --tail=100 backend | grep -i "storage\|channel\|deletion\|uploaded"
```

3. **Проверьте health endpoint:**
```bash
curl -I http://127.0.0.1:3000/health
```

## Ожидаемые изменения:

- Пути к хранилищу теперь вычисляются автоматически
- `archiveDir` использует `uploaded` вместо `Загруженные - {channelName}`
- При удалении канала добавлена защита от path traversal
- Убрана валидация `driveInputFolderId`/`driveArchiveFolderId`





