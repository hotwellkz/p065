# Проверка хранилища после исправления STORAGE_ROOT

## ✅ Что исправлено

1. `STORAGE_ROOT` изменён с `/data/shortsai/videos` на `/app/storage/videos`
2. Это соответствует volume mapping: `./storage:/app/storage`

## Команды для проверки

### 1. Перезапустить контейнер (выполнить вручную через SSH)

```bash
ssh adminv@192.168.100.222
cd /volume1/docker/shortsai/backend
sudo /usr/local/bin/docker compose restart backend
```

### 2. Проверить логи инициализации StorageService

```bash
sudo /usr/local/bin/docker compose logs backend --tail=100 | grep -E "STORAGE|StorageService initialized"
```

**Ожидаемый вывод:**
```
[STORAGE] StorageService initialized {
  root: '/app/storage',
  videosRoot: '/app/storage/videos',
  ...
}
```

### 3. Проверить файл на хосте (после нового сохранения)

```bash
# Проверить структуру папок
ls -la /volume1/docker/shortsai/backend/storage/videos/users/

# Найти все MP4 файлы
find /volume1/docker/shortsai/backend/storage/videos -name "*.mp4" -type f

# Проверить конкретный файл
ls -lh /volume1/docker/shortsai/backend/storage/videos/users/wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/zyt00D2jzJQCp2olEpeK/inbox/
```

### 4. Проверить файл внутри контейнера

```bash
sudo /usr/local/bin/docker compose exec backend ls -lh /app/storage/videos/users/wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/zyt00D2jzJQCp2olEpeK/inbox/
```

### 5. Проверить диагностический endpoint

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/diag/storage
```

**Ожидаемый ответ:**
```json
{
  "success": true,
  "storageRoot": "/app/storage",
  "videosRoot": "/app/storage/videos",
  "status": {
    "root": { "exists": true, "writable": true },
    "videosRoot": { "exists": true, "writable": true },
    ...
  }
}
```

## Миграция старого файла

Файл, сохранённый по старому пути `/data/shortsai/videos/...`, остался внутри контейнера.
После перезапуска новые файлы будут сохраняться в `/app/storage/videos/...` и появятся на хосте.

Для миграции старого файла можно выполнить (внутри контейнера):

```bash
sudo /usr/local/bin/docker compose exec backend sh -c '
  if [ -f /data/shortsai/videos/users/wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/zyt00D2jzJQCp2olEpeK/inbox/1766456915000_zvohso61.mp4 ]; then
    mkdir -p /app/storage/videos/users/wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/zyt00D2jzJQCp2olEpeK/inbox/
    cp /data/shortsai/videos/users/wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/zyt00D2jzJQCp2olEpeK/inbox/* /app/storage/videos/users/wJVWf7qvuoXYaVJSZbEGpNHUtva2/channels/zyt00D2jzJQCp2olEpeK/inbox/
    echo "Файл скопирован"
  else
    echo "Старый файл не найден"
  fi
'
```

## Что должно работать после исправления

1. ✅ Новые видео сохраняются в `/app/storage/videos/...` (внутри контейнера)
2. ✅ Файлы появляются на хосте в `/volume1/docker/shortsai/backend/storage/videos/...`
3. ✅ Логи показывают правильные пути без дублирования `videos/videos`
4. ✅ Диагностический endpoint `/api/diag/storage` показывает правильные пути


