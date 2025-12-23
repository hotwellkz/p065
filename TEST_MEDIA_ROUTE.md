# Проверка медиа роута

## Статус развертывания: ✅

- ✅ PUBLIC_BASE_URL добавлен в .env.production
- ✅ Контейнер пересобран и запущен
- ✅ Health check работает (200 OK)
- ✅ Роут /api/media зарегистрирован

## Команды для проверки медиа роута

### 1. Найдите реальный файл в storage

```bash
# Найти все MP4 файлы
find /volume1/docker/shortsai/backend/storage/videos -name '*.mp4' -type f

# Или посмотреть структуру папок
ls -la /volume1/docker/shortsai/backend/storage/videos/
ls -la /volume1/docker/shortsai/backend/storage/videos/*/
```

### 2. Определите путь (userSlug/channelSlug/fileName)

Например, если файл находится в:
```
/volume1/docker/shortsai/backend/storage/videos/hotwell-kz-at-gmail-com/live-G8AXD07P/video.mp4
```

То путь для URL будет:
```
hotwell-kz-at-gmail-com/live-G8AXD07P/video.mp4
```

### 3. Проверьте медиа роут

```bash
# Замените на реальные значения
curl -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4
```

**Ожидается:**
```
HTTP/2 200
Content-Type: video/mp4
Content-Length: <размер файла>
Accept-Ranges: bytes
```

### 4. Проверьте Range-запрос

```bash
curl -r 0-1023 -I https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4
```

**Ожидается:**
```
HTTP/2 206
Content-Range: bytes 0-1023/<общий размер>
Content-Length: 1024
Content-Type: video/mp4
Accept-Ranges: bytes
```

### 5. Проверьте скачивание первых 1024 байт

```bash
curl -r 0-1023 https://api.hotwell.synology.me/api/media/{userSlug}/{channelSlug}/{fileName}.mp4 | wc -c
```

**Ожидается:** `1024`

### 6. Проверьте логи backend

```bash
sudo /usr/local/bin/docker compose logs --tail=100 backend | grep -i "media\|MediaRoutes"
```

**Ожидаемые логи:**
```
MediaRoutes: Request received { userSlug: '...', channelSlug: '...', fileName: '...' }
MediaRoutes: File exists { ... }
MediaRoutes: File served (200 OK) { ... }
```

## Если файлов нет в storage

Если в storage нет файлов, можно:

1. **Создать тестовый файл:**
```bash
# Создать тестовую структуру
mkdir -p /volume1/docker/shortsai/backend/storage/videos/test-user/test-channel

# Создать небольшой тестовый MP4 (или скопировать существующий)
# Для теста можно использовать любой небольшой MP4 файл
```

2. **Или дождаться автоматической загрузки видео** через систему

## Проверка после публикации

После успешной публикации через Blotato проверьте логи:

```bash
sudo /usr/local/bin/docker compose logs --tail=200 backend | grep -i "blotato\|media\|upload"
```

**Ожидаемые логи:**
```
BlottataLocalFileProcessor: Media URL generated {
  mediaUrl: "https://api.hotwell.synology.me/api/media/..."
}
BlottataPublisherService: Uploading media { mediaUrl: "https://..." }
BlottataPublisherService: Media uploaded successfully
```





