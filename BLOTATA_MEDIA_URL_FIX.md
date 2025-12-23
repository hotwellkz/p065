# Исправление mediaUrl для Blotato

## Проблема
Blotato падает с `BLOTATA_MEDIA_UPLOAD_FAILED: Failed to read media metadata`, потому что `mediaUrl` генерируется как `http://185.104.248.130:5001/api/media/...` и недоступен извне.

## Решение

### 1. Изменения в коде
- ✅ Исправлен `backend/src/services/blottataLocalFileProcessor.ts`
- ✅ Добавлена поддержка `PUBLIC_BASE_URL` (приоритет над `BACKEND_URL`)
- ✅ Добавлена проверка на HTTPS и предупреждения

### 2. Добавить в `.env.production` на Synology

```bash
PUBLIC_BASE_URL=https://api.hotwell.synology.me
```

**Приоритет переменных:**
1. `PUBLIC_BASE_URL` (новый, рекомендуется)
2. `BACKEND_URL` (fallback)
3. `FRONTEND_ORIGIN` с заменой порта (fallback)
4. Ошибка, если ничего не указано

### 3. Проверка роута /api/media

Роут уже настроен и поддерживает:
- ✅ Range-запросы (206 Partial Content)
- ✅ Правильный Content-Type: video/mp4
- ✅ Защиту от path traversal
- ✅ Логирование

### 4. Проверка nginx/reverse proxy

Убедитесь что в Synology Reverse Proxy настроено:
- **Источник:** `https://api.hotwell.synology.me`
- **Назначение:** `http://localhost:3000` (или IP:порт backend)
- **Путь:** `/api/*` должен проксироваться на backend
- **Особенно:** `/api/media/*` должен работать

### 5. Команды проверки

**После добавления PUBLIC_BASE_URL и перезапуска контейнера:**

```bash
# 1. Health check
curl -I https://api.hotwell.synology.me/health
# Ожидается: HTTP/1.1 200 OK

# 2. Проверка медиа роута (замените на реальные значения)
curl -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4
# Ожидается:
# HTTP/1.1 200 OK (или 206 Partial Content)
# Content-Type: video/mp4
# Content-Length: <размер файла>
# Accept-Ranges: bytes

# 3. Проверка Range-запроса
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4
# Ожидается:
# HTTP/1.1 206 Partial Content
# Content-Range: bytes 0-1023/<общий размер>
# Content-Length: 1024

# 4. Проверка скачивания первых 1024 байт
curl -r 0-1023 https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4 | wc -c
# Ожидается: 1024
```

### 6. Шаги развертывания

1. **Добавить PUBLIC_BASE_URL в .env.production:**
```bash
ssh -p 777 admin@hotwell.synology.me
cd /volume1/docker/shortsai/backend
echo "PUBLIC_BASE_URL=https://api.hotwell.synology.me" >> .env.production
```

2. **Загрузить исправленный файл:**
```bash
# (уже загружен через PowerShell)
```

3. **Пересобрать контейнер:**
```bash
sudo /usr/local/bin/docker compose down
sudo /usr/local/bin/docker compose build --no-cache
sudo /usr/local/bin/docker compose up -d
```

4. **Проверить логи:**
```bash
sudo /usr/local/bin/docker compose logs --tail=50 backend | grep -i "media\|blotato\|public"
```

5. **Проверить работу:**
```bash
# Выполнить команды из пункта 5
```

### 7. Ожидаемый результат

После исправления в логах должно быть:
```
BlottataLocalFileProcessor: Media URL generated {
  mediaUrl: "https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4"
}
BlottataPublisherService: Uploading media { mediaUrl: "https://..." }
BlottataPublisherService: Media uploaded successfully
```

И файл должен успешно публиковаться через Blotato.





